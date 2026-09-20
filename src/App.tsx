import { useEffect, useRef, useState, useCallback } from 'react';
import { TelemetryStore } from './core/telemetry/TelemetryStore';
import { ThermalModel } from './core/thermal/ThermalModel';
import { FailureManager } from './core/failures/FailureManager';
import { GCodeExecutor } from './core/gcode/GCodeExecutor';
import { ExecutionState, GCodeModelSummary } from './core/gcode/types';
import { SAMPLE_MODELS } from './core/gcode/sampleModels';
import { ToolpathSegment, IKinematicState, AxisCoordinates } from './core/kinematics/types';
import { PrinterTelemetryState, TerminalEntry } from './core/telemetry/types';
import { NozzleClogMode } from './core/failures/types';
import { IPrinterViewportController } from './viewport/types';
import { FluiddDashboard } from './components/dashboard/FluiddDashboard';

export default function App() {
  // Core Subsystem Singletons
  const thermalModelRef = useRef<ThermalModel | null>(null);
  const failureManagerRef = useRef<FailureManager | null>(null);
  const telemetryStoreRef = useRef<TelemetryStore | null>(null);
  const executorRef = useRef<GCodeExecutor | null>(null);
  const viewportControllerRef = useRef<IPrinterViewportController | null>(null);

  // Initialize singletons once
  if (!thermalModelRef.current) {
    const thermal = new ThermalModel();
    const failures = new FailureManager(thermal);
    const store = new TelemetryStore();
    const executor = new GCodeExecutor({}, thermal, failures);

    thermalModelRef.current = thermal;
    failureManagerRef.current = failures;
    telemetryStoreRef.current = store;
    executorRef.current = executor;
  }

  const thermalModel = thermalModelRef.current!;
  const failureManager = failureManagerRef.current!;
  const telemetryStore = telemetryStoreRef.current!;
  const executor = executorRef.current!;

  // React state synchronized with subsystems
  const [telemetry, setTelemetry] = useState<PrinterTelemetryState>(telemetryStore.getState());
  const [kinematicState, setKinematicState] = useState<IKinematicState>(
    executor.getKinematics().getState()
  );
  const [activeSegment, setActiveSegment] = useState<ToolpathSegment | null>(null);
  const [modelSummary, setModelSummary] = useState<GCodeModelSummary | null>(null);
  const [activeModelId, setActiveModelId] = useState<string>('quick_pad');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);

  // Helper to classify log message type
  const classifyTerminalLine = (line: string): TerminalEntry['type'] => {
    if (line.startsWith('> ')) return 'command';
    if (line.startsWith('ok') || line.startsWith('T:')) return 'response';
    if (line.startsWith('echo:')) return 'echo';
    if (line.startsWith('Error:') || line.startsWith('!!')) return 'error';
    return 'echo';
  };

  // Wire Executor Callbacks
  useEffect(() => {
    executor.setCallbacks({
      onToolpathSegment: (segment: ToolpathSegment) => {
        setActiveSegment(segment);
        viewportControllerRef.current?.appendExtrusionSegment(segment);
      },
      onPositionUpdate: (pos: AxisCoordinates) => {
        telemetryStore.updateNominalPosition(executor.getKinematics().getState().currentPosition);
        telemetryStore.updatePhysicalPosition(pos);
        setKinematicState(executor.getKinematics().getState());
      },
      onStateChange: (state: ExecutionState) => {
        if (state === ExecutionState.RUNNING) {
          telemetryStore.setStatus('PRINTING', 'Printing active');
        } else if (state === ExecutionState.PAUSED) {
          telemetryStore.setStatus('PAUSED', 'Print paused');
        } else if (state === ExecutionState.COMPLETED) {
          telemetryStore.setStatus('IDLE', 'Print completed');
        } else if (state === ExecutionState.ABORTED) {
          telemetryStore.setStatus('IDLE', 'Print aborted');
        } else if (state === ExecutionState.ERROR) {
          telemetryStore.setStatus('HALTED', 'Firmware error halt');
        }
      },
      onTerminalOutput: (line: string) => {
        telemetryStore.appendTerminal(line, classifyTerminalLine(line));
      },
      onProgressUpdate: (progress) => {
        telemetryStore.updateJobMetrics({
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
        setKinematicState(executor.getKinematics().getState());
        telemetryStore.updateJobMetrics({ currentLayer: activeLayer, totalLayers });
      },
    });
  }, [executor, telemetryStore]);

  // Subscribe to TelemetryStore
  useEffect(() => {
    const unsubscribe = telemetryStore.subscribe((state) => {
      setTelemetry(state);
    });
    return () => unsubscribe();
  }, [telemetryStore]);

  // Load Initial Model on Mount
  useEffect(() => {
    const initialModel = SAMPLE_MODELS.quick_pad;
    if (initialModel) {
      executor.loadGCode(initialModel.getGCode(), `${initialModel.name}.gcode`).then((summary) => {
        setModelSummary(summary);
        telemetryStore.updateJobMetrics({
          filename: `${initialModel.name}.gcode`,
          totalLayers: summary.totalLayers,
          currentLayer: 0,
          progressPercent: 0,
          elapsedSeconds: 0,
          estimatedRemainingSeconds: summary.estimatedPrintTimeSeconds,
          filamentUsedMm: 0,
          filamentUsedGrams: 0,
        });
      });
    }
  }, []);

  // 1. Simulation Physics Loop (~20Hz / 50ms interval)
  useEffect(() => {
    let lastTime = performance.now();

    const interval = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const execState = executor.getState();

      if (execState === ExecutionState.RUNNING || execState === ExecutionState.STEPPING) {
        // Step motion and executor (thermalModel.update is handled inside executor)
        executor.update(dt);
      } else {
        // Advance thermal physics even when printer is idle/paused
        thermalModel.update(dt);
      }

      // Check thermal runaway safety
      if (thermalModel.isThermalRunaway() && execState !== ExecutionState.ERROR) {
        executor.emergencyStop('Thermal Runaway Watchdog Triggered');
        telemetryStore.setStatus('ERROR', thermalModel.getErrorReason() || 'Thermal Runaway');
      }
    }, 50);

    return () => clearInterval(interval);
  }, [executor, thermalModel, telemetryStore]);

  // 2. Telemetry Sync & Chart Sampling Loop (2Hz / 500ms interval)
  useEffect(() => {
    const interval = setInterval(() => {
      // Sync thermals
      const hotend = thermalModel.getHotend();
      const bed = thermalModel.getBed();
      telemetryStore.updateHotend(hotend);
      telemetryStore.updateBed(bed);
      telemetryStore.recordThermalSample();
      telemetryStore.setFanSpeed(thermalModel.getFanSpeed());

      // Sync failures & kinematics
      telemetryStore.updateFailures(failureManager.getConfig());
      const kState = executor.getKinematics().getState();
      telemetryStore.updateHomedAxes(kState.isHomed);
      telemetryStore.updateNominalPosition(kState.currentPosition);
      telemetryStore.updatePhysicalPosition(executor.getKinematics().getPhysicalPosition());
      setKinematicState({ ...kState });

      // Sync status
      const execState = executor.getState();
      if (thermalModel.isThermalRunaway() || execState === ExecutionState.ERROR) {
        telemetryStore.setStatus('HALTED', thermalModel.getErrorReason() || 'Printer Halted');
      } else if (execState === ExecutionState.RUNNING) {
        if (
          (hotend.target > 30 && Math.abs(hotend.actual - hotend.target) > 2) ||
          (bed.target > 30 && Math.abs(bed.actual - bed.target) > 2)
        ) {
          telemetryStore.setStatus('HEATING', 'Heating to setpoints...');
        } else {
          telemetryStore.setStatus('PRINTING', 'Printing active');
        }
      } else if (execState === ExecutionState.PAUSED) {
        telemetryStore.setStatus('PAUSED', 'Print paused');
      } else if (hotend.isHeating || bed.isHeating) {
        telemetryStore.setStatus('HEATING', 'Preheating...');
      } else {
        telemetryStore.setStatus('IDLE', 'Ready');
      }
    }, 500);

    return () => clearInterval(interval);
  }, [executor, thermalModel, failureManager, telemetryStore]);

  // Viewport Ready callback
  const handleViewportReady = useCallback((controller: IPrinterViewportController) => {
    viewportControllerRef.current = controller;
  }, []);

  // --- Transport Controls ---
  const handleStartPrint = () => {
    executor.startPrint();
    telemetryStore.setStatus('PRINTING', 'Printing started');
  };

  const handlePausePrint = () => {
    executor.pausePrint();
    telemetryStore.setStatus('PAUSED', 'Print paused');
  };

  const handleResumePrint = () => {
    executor.resumePrint();
    telemetryStore.setStatus('PRINTING', 'Printing resumed');
  };

  const handleAbortPrint = () => {
    executor.abortPrint();
    telemetryStore.setStatus('IDLE', 'Print aborted');
    viewportControllerRef.current?.clearToolpaths();
  };

  const handleStepPrint = () => {
    executor.stepForward();
  };

  const handleEmergencyStop = () => {
    executor.emergencyStop('Emergency Stop (M112) triggered via Dashboard');
    telemetryStore.setStatus('HALTED', 'M112 Emergency Stop Activated');
    telemetryStore.appendTerminal('!! Error: Emergency Stop (M112) called. kill() triggered.', 'error');
  };

  const handleResetFaults = () => {
    thermalModel.resetFaults();
    failureManager.resetAllFailures();
    viewportControllerRef.current?.triggerFailureVisual('spaghetti', false);
    viewportControllerRef.current?.triggerFailureVisual('layer_shift', false);
    telemetryStore.setStatus('IDLE', 'Faults cleared, printer ready');
    telemetryStore.appendTerminal('echo: Printer faults cleared, system ready.', 'echo');
  };

  const handleSetSpeedMultiplier = (mult: number) => {
    executor.setSpeedMultiplier(mult);
    setSpeedMultiplier(mult);
    telemetryStore.updateJobMetrics({ speedMultiplier: mult });
    telemetryStore.appendTerminal(`> M220 S${mult * 100}`, 'command');
    telemetryStore.appendTerminal('ok', 'response');
  };

  // --- Kinematics & Jog ---
  const handleJog = (axis: 'X' | 'Y' | 'Z', distance: number) => {
    const curPos = executor.getKinematics().getState().currentPosition;
    const targetVal =
      axis === 'X' ? curPos.x + distance : axis === 'Y' ? curPos.y + distance : curPos.z + distance;
    const clampedTarget =
      axis === 'Z'
        ? Math.max(0, Math.min(250, targetVal))
        : Math.max(0, Math.min(220, targetVal));

    executor.executeImmediateCommand(`G1 ${axis}${clampedTarget.toFixed(2)} F3000`);
  };

  const handleJogXY = (dx: number, dy: number) => {
    const curPos = executor.getKinematics().getState().currentPosition;
    const targetX = Math.max(0, Math.min(220, curPos.x + dx));
    const targetY = Math.max(0, Math.min(220, curPos.y + dy));
    executor.executeImmediateCommand(`G1 X${targetX.toFixed(2)} Y${targetY.toFixed(2)} F3000`);
  };

  const handleHome = (axes: { x?: boolean; y?: boolean; z?: boolean }) => {
    let cmd = 'G28';
    if (axes.x && axes.y && axes.z) {
      cmd = 'G28';
    } else {
      if (axes.x) cmd += ' X';
      if (axes.y) cmd += ' Y';
      if (axes.z) cmd += ' Z';
    }
    executor.executeImmediateCommand(cmd);
  };

  const handleExtrude = (amountMm: number) => {
    const hotendActual = thermalModel.getHotend().actual;
    if (hotendActual < 170.0) {
      telemetryStore.appendTerminal(
        `echo: cold extrusion prevented (hotend temp = ${hotendActual.toFixed(1)}°C < 170.0°C)`,
        'echo'
      );
      return;
    }
    const curPos = executor.getKinematics().getState().currentPosition;
    executor.executeImmediateCommand(`G1 E${(curPos.e + amountMm).toFixed(2)} F300`);
  };

  const handleRetract = (amountMm: number) => {
    const curPos = executor.getKinematics().getState().currentPosition;
    executor.executeImmediateCommand(`G1 E${(curPos.e - amountMm).toFixed(2)} F1800`);
  };

  const handleDisableSteppers = () => {
    executor.executeImmediateCommand('M84');
  };

  // --- Thermals ---
  const handleSetHotendTarget = (temp: number) => {
    thermalModel.setHotendTarget(temp);
    telemetryStore.appendTerminal(`> M104 S${temp}`, 'command');
    telemetryStore.appendTerminal('ok', 'response');
  };

  const handleSetBedTarget = (temp: number) => {
    thermalModel.setBedTarget(temp);
    telemetryStore.appendTerminal(`> M140 S${temp}`, 'command');
    telemetryStore.appendTerminal('ok', 'response');
  };

  const handleSetFanSpeed = (duty: number) => {
    thermalModel.setFanSpeed(duty);
    executor.getKinematics().setFanSpeed(duty);
    telemetryStore.setFanSpeed(duty);
    telemetryStore.appendTerminal(`> M106 S${Math.round(duty * 255)}`, 'command');
    telemetryStore.appendTerminal('ok', 'response');
  };

  // --- Terminal ---
  const handleSendCommand = (command: string) => {
    executor.executeImmediateCommand(command);
  };

  const handleClearTerminal = () => {
    telemetryStore.clearTerminal();
  };

  // --- Failures ---
  const handleSetNozzleClog = (mode: NozzleClogMode) => {
    failureManager.setNozzleClog(mode);
    telemetryStore.updateFailures(failureManager.getConfig());
    telemetryStore.appendTerminal(`// failure: nozzle clog set to ${mode}`, 'echo');
  };

  const handleSetSpaghettiMode = (active: boolean) => {
    failureManager.setSpaghettiMode(active);
    telemetryStore.updateFailures(failureManager.getConfig());
    viewportControllerRef.current?.triggerFailureVisual('spaghetti', active);
    telemetryStore.appendTerminal(`// failure: spaghetti mode ${active ? 'ACTIVE' : 'INACTIVE'}`, 'echo');
  };

  const handleTriggerLayerShift = (dx: number, dy: number) => {
    failureManager.triggerLayerShift(dx, dy);
    telemetryStore.updateFailures(failureManager.getConfig());
    viewportControllerRef.current?.triggerFailureVisual('layer_shift', true);
    telemetryStore.appendTerminal(`// failure: layer shift offset applied (+${dx}X, +${dy}Y)`, 'echo');
  };

  const handleSetFilamentRunout = (active: boolean) => {
    failureManager.setFilamentRunout(active);
    telemetryStore.updateFailures(failureManager.getConfig());
    telemetryStore.appendTerminal(`// failure: filament runout ${active ? 'TRIPPED' : 'CLEARED'}`, 'echo');
  };

  const handleSimulateThermalRunaway = (heater: 'hotend' | 'bed' = 'hotend') => {
    failureManager.simulateThermalRunaway(heater);
    telemetryStore.updateFailures(failureManager.getConfig());
    telemetryStore.appendTerminal(`// failure: simulated open-loop heater runaway on ${heater}`, 'echo');
  };

  const handleResetFailures = () => {
    failureManager.resetAllFailures();
    viewportControllerRef.current?.triggerFailureVisual('spaghetti', false);
    viewportControllerRef.current?.triggerFailureVisual('layer_shift', false);
    telemetryStore.updateFailures(failureManager.getConfig());
    telemetryStore.appendTerminal('// failure: all hardware failure modes reset', 'echo');
  };

  // --- Models ---
  const handleSelectSampleModel = async (modelId: string) => {
    const sample = SAMPLE_MODELS[modelId];
    if (!sample) return;

    setActiveModelId(modelId);
    viewportControllerRef.current?.clearToolpaths();
    const summary = await executor.loadGCode(sample.getGCode(), `${sample.name}.gcode`);
    setModelSummary(summary);
    telemetryStore.updateJobMetrics({
      filename: `${sample.name}.gcode`,
      totalLayers: summary.totalLayers,
      currentLayer: 0,
      progressPercent: 0,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: summary.estimatedPrintTimeSeconds,
      filamentUsedMm: 0,
      filamentUsedGrams: 0,
    });
  };

  const handleUploadCustomGCode = async (fileName: string, gcodeText: string) => {
    setActiveModelId('custom');
    viewportControllerRef.current?.clearToolpaths();
    const summary = await executor.loadGCode(gcodeText, fileName);
    setModelSummary(summary);
    telemetryStore.updateJobMetrics({
      filename: fileName,
      totalLayers: summary.totalLayers,
      currentLayer: 0,
      progressPercent: 0,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: summary.estimatedPrintTimeSeconds,
      filamentUsedMm: 0,
      filamentUsedGrams: 0,
    });
  };

  return (
    <FluiddDashboard
      telemetry={telemetry}
      activeSegment={activeSegment}
      kinematicState={kinematicState}
      modelSummary={modelSummary}
      speedMultiplier={speedMultiplier}
      activeModelId={activeModelId}
      onViewportReady={handleViewportReady}
      onStartPrint={handleStartPrint}
      onPausePrint={handlePausePrint}
      onResumePrint={handleResumePrint}
      onAbortPrint={handleAbortPrint}
      onStepPrint={handleStepPrint}
      onEmergencyStop={handleEmergencyStop}
      onResetFaults={handleResetFaults}
      onSetSpeedMultiplier={handleSetSpeedMultiplier}
      onJog={handleJog}
      onJogXY={handleJogXY}
      onHome={handleHome}
      onExtrude={handleExtrude}
      onRetract={handleRetract}
      onDisableSteppers={handleDisableSteppers}
      onSetHotendTarget={handleSetHotendTarget}
      onSetBedTarget={handleSetBedTarget}
      onSetFanSpeed={handleSetFanSpeed}
      onSendCommand={handleSendCommand}
      onClearTerminal={handleClearTerminal}
      onSetNozzleClog={handleSetNozzleClog}
      onSetSpaghettiMode={handleSetSpaghettiMode}
      onTriggerLayerShift={handleTriggerLayerShift}
      onSetFilamentRunout={handleSetFilamentRunout}
      onSimulateThermalRunaway={handleSimulateThermalRunaway}
      onResetFailures={handleResetFailures}
      onSelectSampleModel={handleSelectSampleModel}
      onUploadCustomGCode={handleUploadCustomGCode}
    />
  );
}
