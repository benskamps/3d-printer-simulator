import { ThermalModel, ThermalModelOptions } from '../../core/thermal/ThermalModel';
import { FailureManager } from '../../core/failures/FailureManager';
import { TelemetryStore } from '../../core/telemetry/TelemetryStore';
import { GCodeExecutor } from '../../core/gcode/GCodeExecutor';
import { ExecutionState, GCodeModelSummary } from '../../core/gcode/types';
import { SAMPLE_MODELS } from '../../core/gcode/sampleModels';
import { ToolpathBufferManager } from '../../viewport/ToolpathBufferManager';
import { AxisCoordinates, ToolpathSegment } from '../../core/kinematics/types';
import { PrinterTelemetryState, TerminalEntry } from '../../core/telemetry/types';
import { NozzleClogMode } from '../../core/failures/types';

export interface HarnessOptions {
  thermal?: ThermalModelOptions;
  initialCapacity?: number;
  chunkSize?: number;
}

/**
 * Opaque-Box E2E Test Fixture and Simulator Harness.
 *
 * Instantiates the complete 3D printer simulator stack (Kinematics, G-code execution,
 * Thermal ODE/PID, Hardware Failures, Telemetry Store, and Toolpath Buffers).
 * Advances deterministic virtual time, dispatches simulated user interactions,
 * and enables verification of all requirement contracts.
 */
export class TestSimulatorHarness {
  public readonly thermal: ThermalModel;
  public readonly failures: FailureManager;
  public readonly store: TelemetryStore;
  public readonly executor: GCodeExecutor;
  public readonly toolpaths: ToolpathBufferManager;

  private totalVirtualTime: number = 0;
  private activeSegment: ToolpathSegment | null = null;
  private modelSummary: GCodeModelSummary | null = null;

  constructor(options?: HarnessOptions) {
    this.thermal = new ThermalModel(options?.thermal);
    this.failures = new FailureManager(this.thermal);
    this.store = new TelemetryStore();
    this.toolpaths = new ToolpathBufferManager({
      initialCapacity: options?.initialCapacity ?? 10_000,
      chunkSize: options?.chunkSize ?? 2_000,
    });

    this.executor = new GCodeExecutor({}, this.thermal, this.failures);

    this.wireCallbacks();
    this.syncTelemetry();
  }

  private wireCallbacks(): void {
    this.executor.setCallbacks({
      onToolpathSegment: (segment: ToolpathSegment) => {
        this.activeSegment = segment;
        this.toolpaths.appendSegment(segment);
      },
      onPositionUpdate: (pos: AxisCoordinates) => {
        this.store.updateNominalPosition(this.executor.getKinematics().getState().currentPosition);
        this.store.updatePhysicalPosition(pos);
      },
      onStateChange: (state: ExecutionState) => {
        if (state === ExecutionState.RUNNING) {
          this.store.setStatus('PRINTING', 'Printing active');
        } else if (state === ExecutionState.PAUSED) {
          this.store.setStatus('PAUSED', 'Print paused');
        } else if (state === ExecutionState.COMPLETED) {
          this.store.setStatus('IDLE', 'Print completed');
        } else if (state === ExecutionState.ABORTED) {
          this.store.setStatus('IDLE', 'Print aborted');
        } else if (state === ExecutionState.ERROR) {
          this.store.setStatus('HALTED', 'Firmware error halt');
        }
      },
      onTerminalOutput: (line: string) => {
        const type: TerminalEntry['type'] = line.startsWith('> ')
          ? 'command'
          : line.startsWith('ok') || line.startsWith('T:')
          ? 'response'
          : line.startsWith('Error:') || line.startsWith('!!')
          ? 'error'
          : 'echo';
        this.store.appendTerminal(line, type);
      },
      onProgressUpdate: (progress) => {
        this.store.updateJobMetrics({
          currentLayer: progress.currentLayer,
          totalLayers: progress.totalLayers,
          progressPercent: progress.percentage,
          elapsedSeconds: progress.elapsedSeconds,
          estimatedRemainingSeconds: progress.remainingSeconds,
          filamentUsedMm: progress.filamentConsumedMm,
          filamentUsedGrams: Math.round(progress.filamentConsumedMm * 0.003 * 10) / 10,
        });
      },
      onLayerChange: (activeLayer, totalLayers) => {
        this.store.updateJobMetrics({ currentLayer: activeLayer, totalLayers });
      },
    });
  }

