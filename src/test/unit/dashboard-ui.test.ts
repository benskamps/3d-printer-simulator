import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  TemperaturePanel,
  JogControlPanel,
  PrintStatusPanel,
  GCodeTerminal,
  FailureControls,
  ModelSelector,
  FluiddDashboard,
} from '../../components/dashboard';
import { TelemetryStore } from '../../core/telemetry/TelemetryStore';
import { ThermalModel } from '../../core/thermal/ThermalModel';
import { FailureManager } from '../../core/failures/FailureManager';
import { GCodeExecutor } from '../../core/gcode/GCodeExecutor';
import { SAMPLE_MODELS } from '../../core/gcode/sampleModels';
import { PrinterTelemetryState } from '../../core/telemetry/types';

describe('Milestone 4: Control Dashboard & Virtual Firmware Terminal UI', () => {
  const mockTelemetry: PrinterTelemetryState = {
    status: 'IDLE',
    statusMessage: 'Ready',
    hotend: {
      actual: 21.0,
      target: 0,
      power: 0,
      isHeating: false,
      hasError: false,
    },
    bed: {
      actual: 21.0,
      target: 0,
      power: 0,
      isHeating: false,
      hasError: false,
    },
    partCoolingFanSpeed: 0.0,
    nominalPosition: { x: 0, y: 0, z: 0, e: 0 },
    physicalPosition: { x: 0, y: 0, z: 0, e: 0 },
    homedAxes: { x: false, y: false, z: false },
    absolutePositioning: true,
    absoluteExtrusion: true,
    failures: {
      nozzleClog: 'NONE',
      spaghettiMode: false,
      layerShift: { x: 0, y: 0 },
      filamentRunout: false,
      thermalRunawaySimulated: false,
    },
    job: {
      filename: 'test_cube.gcode',
      totalLayers: 100,
      currentLayer: 12,
      progressPercent: 12,
      elapsedSeconds: 120,
      estimatedRemainingSeconds: 880,
      filamentUsedMm: 1500,
      filamentUsedGrams: 4.5,
      speedMultiplier: 1.0,
      feedrateMmMin: 3000,
    },
    thermalHistory: [
      { timestamp: 1000, hotendActual: 21.0, hotendTarget: 200, bedActual: 21.0, bedTarget: 60 },
      { timestamp: 2000, hotendActual: 100.5, hotendTarget: 200, bedActual: 45.2, bedTarget: 60 },
      { timestamp: 3000, hotendActual: 199.8, hotendTarget: 200, bedActual: 60.1, bedTarget: 60 },
    ],
    terminalLog: [
      { id: '1', timestamp: '12:00:00', type: 'command', message: '> G28' },
      { id: '2', timestamp: '12:00:01', type: 'response', message: 'ok' },
      { id: '3', timestamp: '12:00:02', type: 'echo', message: 'echo: Heating hotend...' },
      { id: '4', timestamp: '12:00:03', type: 'error', message: 'Error: Thermal Runaway' },
    ],
  };

  describe('1. TemperaturePanel Component', () => {
    it('should render dual-line SVG chart with hotend and bed paths', () => {
      const html = renderToString(
        React.createElement(TemperaturePanel, {
          hotend: mockTelemetry.hotend,
          bed: mockTelemetry.bed,
          thermalHistory: mockTelemetry.thermalHistory,
          fanSpeed: 0.5,
          onSetHotendTarget: vi.fn(),
          onSetBedTarget: vi.fn(),
          onSetFanSpeed: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="temperature-panel"');
      expect(html).toContain('data-testid="thermal-chart-svg"');
      expect(html).toContain('data-testid="chart-hotend-actual"');
      expect(html).toContain('data-testid="chart-hotend-target"');
      expect(html).toContain('data-testid="chart-bed-actual"');
      expect(html).toContain('data-testid="chart-bed-target"');
    });

    it('should render numeric readouts and target inputs', () => {
      const html = renderToString(
        React.createElement(TemperaturePanel, {
          hotend: { actual: 205.4, target: 205, power: 0.6, isHeating: true, hasError: false },
          bed: { actual: 60.2, target: 60, power: 0.4, isHeating: false, hasError: false },
          thermalHistory: mockTelemetry.thermalHistory,
          fanSpeed: 0.75,
          onSetHotendTarget: vi.fn(),
          onSetBedTarget: vi.fn(),
          onSetFanSpeed: vi.fn(),
        })
      );

      expect(html).toContain('205.4°C');
      expect(html).toContain('/ 205°C');
      expect(html).toContain('60.2°C');
      expect(html).toContain('/ 60°C');
      expect(html).toContain('data-testid="btn-set-hotend"');
      expect(html).toContain('data-testid="btn-set-bed"');
    });

    it('should render one-click presets and fan speed slider', () => {
      const html = renderToString(
        React.createElement(TemperaturePanel, {
          hotend: mockTelemetry.hotend,
          bed: mockTelemetry.bed,
          thermalHistory: [],
          fanSpeed: 1.0,
          onSetHotendTarget: vi.fn(),
          onSetBedTarget: vi.fn(),
          onSetFanSpeed: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="preset-off"');
      expect(html).toContain('data-testid="preset-pla"');
      expect(html).toContain('data-testid="preset-petg"');
      expect(html).toContain('data-testid="preset-abs"');
      expect(html).toContain('data-testid="fan-slider"');
      expect(html).toContain('100% (255 PWM)');
    });
  });

  describe('2. JogControlPanel & Cold Extrusion Prevention', () => {
    it('should render XY jog ring, Z up/down steppers, and step sizes', () => {
      const html = renderToString(
        React.createElement(JogControlPanel, {
          currentPosition: { x: 50.0, y: 75.5, z: 10.2, e: 15.0 },
          isHomed: { x: true, y: true, z: false },
          hotendActualTemp: 200.0,
          onJog: vi.fn(),
          onHome: vi.fn(),
          onExtrude: vi.fn(),
          onRetract: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="jog-control-panel"');
      expect(html).toContain('data-testid="step-0.1"');
      expect(html).toContain('data-testid="step-1"');
      expect(html).toContain('data-testid="step-10"');
      expect(html).toContain('data-testid="step-100"');
      expect(html).toContain('data-testid="jog-y-plus"');
      expect(html).toContain('data-testid="jog-y-minus"');
      expect(html).toContain('data-testid="jog-x-plus"');
      expect(html).toContain('data-testid="jog-x-minus"');
      expect(html).toContain('data-testid="jog-z-plus"');
      expect(html).toContain('data-testid="jog-z-minus"');
      expect(html).toContain('data-testid="btn-home-all"');
    });

    it('CRITICAL: should lock extrude buttons and show warning badge when nozzle < 170°C', () => {
      const htmlCold = renderToString(
        React.createElement(JogControlPanel, {
          currentPosition: { x: 0, y: 0, z: 0, e: 0 },
          isHomed: { x: false, y: false, z: false },
          hotendActualTemp: 21.0, // Cold
          onJog: vi.fn(),
          onHome: vi.fn(),
          onExtrude: vi.fn(),
          onRetract: vi.fn(),
        })
      );

      // Must display cold extrusion warning badge
      expect(htmlCold).toContain('data-testid="cold-extrusion-warning"');
      expect(htmlCold).toContain('Cold Extrusion Blocked (&lt; 170°C)');

      // Extrude buttons must be disabled
      expect(htmlCold).toContain('disabled=""');
      expect(htmlCold).toContain('data-testid="btn-extrude-5"');
      expect(htmlCold).toContain('data-testid="btn-extrude-10"');

      // Retract buttons should remain accessible
      expect(htmlCold).toContain('data-testid="btn-retract-5"');
      expect(htmlCold).toContain('data-testid="btn-retract-10"');
    });

    it('should unlock extrude buttons and display ready badge when nozzle >= 170°C', () => {
      const htmlHot = renderToString(
        React.createElement(JogControlPanel, {
          currentPosition: { x: 0, y: 0, z: 0, e: 0 },
          isHomed: { x: true, y: true, z: true },
          hotendActualTemp: 205.0, // Hot enough to extrude
          onJog: vi.fn(),
          onHome: vi.fn(),
          onExtrude: vi.fn(),
          onRetract: vi.fn(),
        })
      );

      expect(htmlHot).toContain('data-testid="extruder-ready-badge"');
      expect(htmlHot).toContain('Extruder Ready (≥ 170°C)');
      expect(htmlHot).not.toContain('data-testid="cold-extrusion-warning"');
    });
  });

  describe('3. PrintStatusPanel Component', () => {
    it('should render progress bar, layer counts, time metrics, and transport buttons', () => {
      const html = renderToString(
        React.createElement(PrintStatusPanel, {
          status: 'PRINTING',
          job: mockTelemetry.job,
          speedMultiplier: 5,
          onStartPrint: vi.fn(),
          onPausePrint: vi.fn(),
          onResumePrint: vi.fn(),
          onAbortPrint: vi.fn(),
          onStepPrint: vi.fn(),
          onSetSpeedMultiplier: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="print-status-panel"');
      expect(html).toContain('data-testid="progress-percentage"');
      expect(html).toContain('12%');
      expect(html).toContain('data-testid="metric-layer"');
      expect(html).toContain('12');
      expect(html).toContain('100');
      expect(html).toContain('data-testid="metric-elapsed"');
      expect(html).toContain('02:00'); // 120 seconds
      expect(html).toContain('data-testid="metric-eta"');
      expect(html).toContain('14:40'); // 880 seconds
      expect(html).toContain('data-testid="metric-filament"');
      expect(html).toContain('1.50m');
      expect(html).toContain('data-testid="speed-5x"');
      expect(html).toContain('data-testid="btn-pause-print"');
      expect(html).toContain('data-testid="btn-abort-print"');
    });

    it('should adapt transport controls according to print status', () => {
      const htmlIdle = renderToString(
        React.createElement(PrintStatusPanel, {
          status: 'IDLE',
          job: { ...mockTelemetry.job, progressPercent: 0 },
          speedMultiplier: 1,
          onStartPrint: vi.fn(),
          onPausePrint: vi.fn(),
          onResumePrint: vi.fn(),
          onAbortPrint: vi.fn(),
          onSetSpeedMultiplier: vi.fn(),
        })
      );
      expect(htmlIdle).toContain('data-testid="btn-start-print"');
      expect(htmlIdle).not.toContain('data-testid="btn-pause-print"');

      const htmlPaused = renderToString(
        React.createElement(PrintStatusPanel, {
          status: 'PAUSED',
          job: mockTelemetry.job,
          speedMultiplier: 1,
          onStartPrint: vi.fn(),
          onPausePrint: vi.fn(),
          onResumePrint: vi.fn(),
          onAbortPrint: vi.fn(),
          onSetSpeedMultiplier: vi.fn(),
        })
      );
      expect(htmlPaused).toContain('data-testid="btn-resume-print"');
    });
  });

  describe('4. GCodeTerminal Component', () => {
    it('should render serial console with logs, input box, and macro buttons', () => {
      const html = renderToString(
        React.createElement(GCodeTerminal, {
          logs: mockTelemetry.terminalLog,
          onSendCommand: vi.fn(),
          onClearLogs: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="gcode-terminal"');
      expect(html).toContain('data-testid="terminal-log-container"');
      expect(html).toContain('&gt; G28');
      expect(html).toContain('ok');
      expect(html).toContain('echo: Heating hotend...');
      expect(html).toContain('Error: Thermal Runaway');
      expect(html).toContain('data-testid="filter-m105-checkbox"');
      expect(html).toContain('data-testid="input-terminal-command"');
      expect(html).toContain('data-testid="btn-send-command"');
      expect(html).toContain('data-testid="macro-m114"');
      expect(html).toContain('data-testid="macro-m105"');
      expect(html).toContain('data-testid="macro-g28"');
      expect(html).toContain('data-testid="macro-m84"');
    });
  });

  describe('5. FailureControls Component', () => {
    it('should render toggles for nozzle clogs, spaghetti, layer shift, and runaway', () => {
      const html = renderToString(
        React.createElement(FailureControls, {
          failures: mockTelemetry.failures,
          onSetNozzleClog: vi.fn(),
          onSetSpaghettiMode: vi.fn(),
          onTriggerLayerShift: vi.fn(),
          onSetFilamentRunout: vi.fn(),
          onSimulateThermalRunaway: vi.fn(),
          onResetFailures: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="failure-controls"');
      expect(html).toContain('data-testid="btn-clog-none"');
      expect(html).toContain('data-testid="btn-clog-partial"');
      expect(html).toContain('data-testid="btn-clog-full"');
      expect(html).toContain('data-testid="btn-toggle-spaghetti"');
      expect(html).toContain('data-testid="btn-shift-x"');
      expect(html).toContain('data-testid="btn-shift-y"');
      expect(html).toContain('data-testid="btn-toggle-runout"');
      expect(html).toContain('data-testid="btn-simulate-thermal-runaway"');
      expect(html).toContain('data-testid="btn-reset-failures"');
    });

    it('should display active failure badges when failure injected', () => {
      const htmlActive = renderToString(
        React.createElement(FailureControls, {
          failures: {
            nozzleClog: 'PARTIAL',
            spaghettiMode: true,
            layerShift: { x: 10, y: 0 },
            filamentRunout: true,
            thermalRunawaySimulated: true,
          },
          onSetNozzleClog: vi.fn(),
          onSetSpaghettiMode: vi.fn(),
          onTriggerLayerShift: vi.fn(),
          onSetFilamentRunout: vi.fn(),
          onSimulateThermalRunaway: vi.fn(),
          onResetFailures: vi.fn(),
        })
      );

      expect(htmlActive).toContain('data-testid="badge-nozzle-clog"');
      expect(htmlActive).toContain('PARTIAL');
      expect(htmlActive).toContain('Active (Spaghetti)');
      expect(htmlActive).toContain('Empty (Trip)');
      expect(htmlActive).toContain('Offset: X +10mm, Y +0mm');
    });
  });

  describe('6. ModelSelector Component', () => {
    it('should render built-in sample models and dropzone', () => {
      const html = renderToString(
        React.createElement(ModelSelector, {
          activeModelId: 'cube',
          activeSummary: {
            fileName: 'calibration_cube.gcode',
            totalLines: 1200,
            totalLayers: 100,
            boundingBox: { minX: 100, maxX: 120, minY: 100, maxY: 120, minZ: 0, maxZ: 20 },
            totalFilamentMm: 4500,
            totalFilamentGrams: 13.5,
            estimatedPrintTimeSeconds: 1680,
            layerHeights: [],
            layerStartIndices: [],
          },
          onSelectSampleModel: vi.fn(),
          onUploadCustomGCode: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="model-selector"');
      expect(html).toContain('data-testid="model-card-cube"');
      expect(html).toContain('data-testid="model-card-benchy"');
      expect(html).toContain('data-testid="model-card-quick_pad"');
      expect(html).toContain('data-testid="dropzone-gcode"');
      expect(html).toContain('data-testid="model-summary-card"');
      expect(html).toContain('calibration_cube.gcode');
      expect(html).toContain('20x20x20.0');
      expect(html).toContain('100'); // layers
    });
  });

  describe('7. FluiddDashboard Orchestrator Component', () => {
    it('should render dark slate header, status badge, emergency stop M112, and tabs', () => {
      const html = renderToString(
        React.createElement(FluiddDashboard, {
          telemetry: mockTelemetry,
          speedMultiplier: 1,
          activeModelId: 'quick_pad',
          onStartPrint: vi.fn(),
          onPausePrint: vi.fn(),
          onResumePrint: vi.fn(),
          onAbortPrint: vi.fn(),
          onStepPrint: vi.fn(),
          onEmergencyStop: vi.fn(),
          onResetFaults: vi.fn(),
          onSetSpeedMultiplier: vi.fn(),
          onJog: vi.fn(),
          onHome: vi.fn(),
          onExtrude: vi.fn(),
          onRetract: vi.fn(),
          onSetHotendTarget: vi.fn(),
          onSetBedTarget: vi.fn(),
          onSetFanSpeed: vi.fn(),
          onSendCommand: vi.fn(),
          onClearTerminal: vi.fn(),
          onSetNozzleClog: vi.fn(),
          onSetSpaghettiMode: vi.fn(),
          onTriggerLayerShift: vi.fn(),
          onSetFilamentRunout: vi.fn(),
          onSimulateThermalRunaway: vi.fn(),
          onResetFailures: vi.fn(),
          onSelectSampleModel: vi.fn(),
          onUploadCustomGCode: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="fluidd-dashboard"');
      expect(html).toContain('FLUIDD');
      expect(html).toContain('data-testid="printer-status-badge"');
      expect(html).toContain('data-testid="btn-emergency-stop"');
      expect(html).toContain('EMERGENCY STOP (M112)');
      expect(html).toContain('data-testid="btn-clear-faults"');
      expect(html).toContain('data-testid="tab-control"');
      expect(html).toContain('data-testid="tab-thermals"');
      expect(html).toContain('data-testid="tab-terminal"');
      expect(html).toContain('data-testid="tab-failures"');
      expect(html).toContain('data-testid="tab-models"');
      expect(html).toContain('data-testid="tab-all"');
    });

    it('should render prominent emergency halt banner when status is ERROR/HALTED', () => {
      const htmlHalted = renderToString(
        React.createElement(FluiddDashboard, {
          telemetry: {
            ...mockTelemetry,
            status: 'HALTED',
            statusMessage: 'Emergency stop activated!',
          },
          speedMultiplier: 1,
          activeModelId: 'quick_pad',
          onStartPrint: vi.fn(),
          onPausePrint: vi.fn(),
          onResumePrint: vi.fn(),
          onAbortPrint: vi.fn(),
          onStepPrint: vi.fn(),
          onEmergencyStop: vi.fn(),
          onResetFaults: vi.fn(),
          onSetSpeedMultiplier: vi.fn(),
          onJog: vi.fn(),
          onHome: vi.fn(),
          onExtrude: vi.fn(),
          onRetract: vi.fn(),
          onSetHotendTarget: vi.fn(),
          onSetBedTarget: vi.fn(),
          onSetFanSpeed: vi.fn(),
          onSendCommand: vi.fn(),
          onClearTerminal: vi.fn(),
          onSetNozzleClog: vi.fn(),
          onSetSpaghettiMode: vi.fn(),
          onTriggerLayerShift: vi.fn(),
          onSetFilamentRunout: vi.fn(),
          onSimulateThermalRunaway: vi.fn(),
          onResetFailures: vi.fn(),
          onSelectSampleModel: vi.fn(),
          onUploadCustomGCode: vi.fn(),
        })
      );

      expect(htmlHalted).toContain('data-testid="halt-alert-banner"');
      expect(htmlHalted).toContain('FIRMWARE HALTED');
    });
  });

  describe('8. Subsystems End-to-End Integration Tests', () => {
    it('should properly link TelemetryStore, ThermalModel, FailureManager, and GCodeExecutor', async () => {
      const thermal = new ThermalModel();
      const failures = new FailureManager(thermal);
      const store = new TelemetryStore();
      const executor = new GCodeExecutor({}, thermal, failures);

      // Load Quick Pad G-code
      const padModel = SAMPLE_MODELS.quick_pad;
      const summary = await executor.loadGCode(padModel.getGCode(), 'quick_pad.gcode');

      expect(summary.totalLayers).toBe(5);
      expect(summary.totalLines).toBeGreaterThan(10);

      // Test temperature target dispatch
      thermal.setHotendTarget(200);
      thermal.setBedTarget(60);
      expect(thermal.getHotend().target).toBe(200);
      expect(thermal.getBed().target).toBe(60);

      // Sync to telemetry store and verify
      store.updateHotend(thermal.getHotend());
      store.updateBed(thermal.getBed());
      expect(store.getState().hotend.target).toBe(200);
      expect(store.getState().bed.target).toBe(60);

      // Test cold extrusion blocking in executor at ambient temperature (21°C)
      expect(thermal.canExtrude()).toBe(false);
      executor.executeImmediateCommand('G1 E10 F300');
      expect(executor.getKinematics().getState().currentPosition.e).toBe(0);

      // Warm up hotend directly and verify extrusion unlocks
      thermal.setActualTemperatureDirect('hotend', 205);
      expect(thermal.canExtrude()).toBe(true);
      executor.executeImmediateCommand('G1 E10 F300');
      expect(executor.getKinematics().getState().currentPosition.e).toBe(10);

      // Test jog command
      executor.executeImmediateCommand('G1 X50 Y75 F3000');
      expect(executor.getKinematics().getState().currentPosition.x).toBe(50);
      expect(executor.getKinematics().getState().currentPosition.y).toBe(75);

      // Test layer shift failure injection
      failures.triggerLayerShift(10, -5);
      expect(failures.getLayerShiftOffset().x).toBe(10);
      expect(failures.getLayerShiftOffset().y).toBe(-5);

      // Physical position in kinematics includes layer shift
      executor.getKinematics().setLayerShiftOffset(10, -5);
      const physicalPos = executor.getKinematics().getPhysicalPosition();
      expect(physicalPos.x).toBe(60); // 50 + 10
      expect(physicalPos.y).toBe(70); // 75 - 5

      // Test emergency stop (M112)
      executor.executeImmediateCommand('M112');
      expect(executor.getState()).toBe('ERROR');
      expect(thermal.getHotend().target).toBe(0);
      expect(thermal.getBed().target).toBe(0);
      expect(executor.getKinematics().getState().steppersEnabled).toBe(false);
      expect(thermal.getFanSpeed()).toBe(1.0); // Full cooling
    });
  });
});
