import {
  ParsedGCodeLine,
  GCodeModelSummary,
  ExecutionState,
  PrintProgress,
  IEngineControls,
  IThermalSubsystemBridge,
  IFailureSimulatorBridge,
} from './types';
import { GCodeParser } from './GCodeParser';
import { CartesianKinematics } from '../kinematics/CartesianKinematics';
import { MotionInterpolator } from '../kinematics/MotionInterpolator';
import { AxisCoordinates, ToolpathSegment, ToolpathType } from '../kinematics/types';

export interface GCodeExecutorCallbacks {
  onToolpathSegment?: (segment: ToolpathSegment) => void;
  onPositionUpdate?: (position: AxisCoordinates) => void;
  onStateChange?: (state: ExecutionState) => void;
  onTerminalOutput?: (line: string) => void;
  onProgressUpdate?: (progress: PrintProgress) => void;
  onLayerChange?: (activeLayer: number, totalLayers: number) => void;
}

export class GCodeExecutor implements IEngineControls {
  private parser: GCodeParser;
  private kinematics: CartesianKinematics;
  private interpolator: MotionInterpolator;

  private state: ExecutionState = ExecutionState.IDLE;
  private speedMultiplier: number = 1; // 1x, 5x, 20x, 100x

  private parsedLines: ParsedGCodeLine[] = [];
  private currentLineIndex: number = 0;
  private modelSummary: GCodeModelSummary | null = null;
  private plannerPosition: AxisCoordinates = { x: 0, y: 0, z: 0, e: 0 };

  // Print progress tracking
  private activeLayerIndex: number = 0;
  private totalLayers: number = 0;
  private filamentConsumedMm: number = 0;
  private elapsedSeconds: number = 0;

  // Temperature wait state (M109 / M190)
  private isWaitingForTemp: boolean = false;
  private waitingHeater: 'hotend' | 'bed' | null = null;
  private targetTempSetpoint: number = 0;
  private lastTempTelemetryTime: number = 0;

  // Subsystem bridges
  private thermalBridge: IThermalSubsystemBridge | null = null;
  private failureBridge: IFailureSimulatorBridge | null = null;

  // Listeners & Callbacks
  private callbacks: GCodeExecutorCallbacks = {};
  private terminalLog: string[] = [];

  constructor(
    callbacks?: GCodeExecutorCallbacks,
    thermalBridge?: IThermalSubsystemBridge,
    failureBridge?: IFailureSimulatorBridge
  ) {
    this.parser = new GCodeParser();
    this.kinematics = new CartesianKinematics();
    this.interpolator = new MotionInterpolator();
    if (callbacks) this.callbacks = callbacks;
    if (thermalBridge) this.thermalBridge = thermalBridge;
    if (failureBridge) this.failureBridge = failureBridge;
  }