  /**
   * Synchronize the central TelemetryStore with all subsystems.
   */
  public syncTelemetry(): void {
    const hotend = this.thermal.getHotend();
    const bed = this.thermal.getBed();
    this.store.updateHotend(hotend);
    this.store.updateBed(bed);
    this.store.recordThermalSample();
    this.store.setFanSpeed(this.thermal.getFanSpeed());

    this.store.updateFailures(this.failures.getConfig());
    const kState = this.executor.getKinematics().getState();
    this.store.updateHomedAxes(kState.isHomed);
    this.store.updateNominalPosition(kState.currentPosition);
    this.store.updatePhysicalPosition(this.executor.getKinematics().getPhysicalPosition());

    const execState = this.executor.getState();
    if (this.thermal.isThermalRunaway() || execState === ExecutionState.ERROR) {
      this.store.setStatus('HALTED', this.thermal.getErrorReason() || 'Printer Halted');
    } else if (execState === ExecutionState.RUNNING) {
      if (
        (hotend.target > 30 && Math.abs(hotend.actual - hotend.target) > 2) ||
        (bed.target > 30 && Math.abs(bed.actual - bed.target) > 2)
      ) {
        this.store.setStatus('HEATING', 'Heating to setpoints...');
      } else {
        this.store.setStatus('PRINTING', 'Printing active');
      }
    } else if (execState === ExecutionState.PAUSED) {
      this.store.setStatus('PAUSED', 'Print paused');
    } else if (hotend.isHeating || bed.isHeating) {
      this.store.setStatus('HEATING', 'Preheating...');
    } else if (execState === ExecutionState.COMPLETED) {
      this.store.setStatus('IDLE', 'Print completed');
    } else {
      this.store.setStatus('IDLE', 'Ready');
    }
  }

  // ==========================================
  // Virtual Time Simulation
  // ==========================================

  /**
   * Advance virtual time by specified seconds using deterministic sub-steps.
   * Runs motion execution and thermal physics integration.
   */
  public advanceTime(seconds: number, stepDt: number = 0.02): void {
    if (seconds <= 0) return;

    let remaining = seconds;
    while (remaining > 0.0001) {
      const dt = Math.min(remaining, stepDt);
      this.totalVirtualTime += dt;

      const execState = this.executor.getState();
      if (execState === ExecutionState.RUNNING || execState === ExecutionState.STEPPING) {
        this.executor.update(dt);
      } else {
        this.thermal.update(dt);
      }

      if (this.thermal.isThermalRunaway() && execState !== ExecutionState.ERROR) {
        const preReason = this.thermal.getErrorReason();
        this.executor.emergencyStop(preReason || 'Thermal Runaway Watchdog Triggered');
        if (preReason) {
          (this.thermal as any).errorReason = preReason;
        }
        this.store.setStatus('HALTED', preReason || 'Thermal Runaway');
      }

      remaining -= dt;
    }

    this.syncTelemetry();
  }

  /**
   * Run simulation until condition evaluates to true or maxVirtualSeconds is reached.
   * Returns true if condition was satisfied, false if timed out.
   */
  public runUntil(
    condition: (harness: TestSimulatorHarness) => boolean,
    maxVirtualSeconds: number = 60,
    stepDt: number = 0.02
  ): boolean {
    let elapsed = 0;
    while (elapsed < maxVirtualSeconds) {
      if (condition(this)) {
        return true;
      }
      this.advanceTime(stepDt, stepDt);
      elapsed += stepDt;
    }
    return condition(this);
  }

  /**
   * Run simulation until print reaches COMPLETED state or maxVirtualSeconds is reached.
   */
  public runUntilComplete(maxVirtualSeconds: number = 300, stepDt: number = 0.02): boolean {
    return this.runUntil(
      () => this.executor.getState() === ExecutionState.COMPLETED,
      maxVirtualSeconds,
      stepDt
    );
  }

  // ==========================================
  // Simulated User Interactions
  // ==========================================

  public async loadGCode(gcodeText: string, fileName: string = 'model.gcode'): Promise<GCodeModelSummary> {
    this.toolpaths.clear();
    const summary = await this.executor.loadGCode(gcodeText, fileName);
    this.modelSummary = summary;
    this.store.updateJobMetrics({
      filename: fileName,
      totalLayers: summary.totalLayers,
      currentLayer: 0,
      progressPercent: 0,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: summary.estimatedPrintTimeSeconds,
      filamentUsedMm: 0,
      filamentUsedGrams: 0,
    });
    this.syncTelemetry();
    return summary;
  }

  public async loadSampleModel(modelId: 'cube' | 'benchy' | 'quick_pad'): Promise<GCodeModelSummary> {
    const sample = SAMPLE_MODELS[modelId];
    if (!sample) {
      throw new Error(`Unknown sample model ID: ${modelId}`);
    }
    return this.loadGCode(sample.getGCode(), `${sample.name}.gcode`);
  }

  public startPrint(): void {
    this.executor.startPrint();
    this.syncTelemetry();
  }

  public pausePrint(): void {
    this.executor.pausePrint();
    this.syncTelemetry();
  }

  public resumePrint(): void {
    this.executor.resumePrint();
    this.syncTelemetry();
  }

  public stepPrint(): void {
    this.executor.stepForward();
    this.syncTelemetry();
  }

  public abortPrint(): void {
    this.executor.abortPrint();
    this.toolpaths.clear();
    this.syncTelemetry();
  }

  public emergencyStop(reason: string = 'M112 Emergency Stop'): void {
    this.executor.emergencyStop(reason);
    this.store.setStatus('HALTED', reason);
    this.store.appendTerminal(`!! Error: ${reason}`, 'error');
    this.syncTelemetry();
  }

  public resetFaults(): void {
    this.thermal.resetFaults();
    this.failures.resetAllFailures();
    (this.executor as any).state = ExecutionState.IDLE;
    this.toolpaths.setFailureVisual('spaghetti', false);
    this.toolpaths.setFailureVisual('layer_shift', false);
    this.executor.getKinematics().setLayerShiftOffset(0, 0);
    this.store.setStatus('IDLE', 'Faults cleared, printer ready');
    this.store.appendTerminal('echo: Printer faults cleared, system ready.', 'echo');
    this.syncTelemetry();
  }

  public setSpeedMultiplier(multiplier: number): void {
    this.executor.setSpeedMultiplier(multiplier);
    this.store.updateJobMetrics({ speedMultiplier: this.executor.getSpeedMultiplier() });
    this.store.appendTerminal(`> M220 S${Math.round(multiplier * 100)}`, 'command');
    this.store.appendTerminal('ok', 'response');
  }

  public jog(axis: 'X' | 'Y' | 'Z', distance: number): void {
    const curPos = this.executor.getKinematics().getState().currentPosition;
    const targetVal =
      axis === 'X' ? curPos.x + distance : axis === 'Y' ? curPos.y + distance : curPos.z + distance;
    const clampedTarget =
      axis === 'Z'
        ? Math.max(0, Math.min(250, targetVal))
        : Math.max(0, Math.min(220, targetVal));

    this.sendCommand(`G1 ${axis}${clampedTarget.toFixed(2)} F3000`);
    this.syncTelemetry();
  }

  public jogXY(dx: number, dy: number): void {
    const curPos = this.executor.getKinematics().getState().currentPosition;
    const targetX = Math.max(0, Math.min(220, curPos.x + dx));
    const targetY = Math.max(0, Math.min(220, curPos.y + dy));
    this.sendCommand(`G1 X${targetX.toFixed(2)} Y${targetY.toFixed(2)} F3000`);
    this.syncTelemetry();
  }

  public home(axes?: { x?: boolean; y?: boolean; z?: boolean }): void {
    if (!axes || (axes.x && axes.y && axes.z)) {
      this.sendCommand('G28');
    } else {
      let cmd = 'G28';
      if (axes.x) cmd += ' X0';
      if (axes.y) cmd += ' Y0';
      if (axes.z) cmd += ' Z0';
      this.sendCommand(cmd);
    }
    this.syncTelemetry();
  }

  public extrude(amountMm: number): boolean {
    const hotendActual = this.thermal.getHotend().actual;
    if (hotendActual < 170.0) {
      this.store.appendTerminal(
        `echo: cold extrusion prevented (hotend temp = ${hotendActual.toFixed(1)}°C < 170.0°C)`,
        'echo'
      );
      return false;
    }
    const curPos = this.executor.getKinematics().getState().currentPosition;
    this.sendCommand(`G1 E${(curPos.e + amountMm).toFixed(2)} F300`);
    this.syncTelemetry();
    return true;
  }

  public retract(amountMm: number): void {
    const curPos = this.executor.getKinematics().getState().currentPosition;
    this.sendCommand(`G1 E${(curPos.e - amountMm).toFixed(2)} F1800`);
    this.syncTelemetry();
  }

  public disableSteppers(): void {
    this.sendCommand('M84');
    this.syncTelemetry();
  }

  public setHotendTarget(temp: number): void {
    this.thermal.setHotendTarget(temp);
    this.store.appendTerminal(`> M104 S${temp}`, 'command');
    this.store.appendTerminal('ok', 'response');
    this.syncTelemetry();
  }

  public setBedTarget(temp: number): void {
    this.thermal.setBedTarget(temp);
    this.store.appendTerminal(`> M140 S${temp}`, 'command');
    this.store.appendTerminal('ok', 'response');
    this.syncTelemetry();
  }

  public setFanSpeed(duty: number): void {
    this.thermal.setFanSpeed(duty);
    this.executor.getKinematics().setFanSpeed(duty);
    this.store.setFanSpeed(duty);
    this.store.appendTerminal(`> M106 S${Math.round(duty * 255)}`, 'command');
    this.store.appendTerminal('ok', 'response');
    this.syncTelemetry();
  }