  public setCallbacks(callbacks: GCodeExecutorCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public setThermalBridge(bridge: IThermalSubsystemBridge): void {
    this.thermalBridge = bridge;
  }

  public setFailureBridge(bridge: IFailureSimulatorBridge): void {
    this.failureBridge = bridge;
  }

  public getKinematics(): CartesianKinematics {
    return this.kinematics;
  }

  public getInterpolator(): MotionInterpolator {
    return this.interpolator;
  }

  public getModelSummary(): GCodeModelSummary | null {
    return this.modelSummary;
  }

  public getState(): ExecutionState {
    return this.state;
  }

  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  public getTargetTempSetpoint(): number {
    return this.targetTempSetpoint;
  }

  public setSpeedMultiplier(multiplier: number): void {
    // Clamped between 0.1 and 100
    this.speedMultiplier = Math.max(0.1, Math.min(100, multiplier));
  }

  public getLogHistory(): string[] {
    return [...this.terminalLog];
  }

  public clearLog(): void {
    this.terminalLog = [];
  }

  private emitTerminal(line: string): void {
    this.terminalLog.push(line);
    if (this.callbacks.onTerminalOutput) {
      this.callbacks.onTerminalOutput(line);
    }
  }

  private setState(newState: ExecutionState): void {
    if (this.state !== newState) {
      this.state = newState;
      if (this.callbacks.onStateChange) {
        this.callbacks.onStateChange(newState);
      }
    }
  }

  /**
   * Load G-code string into executor, parse lines, and generate summary.
   */
  public async loadGCode(gcodeText: string, fileName: string = 'model.gcode'): Promise<GCodeModelSummary> {
    this.abortPrint();

    const { parsedLines, summary } = this.parser.parseDocument(gcodeText, fileName);
    this.parsedLines = parsedLines;
    this.modelSummary = summary;
    this.currentLineIndex = 0;
    this.activeLayerIndex = 0;
    this.totalLayers = summary.totalLayers;
    this.filamentConsumedMm = 0;
    this.elapsedSeconds = 0;
    this.isWaitingForTemp = false;

    this.kinematics.reset();
    this.interpolator.reset({ x: 0, y: 0, z: 0, e: 0 });
    this.plannerPosition = { x: 0, y: 0, z: 0, e: 0 };

    this.setState(ExecutionState.IDLE);
    this.emitTerminal(`echo: Loaded file "${fileName}" (${parsedLines.length} lines, ${summary.totalLayers} layers)`);

    return summary;
  }

  public startPrint(): void {
    if (this.parsedLines.length === 0) {
      this.emitTerminal('echo: No G-code file loaded to print.');
      return;
    }
    this.currentLineIndex = 0;
    this.activeLayerIndex = 0;
    this.kinematics.setActiveLayer(0, this.totalLayers);
    this.filamentConsumedMm = 0;
    this.elapsedSeconds = 0;
    this.plannerPosition = { ...this.kinematics.getState().currentPosition };
    this.setState(ExecutionState.RUNNING);
    this.emitTerminal('echo: Print started.');
  }

  public pausePrint(): void {
    if (this.state === ExecutionState.RUNNING) {
      this.setState(ExecutionState.PAUSED);
      this.emitTerminal('echo: Print paused.');
    }
  }

  public resumePrint(): void {
    if (this.state === ExecutionState.PAUSED) {
      this.setState(ExecutionState.RUNNING);
      this.emitTerminal('echo: Print resumed.');
    }
  }

  public stepForward(): void {
    if (this.state === ExecutionState.PAUSED || this.state === ExecutionState.IDLE) {
      this.setState(ExecutionState.STEPPING);
      this.update(0.1, true);
    }
  }

  public abortPrint(): void {
    if (this.state === ExecutionState.RUNNING || this.state === ExecutionState.PAUSED || this.state === ExecutionState.STEPPING) {
      this.setState(ExecutionState.ABORTED);
      this.isWaitingForTemp = false;
      this.interpolator.clearQueue();
      this.plannerPosition = { ...this.kinematics.getState().currentPosition };

      // Shut down heaters on abort
      if (this.thermalBridge) {
        this.thermalBridge.setHotendTarget(0);
        this.thermalBridge.setBedTarget(0);
      }
      this.kinematics.setFanSpeed(0);

      this.emitTerminal('echo: Print aborted.');
    }
  }

  public getProgress(): PrintProgress {
    const totalLines = this.parsedLines.length;
    const currentLine = Math.min(this.currentLineIndex, totalLines);
    const percentage = totalLines > 0 ? Math.min(100, Math.round((currentLine / totalLines) * 100)) : 0;

    const totalEst = this.modelSummary?.estimatedPrintTimeSeconds || 0;
    const remainingSeconds = Math.max(0, totalEst - this.elapsedSeconds);

    return {
      currentLine,
      totalLines,
      currentLayer: this.activeLayerIndex,
      totalLayers: this.totalLayers,
      percentage,
      elapsedSeconds: Math.round(this.elapsedSeconds),
      remainingSeconds: Math.round(remainingSeconds),
      filamentConsumedMm: Math.round(this.filamentConsumedMm * 100) / 100,
    };
  }

  /**
   * Primary simulation tick: processes motion queue and parses new commands within time budget.
   *
   * @param deltaTimeSeconds Real-time delta (e.g. 0.016s for 60fps)
   * @param isStepMode True if called from stepForward()
   */
  public update(deltaTimeSeconds: number, isStepMode: boolean = false): void {
    // Synchronize failure bridge offsets (e.g. layer shift)
    if (this.failureBridge) {
      const shift = this.failureBridge.getLayerShiftOffset(this.activeLayerIndex);
      this.kinematics.setLayerShiftOffset(shift.x, shift.y);
    }

    if (this.state !== ExecutionState.RUNNING && this.state !== ExecutionState.STEPPING && !isStepMode) {
      return;
    }

    // Tick thermal bridge physics if connected
    if (this.thermalBridge?.update) {
      this.thermalBridge.update(deltaTimeSeconds * this.speedMultiplier);
    }

    // Safety check for thermal runaway
    if (this.thermalBridge?.isThermalRunaway()) {
      this.emergencyStop('Thermal Runaway, system stopped!');
      return;
    }

    // Safety check for filament runout
    if (this.failureBridge?.isFilamentRunout()) {
      this.pausePrint();
      const currentPos = this.kinematics.getState().currentPosition;
      const parkZ = Math.min(250, currentPos.z + 5);
      const parkPos: AxisCoordinates = { x: 10, y: 10, z: parkZ, e: currentPos.e };
      this.kinematics.setCurrentPosition(parkPos);
      this.plannerPosition = { ...parkPos };
      this.interpolator.setPosition(parkPos);
      this.emitTerminal('// action:paused');
      this.emitTerminal('echo: Filament runout sensor triggered! Head parked at (10, 10).');
      if (this.callbacks.onPositionUpdate) {
        this.callbacks.onPositionUpdate(this.kinematics.getPhysicalPosition());
      }
      return;
    }

    this.elapsedSeconds += deltaTimeSeconds;

    // 1. Handle blocking temperature wait (M109 / M190)
    if (this.isWaitingForTemp && this.waitingHeater && this.thermalBridge) {
      this.lastTempTelemetryTime += deltaTimeSeconds * this.speedMultiplier;
      if (this.lastTempTelemetryTime >= 1.0) {
        this.lastTempTelemetryTime = 0;
        const hot = this.thermalBridge.getHotendTemp();
        const bed = this.thermalBridge.getBedTemp();
        this.emitTerminal(
          `T:${hot.actual.toFixed(1)} /${hot.target.toFixed(1)} B:${bed.actual.toFixed(1)} /${bed.target.toFixed(1)}`
        );
      }

      if (this.thermalBridge.isTargetReached(this.waitingHeater, 1.0)) {
        this.isWaitingForTemp = false;
        this.waitingHeater = null;
        this.emitTerminal('ok');
      } else {
        // Temperature wait consumes motion budget
        return;
      }
    }

    // 2. Replenish motion blocks from parsed lines if interpolator queue is running low
    while (this.interpolator.getQueueLength() < 50 && this.currentLineIndex < this.parsedLines.length) {
      const line = this.parsedLines[this.currentLineIndex++];
      this.executeParsedLine(line);

      if (isStepMode) {
        break;
      }
      if (this.isWaitingForTemp) {
        break;
      }
    }

    // 3. Step the motion interpolator with time budget
    const stepResult = this.interpolator.step(deltaTimeSeconds, this.speedMultiplier, isStepMode);

    // Apply layer shift offset if active in failure bridge
    if (this.failureBridge) {
      const shift = this.failureBridge.getLayerShiftOffset(this.activeLayerIndex);
      this.kinematics.setLayerShiftOffset(shift.x, shift.y);
    }

    this.kinematics.setCurrentPosition(stepResult.currentPosition);

    // Dispatch completed toolpaths
    for (const block of stepResult.completedBlocks) {
      if (block.isExtruding && block.deltaE > 0) {
        this.filamentConsumedMm += block.deltaE;
      }
      if (block.toolpathSegment && this.callbacks.onToolpathSegment) {
        this.callbacks.onToolpathSegment(block.toolpathSegment);
      }
    }

    if (this.callbacks.onPositionUpdate) {
      this.callbacks.onPositionUpdate(this.kinematics.getPhysicalPosition());
    }

    if (this.callbacks.onProgressUpdate) {
      this.callbacks.onProgressUpdate(this.getProgress());
    }

    // 4. Check for print completion
    const isFinished =
      this.currentLineIndex >= this.parsedLines.length &&
      !this.interpolator.getActiveBlock() &&
      this.interpolator.getQueueLength() === 0 &&
      !this.isWaitingForTemp;

    if (isFinished) {
      this.setState(ExecutionState.COMPLETED);
      this.emitTerminal('echo: Print completed successfully.');
      this.emitTerminal('Done printing file');
      return;
    }

    // If stepForward was requested, revert to PAUSED after 1 action
    if (this.state === ExecutionState.STEPPING || isStepMode) {
      this.setState(ExecutionState.PAUSED);
      return;
    }
  }

  /**
   * Translates a single parsed G-code line into kinematic moves or system settings.
   */
  private executeParsedLine(line: ParsedGCodeLine): void {
    const { command, parameters, comment } = line;

    // Direct parsed layer tracking
    if (line.layerIndex !== undefined && line.layerIndex !== this.activeLayerIndex) {
      this.activeLayerIndex = line.layerIndex;
      this.kinematics.setActiveLayer(line.layerIndex, this.totalLayers);
      if (this.callbacks.onLayerChange) {
        this.callbacks.onLayerChange(line.layerIndex, this.totalLayers);
      }
    } else if (comment) {
      // Slicer layer tracking fallback from inline comments
      const upper = comment.toUpperCase();
      const match = upper.match(/LAYER[:\s]+(\d+)/);
      if (match) {
        const newLayer = parseInt(match[1], 10);
        if (newLayer !== this.activeLayerIndex) {
          this.activeLayerIndex = newLayer;
          this.kinematics.setActiveLayer(newLayer, this.totalLayers);
          if (this.callbacks.onLayerChange) {
            this.callbacks.onLayerChange(newLayer, this.totalLayers);
          }
        }
      }
    }

    switch (command) {
      case 'G0':
      case 'G1': {
        const startPos = { ...this.plannerPosition };
        const move = this.kinematics.calculateMove(
          { x: parameters.X, y: parameters.Y, z: parameters.Z, e: parameters.E, f: parameters.F },
          1, // Base duration calculation (speed multiplier is handled dynamically by step)
          startPos
        );

        // Check Cold Extrusion Prevention & Failure Clog:
        let allowedExtrusion = move.deltaE;
        if (move.deltaE > 0) {
          const coldThreshold = this.thermalBridge ? this.thermalBridge.getColdExtrusionThreshold() : 170;
          const hotendActual = this.thermalBridge ? this.thermalBridge.getHotendTemp().actual : 200;

          if (hotendActual < coldThreshold) {
            allowedExtrusion = 0;
            this.emitTerminal('echo: cold extrusion prevented');
          } else if (this.failureBridge) {
            const scale = this.failureBridge.getExtrusionScale ? this.failureBridge.getExtrusionScale() : (this.failureBridge.isNozzleClogged() ? 0 : 1);
            allowedExtrusion = move.deltaE * scale;
          }
        }

        const effectiveTarget: AxisCoordinates = {
          x: move.target.x,
          y: move.target.y,
          z: move.target.z,
          e: move.deltaE > 0 ? startPos.e + allowedExtrusion : move.target.e,
        };

        // Update plannerPosition
        this.plannerPosition = { ...effectiveTarget };

        let segment: ToolpathSegment | undefined;
        let type = ToolpathType.TRAVEL;

        if (allowedExtrusion > 0.00001) {
          type = line.toolpathType ?? this.parser.getCurrentToolpathType();
          segment = {
            startX: startPos.x,
            startY: startPos.y,
            startZ: startPos.z,
            endX: effectiveTarget.x,
            endY: effectiveTarget.y,
            endZ: effectiveTarget.z,
            extrusionLength: allowedExtrusion,
            feedrate: this.kinematics.getState().feedrate,
            type,
            layerIndex: this.activeLayerIndex,
            commandIndex: this.currentLineIndex,
          };
        } else if (move.deltaE < -0.00001) {
          type = ToolpathType.TRAVEL;
        }

        // Enqueue motion block into interpolator
        this.interpolator.enqueue({
          commandIndex: this.currentLineIndex,
          layerIndex: this.activeLayerIndex,
          startPosition: startPos,
          targetPosition: effectiveTarget,
          deltaX: move.deltaX,
          deltaY: move.deltaY,
          deltaZ: move.deltaZ,
          deltaE: allowedExtrusion,
          distanceXYZ: move.distanceXYZ,
          feedrate: this.kinematics.getState().feedrate,
          duration: move.durationSeconds,
          type,
          toolpathSegment: segment,
          isExtruding: allowedExtrusion > 0.00001,
        });

        // Update target position in kinematics
        this.kinematics.setTargetPosition(effectiveTarget);
        break;
      }

      case 'G28': {
        // Auto Homing
        const axes = {
          x: parameters.X !== undefined || (parameters.Y === undefined && parameters.Z === undefined),
          y: parameters.Y !== undefined || (parameters.X === undefined && parameters.Z === undefined),
          z: parameters.Z !== undefined || (parameters.X === undefined && parameters.Y === undefined),
        };
        const currentPos = { ...this.plannerPosition };
        const homePos: AxisCoordinates = {
          x: axes.x ? 0 : currentPos.x,
          y: axes.y ? 0 : currentPos.y,
          z: axes.z ? 0 : currentPos.z,
          e: currentPos.e,
        };
        this.plannerPosition = { ...homePos };
        this.kinematics.home(axes);

        const deltaX = homePos.x - currentPos.x;
        const deltaY = homePos.y - currentPos.y;
        const deltaZ = homePos.z - currentPos.z;
        const distanceXYZ = Math.hypot(deltaX, deltaY, deltaZ);

        // Add homing motion block
        this.interpolator.enqueue({
          commandIndex: this.currentLineIndex,
          layerIndex: this.activeLayerIndex,
          startPosition: currentPos,
          targetPosition: homePos,
          deltaX,
          deltaY,
          deltaZ,
          deltaE: 0,
          distanceXYZ,
          feedrate: 3000,
          duration: distanceXYZ > 0 ? distanceXYZ / 50 : 0.5,
          type: ToolpathType.TRAVEL,
          isExtruding: false,
        });

        this.kinematics.setTargetPosition(homePos);
        this.emitTerminal('ok');
        break;
      }

      case 'G90':
        this.kinematics.setPositioningMode(false);
        this.emitTerminal('ok');
        break;

      case 'G91':
        this.kinematics.setPositioningMode(true);
        this.emitTerminal('ok');
        break;

      case 'M82':
        this.kinematics.setExtruderMode(false);
        this.emitTerminal('ok');
        break;

      case 'M83':
        this.kinematics.setExtruderMode(true);
        this.emitTerminal('ok');
        break;

      case 'G92':
        if (parameters.X !== undefined) this.plannerPosition.x = parameters.X;
        if (parameters.Y !== undefined) this.plannerPosition.y = parameters.Y;
        if (parameters.Z !== undefined) this.plannerPosition.z = parameters.Z;
        if (parameters.E !== undefined) this.plannerPosition.e = parameters.E;

        this.kinematics.setCoordinateOffset({
          x: parameters.X,
          y: parameters.Y,
          z: parameters.Z,
          e: parameters.E,
        });

        const curTarget = { ...this.plannerPosition };
        this.interpolator.enqueue({
          commandIndex: this.currentLineIndex,
          layerIndex: this.activeLayerIndex,
          startPosition: curTarget,
          targetPosition: curTarget,
          deltaX: 0,
          deltaY: 0,
          deltaZ: 0,
          deltaE: 0,
          distanceXYZ: 0,
          feedrate: this.kinematics.getState().feedrate,
          duration: 0,
          type: ToolpathType.TRAVEL,
          isExtruding: false,
        });
        this.emitTerminal('ok');
        break;

      case 'G4': {
        // Dwell
        const dwellMs = parameters.P !== undefined ? parameters.P : (parameters.S ?? 0) * 1000;
        const dwellSeconds = dwellMs / 1000;
        const cur = { ...this.plannerPosition };
        this.interpolator.enqueue({
          commandIndex: this.currentLineIndex,
          layerIndex: this.activeLayerIndex,
          startPosition: cur,
          targetPosition: cur,
          deltaX: 0,
          deltaY: 0,
          deltaZ: 0,
          deltaE: 0,
          distanceXYZ: 0,
          feedrate: this.kinematics.getState().feedrate,
          duration: dwellSeconds,
          type: ToolpathType.TRAVEL,
          isExtruding: false,
        });
        this.emitTerminal('ok');
        break;
      }

      case 'M104':
        // Set hotend temp async
        if (parameters.S !== undefined && this.thermalBridge) {
          this.thermalBridge.setHotendTarget(parameters.S);
        }
        this.emitTerminal('ok');
        break;

      case 'M109':
        // Set hotend temp blocking wait
        if (parameters.S !== undefined && this.thermalBridge) {
          this.thermalBridge.setHotendTarget(parameters.S);
          this.isWaitingForTemp = true;
          this.waitingHeater = 'hotend';
          this.targetTempSetpoint = parameters.S;
          this.lastTempTelemetryTime = 0;
          this.emitTerminal(`echo: Heating hotend to ${parameters.S}°C...`);
        } else {
          this.emitTerminal('ok');
        }
        break;

      case 'M140':
        // Set bed temp async
        if (parameters.S !== undefined && this.thermalBridge) {
          this.thermalBridge.setBedTarget(parameters.S);
        }
        this.emitTerminal('ok');
        break;

      case 'M190':
        // Set bed temp blocking wait
        if (parameters.S !== undefined && this.thermalBridge) {
          this.thermalBridge.setBedTarget(parameters.S);
          this.isWaitingForTemp = true;
          this.waitingHeater = 'bed';
          this.targetTempSetpoint = parameters.S;
          this.lastTempTelemetryTime = 0;
          this.emitTerminal(`echo: Heating bed to ${parameters.S}°C...`);
        } else {
          this.emitTerminal('ok');
        }
        break;

      case 'M105': {
        // Query temperatures
        const hot = this.thermalBridge ? this.thermalBridge.getHotendTemp() : { actual: 25, target: 0 };
        const bed = this.thermalBridge ? this.thermalBridge.getBedTemp() : { actual: 25, target: 0 };
        this.emitTerminal(
          `ok T:${hot.actual.toFixed(1)} /${hot.target.toFixed(1)} B:${bed.actual.toFixed(1)} /${bed.target.toFixed(1)} @:127 B@:127`
        );
        break;
      }

      case 'M106': {
        // Set part fan PWM (0-255)
        const s = parameters.S !== undefined ? parameters.S : 255;
        const duty = s / 255;
        this.kinematics.setFanSpeed(duty);
        if (this.thermalBridge?.setFanSpeed) {
          this.thermalBridge.setFanSpeed(duty);
        }
        this.emitTerminal('ok');
        break;
      }

      case 'M107':
        // Fan off
        this.kinematics.setFanSpeed(0);
        if (this.thermalBridge?.setFanSpeed) {
          this.thermalBridge.setFanSpeed(0);
        }
        this.emitTerminal('ok');
        break;

      case 'M220':
        // Speed override factor (percentage)
        if (parameters.S !== undefined) {
          this.kinematics.setSpeedOverride(parameters.S);
        }
        this.emitTerminal('ok');
        break;

      case 'M221':
        // Flow override factor (percentage)
        if (parameters.S !== undefined) {
          this.kinematics.setFlowOverride(parameters.S);
        }
        this.emitTerminal('ok');
        break;

      case 'M114': {
        // Report current coordinates
        const p = this.kinematics.getState().currentPosition;
        this.emitTerminal(
          `X:${p.x.toFixed(2)} Y:${p.y.toFixed(2)} Z:${p.z.toFixed(2)} E:${p.e.toFixed(2)} Count X:${Math.round(p.x * 80)} Y:${Math.round(p.y * 80)} Z:${Math.round(p.z * 400)}`
        );
        this.emitTerminal('ok');
        break;
      }

      case 'M117':
        // Set LCD message
        this.emitTerminal(`echo: ${line.stringParameter || ''}`);
        this.emitTerminal('ok');
        break;

      case 'M84':
      case 'M18':
        // Disable steppers
        this.kinematics.setSteppersEnabled(false);
        this.emitTerminal('ok');
        break;

      case 'M112':
        // Emergency stop
        this.emergencyStop('Emergency Stop Activated! kill() called!');
        break;

      default:
        // Gracefully ignore unknown tuning codes (M201, M204, M205, M900, etc.)
        this.emitTerminal('ok');
        break;
    }
  }

  public emergencyStop(reason: string = 'kill() called'): void {
    this.setState(ExecutionState.ERROR);
    this.isWaitingForTemp = false;
    this.interpolator.clearQueue();

    if (this.thermalBridge) {
      this.thermalBridge.setHotendTarget(0);
      this.thermalBridge.setBedTarget(0);
      if (this.thermalBridge.triggerEmergencyStop) {
        this.thermalBridge.triggerEmergencyStop();
      }
      if (this.thermalBridge.setFanSpeed) {
        this.thermalBridge.setFanSpeed(1.0);
      }
    }
    this.kinematics.setFanSpeed(1.0); // Full cooling
    this.kinematics.setSteppersEnabled(false);

    this.emitTerminal(`Error: ${reason}`);
    this.emitTerminal('Error: Printer halted. kill() called!');
  }

  /**
   * Execute an immediate command from user (firmware terminal or jog dials).
   */
  public executeImmediateCommand(rawCommand: string): string {
    const trimmed = rawCommand.trim();
    if (!trimmed) return 'ok';

    this.emitTerminal(`> ${trimmed}`);

    const parsed = this.parser.parseLine(trimmed);
    if (!parsed) {
      this.emitTerminal('ok');
      return 'ok';
    }

    // Direct execution for motion commands when paused or idle to avoid hijacking in-flight queue
    if (this.state === ExecutionState.PAUSED || this.state === ExecutionState.IDLE) {
      if (parsed.command === 'G0' || parsed.command === 'G1') {
        const currentPos = this.kinematics.getState().currentPosition;
        const move = this.kinematics.calculateMove(
          {
            x: parsed.parameters.X,
            y: parsed.parameters.Y,
            z: parsed.parameters.Z,
            e: parsed.parameters.E,
            f: parsed.parameters.F,
          },
          1,
          currentPos
        );
        if (move.deltaE > 0) {
          const coldThreshold = this.thermalBridge ? this.thermalBridge.getColdExtrusionThreshold() : 170;
          const hotendActual = this.thermalBridge ? this.thermalBridge.getHotendTemp().actual : 200;

          if (hotendActual < coldThreshold) {
            this.emitTerminal('echo: cold extrusion prevented');
            move.target.e = currentPos.e;
          } else if (this.failureBridge) {
            const scale = this.failureBridge.getExtrusionScale ? this.failureBridge.getExtrusionScale() : (this.failureBridge.isNozzleClogged() ? 0 : 1);
            if (scale <= 0) {
              move.target.e = currentPos.e;
            } else if (scale < 1.0) {
              move.target.e = currentPos.e + move.deltaE * scale;
            }
          }
        }

        this.kinematics.setCurrentPosition(move.target);
        if (this.state === ExecutionState.IDLE) {
          this.plannerPosition = { ...move.target };
          this.interpolator.setPosition(move.target);
        }
        if (this.callbacks.onPositionUpdate) {
          this.callbacks.onPositionUpdate(this.kinematics.getPhysicalPosition());
        }
        this.emitTerminal('ok');
        return 'ok';
      } else if (parsed.command === 'G28') {
        const axes = {
          x: parsed.parameters.X !== undefined || (parsed.parameters.Y === undefined && parsed.parameters.Z === undefined),
          y: parsed.parameters.Y !== undefined || (parsed.parameters.X === undefined && parsed.parameters.Z === undefined),
          z: parsed.parameters.Z !== undefined || (parsed.parameters.X === undefined && parsed.parameters.Y === undefined),
        };
        this.kinematics.home(axes);
        const homePos = this.kinematics.getState().currentPosition;
        if (this.state === ExecutionState.IDLE) {
          this.plannerPosition = { ...homePos };
          this.interpolator.setPosition(homePos);
        }
        if (this.callbacks.onPositionUpdate) {
          this.callbacks.onPositionUpdate(this.kinematics.getPhysicalPosition());
        }
        this.emitTerminal('ok');
        return 'ok';
      }
    }

    this.executeParsedLine(parsed);
    return 'ok';
  }
}