  public sendCommand(command: string): string {
    const result = this.executor.executeImmediateCommand(command);
    this.syncTelemetry();
    return result;
  }

  public clearTerminal(): void {
    this.store.clearTerminal();
  }

  public setNozzleClog(mode: NozzleClogMode): void {
    this.failures.setNozzleClog(mode);
    this.toolpaths.setFailureVisual('clog', mode === 'FULL');
    this.store.updateFailures(this.failures.getConfig());
    this.store.appendTerminal(`// failure: nozzle clog set to ${mode}`, 'echo');
  }

  public setSpaghettiMode(active: boolean): void {
    this.failures.setSpaghettiMode(active);
    this.toolpaths.setFailureVisual('spaghetti', active);
    this.store.updateFailures(this.failures.getConfig());
    this.store.appendTerminal(`// failure: spaghetti mode ${active ? 'ACTIVE' : 'INACTIVE'}`, 'echo');
  }

  public triggerLayerShift(dx: number, dy: number): void {
    this.failures.triggerLayerShift(dx, dy);
    const shift = this.failures.getConfig().layerShift;
    this.executor.getKinematics().setLayerShiftOffset(shift.x, shift.y);
    this.toolpaths.setLayerShiftOffset(shift.x, shift.y);
    this.store.updateFailures(this.failures.getConfig());
    this.store.appendTerminal(`// failure: layer shift offset applied (+${dx}X, +${dy}Y)`, 'echo');
    this.syncTelemetry();
  }

  public setFilamentRunout(active: boolean): void {
    this.failures.setFilamentRunout(active);
    this.store.updateFailures(this.failures.getConfig());
    this.store.appendTerminal(`// failure: filament runout ${active ? 'TRIPPED' : 'CLEARED'}`, 'echo');
  }

  public simulateThermalRunaway(heater: 'hotend' | 'bed' = 'hotend'): void {
    this.failures.simulateThermalRunaway(heater);
    this.store.updateFailures(this.failures.getConfig());
    this.store.appendTerminal(`// failure: simulated open-loop heater runaway on ${heater}`, 'echo');
  }

  public resetFailures(): void {
    this.failures.resetAllFailures();
    this.toolpaths.setFailureVisual('spaghetti', false);
    this.toolpaths.setFailureVisual('layer_shift', false);
    this.store.updateFailures(this.failures.getConfig());
    this.store.appendTerminal('// failure: all hardware failure modes reset', 'echo');
  }

  public setLayerFilter(minLayer: number, maxLayer: number): void {
    this.toolpaths.setLayerFilter(minLayer, maxLayer);
  }

  public setRenderMode(mode: 'lines' | 'volumetric'): void {
    this.toolpaths.setRenderMode(mode);
  }

  // ==========================================
  // Telemetry & Assertion Getters
  // ==========================================

  public getState(): PrinterTelemetryState {
    return this.store.getState();
  }

  public getNominalPosition(): AxisCoordinates {
    return { ...this.executor.getKinematics().getState().currentPosition };
  }

  public getPhysicalPosition(): AxisCoordinates {
    return { ...this.executor.getKinematics().getPhysicalPosition() };
  }

  public getHotendTemp(): { actual: number; target: number; power: number } {
    const h = this.thermal.getHotend();
    return { actual: h.actual, target: h.target, power: h.power };
  }

  public getBedTemp(): { actual: number; target: number; power: number } {
    const b = this.thermal.getBed();
    return { actual: b.actual, target: b.target, power: b.power };
  }

  public getTerminalLines(): string[] {
    return this.store.getState().terminalLog.map((t) => t.message);
  }

  public getLastTerminalLine(): string | undefined {
    const log = this.store.getState().terminalLog;
    return log.length > 0 ? log[log.length - 1].message : undefined;
  }

  public getToolpathCount(): number {
    return this.toolpaths.getSegmentCount();
  }

  public getVolumetricInstanceCount(): number {
    return this.toolpaths.getTotalVolumetricInstances();
  }

  public isHomed(): { x: boolean; y: boolean; z: boolean } {
    return { ...this.executor.getKinematics().getState().isHomed };
  }

  public canExtrude(): boolean {
    return this.thermal.canExtrude();
  }

  public getActiveSegment(): ToolpathSegment | null {
    return this.activeSegment;
  }

  public getModelSummary(): GCodeModelSummary | null {
    return this.modelSummary;
  }

  public getTotalVirtualTime(): number {
    return this.totalVirtualTime;
  }

  public dispose(): void {
    this.toolpaths.dispose();
  }
}
