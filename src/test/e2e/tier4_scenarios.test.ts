import { describe, it, expect, beforeEach } from 'vitest';
import { TestSimulatorHarness } from './harness';
import { ExecutionState } from '../../core/gcode/types';

describe('Tier 4: Real-World Workload Scenarios Test Suite (S1 - S6)', () => {
  let harness: TestSimulatorHarness;

  beforeEach(() => {
    // Calibrated hotend with thermal headroom for part cooling fan at 100%
    harness = new TestSimulatorHarness({
      thermal: {
        hotendParams: { kHeat: 5.2, kFan: 0.003 },
      },
    });
  });

  // =========================================================================
  // Scenario 1: Complete Calibration Cube Print Lifecycle
  // =========================================================================
  it('S1: complete Calibration Cube print lifecycle (preheat -> home -> prime -> print layers -> finish -> cooldown)', async () => {
    // 1. Ingest Calibration Cube model
    const summary = await harness.loadSampleModel('cube');
    expect(summary.totalLayers).toBeGreaterThan(0);
    expect(summary.totalFilamentMm).toBeGreaterThan(0);
    const dx = summary.boundingBox.maxX - summary.boundingBox.minX;
    const dy = summary.boundingBox.maxY - summary.boundingBox.minY;
    const dz = summary.boundingBox.maxZ - summary.boundingBox.minZ;
    // Bounding box includes skirt (diameter ~32mm around 20mm cube)
    expect(dx).toBeCloseTo(32, 1);
    expect(dy).toBeCloseTo(32, 1);
    expect(dz).toBeCloseTo(19.8, 1);

    // 2. Preheat bed (60°C) and hotend (200°C)
    harness.thermal.setActualTemperatureDirect('hotend', 200);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(200);
    harness.setBedTarget(60);
    expect(harness.canExtrude()).toBe(true);

    // 3. Home printer axes
    harness.home();
    expect(harness.isHomed()).toEqual({ x: true, y: true, z: true });
    expect(harness.getNominalPosition().x).toBe(0);
    expect(harness.getNominalPosition().y).toBe(0);
    expect(harness.getNominalPosition().z).toBe(0);

    // 4. Start print job at high-speed playback multiplier (100x)
    harness.setSpeedMultiplier(100);
    harness.startPrint();
    expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
    expect(['PRINTING', 'HEATING']).toContain(harness.getState().status);

    // 5. Advance through initial layers and verify telemetry progression
    harness.advanceTime(15.0);
    const midJob = harness.getState().job;
    expect(midJob.progressPercent).toBeGreaterThan(0);
    expect(harness.getToolpathCount()).toBeGreaterThan(50);
    expect(midJob.filamentUsedMm).toBeGreaterThan(0);

    // 6. Run to complete execution
    const completed = harness.runUntil(
      (h) => h.executor.getState() === ExecutionState.COMPLETED,
      300,
      0.5
    );
    expect(completed).toBe(true);
    expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    expect(harness.getState().status).toBe('IDLE');

    // 7. Post-print cooldown and stepper release
    harness.sendCommand('M104 S0');
    harness.sendCommand('M140 S0');
    harness.sendCommand('M84');
    harness.advanceTime(1.0);

    expect(harness.getHotendTemp().target).toBe(0);
    expect(harness.getBedTemp().target).toBe(0);
    expect(harness.executor.getKinematics().getState().steppersEnabled).toBe(false);
  });

  // =========================================================================
  // Scenario 2: Emergency Stop & Firmware Recovery Workflow
  // =========================================================================
  it('S2: emergency stop mid-print and firmware recovery workflow (print -> M112 -> verify halt/cooldown -> reset -> re-home)', async () => {
    // 1. Load model, preheat, and start active print
    await harness.loadSampleModel('quick_pad');
    harness.thermal.setActualTemperatureDirect('hotend', 205);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(205);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(10);
    harness.startPrint();
    harness.advanceTime(2.0);
    expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);

    // 2. Mid-print Emergency Stop triggered via terminal
    harness.sendCommand('M112');

    // 3. Verify firmware emergency shutdown
    expect(harness.executor.getState()).toBe(ExecutionState.ERROR);
    expect(harness.getState().status).toBe('HALTED');
    expect(harness.getHotendTemp().target).toBe(0);
    expect(harness.getBedTemp().target).toBe(0);
    expect(harness.thermal.getFanSpeed()).toBe(1.0); // Fan at 100%
    expect(harness.executor.getKinematics().getState().steppersEnabled).toBe(false);

    // 4. Verify motion commands are rejected during halt
    const posBefore = harness.getNominalPosition();
    harness.jog('X', 10);
    expect(harness.getNominalPosition().x).toBe(posBefore.x);

    // 5. Clear faults and restore firmware
    harness.resetFaults();
    expect(harness.executor.getState()).toBe(ExecutionState.IDLE);
    expect(harness.getState().status).toBe('IDLE');
    expect(harness.thermal.isThermalRunaway()).toBe(false);

    // 6. Re-home all axes
    harness.home();
    expect(harness.isHomed()).toEqual({ x: true, y: true, z: true });
    expect(harness.getNominalPosition().x).toBe(0);
    expect(harness.getNominalPosition().y).toBe(0);
    expect(harness.getNominalPosition().z).toBe(0);
  });

  // =========================================================================
  // Scenario 3: Mid-Print Filament Runout & Resume Workflow
  // =========================================================================
  it('S3: mid-print filament runout and resume workflow (print -> runout trips -> auto-park -> reload -> resume)', async () => {
    // 1. Start Quick Pad print
    await harness.loadSampleModel('quick_pad');
    harness.thermal.setActualTemperatureDirect('hotend', 205);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(205);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(10);
    harness.startPrint();

    // Advance until layer 1
    harness.advanceTime(2.0);
    expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
    const preRunoutZ = harness.getNominalPosition().z;

    // 2. Filament runout sensor trips
    harness.setFilamentRunout(true);
    harness.advanceTime(0.1);

    // 3. Verify auto-pause, parking at (10, 10, Z+5), and prompt emission
    expect(harness.executor.getState()).toBe(ExecutionState.PAUSED);
    expect(harness.getState().status).toBe('PAUSED');
    expect(harness.getNominalPosition().x).toBe(10);
    expect(harness.getNominalPosition().y).toBe(10);
    expect(harness.getNominalPosition().z).toBeCloseTo(preRunoutZ + 5.0, 1);
    expect(harness.getLastTerminalLine()).toContain('Filament runout sensor triggered');

    // 4. Operator loads new spool: clear runout sensor
    harness.setFilamentRunout(false);
    expect(harness.failures.getConfig().filamentRunout).toBe(false);

    // 5. Operator clicks Resume Print
    harness.resumePrint();
    expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);

    // 6. Complete print cleanly at high speed
    harness.setSpeedMultiplier(100);
    const completed = harness.runUntil(
      (h) => h.executor.getState() === ExecutionState.COMPLETED,
      120,
      0.5
    );
    expect(completed).toBe(true);
    expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    expect(harness.getState().status).toBe('IDLE');
  });

  // =========================================================================
  // Scenario 4: Layer Shift Mid-Print & Toolpath Compensation
  // =========================================================================
  it('S4: layer shift mid-print and physical coordinate transformation (print -> shift -> physical offset -> complete)', async () => {
    await harness.loadSampleModel('quick_pad');
    harness.thermal.setActualTemperatureDirect('hotend', 205);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(205);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(5);
    harness.startPrint();

    // Advance through layer 0
    harness.advanceTime(0.5);
    expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);

    // Inject hardware layer shift (+15mm X, +8mm Y)
    harness.triggerLayerShift(15, 8);
    expect(harness.failures.getConfig().layerShift).toEqual({ x: 15, y: 8 });

    // Advance move under shifted coordinate frame
    harness.advanceTime(2.0);
    const nom = harness.getNominalPosition();
    const phys = harness.getPhysicalPosition();

    // Physical position must reflect exact shift offset
    expect(phys.x).toBeCloseTo(nom.x + 15, 1);
    expect(phys.y).toBeCloseTo(nom.y + 8, 1);

    // Complete the print
    harness.setSpeedMultiplier(100);
    const finished = harness.runUntil(
      (h) => h.executor.getState() === ExecutionState.COMPLETED,
      120,
      0.5
    );
    expect(finished).toBe(true);
  });

  // =========================================================================
  // Scenario 5: Thermal Runaway Detection During Preheat
  // =========================================================================
  it('S5: thermal runaway detection and safety shutdown during preheat (stalled rise -> watchdog trips M112 -> recover)', () => {
    // 1. Commanded hotend to 215°C with disconnected heater cartridge
    harness.setHotendTarget(215);
    harness.thermal.setSimulatedFailure('hotend', true);

    // 2. Advance time past tau_watch (25s)
    harness.advanceTime(26.0);

    // 3. Watchdog must trip runaway shutdown
    expect(harness.thermal.isThermalRunaway()).toBe(true);
    expect(harness.getState().status).toBe('HALTED');
    expect(harness.getState().statusMessage).toContain('failed to rise by 2°C');
    expect(harness.getHotendTemp().target).toBe(0);
    expect(harness.thermal.getFanSpeed()).toBe(1.0); // Max cooling

    // 4. Operator fixes heater connection and clears faults
    harness.resetFaults();
    expect(harness.thermal.isThermalRunaway()).toBe(false);
    expect(harness.getState().status).toBe('IDLE');

    // 5. Normal preheat now succeeds
    harness.setHotendTarget(200);
    harness.advanceTime(75.0);
    expect(harness.thermal.isThermalRunaway()).toBe(false);
    expect(harness.getHotendTemp().actual).toBeGreaterThan(150.0);
  });

  // =========================================================================
  // Scenario 6: Multi-Model Sequential Print Workflow (Pad -> Clear -> Benchy)
  // =========================================================================
  it('S6: multi-model sequential print workflow (Quick Pad -> complete -> clear -> Benchy -> print)', async () => {
    // 1. Load and execute first model (Quick Pad)
    await harness.loadSampleModel('quick_pad');
    harness.thermal.setActualTemperatureDirect('hotend', 205);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(205);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(100);
    harness.startPrint();

    const padDone = harness.runUntil(
      (h) => h.executor.getState() === ExecutionState.COMPLETED,
      120,
      0.5
    );
    expect(padDone).toBe(true);
    expect(harness.getState().job.currentLayer).toBe(4);
    const padToolpaths = harness.getToolpathCount();
    expect(padToolpaths).toBeGreaterThan(0);

    // 2. Operator clears bed and loads second model (3DBenchy)
    harness.abortPrint(); // Clears toolpaths and resets job
    expect(harness.getToolpathCount()).toBe(0);

    const benchySummary = await harness.loadSampleModel('benchy');
    expect(benchySummary.totalLayers).toBeGreaterThan(10);
    expect(harness.getState().job.currentLayer).toBe(0);
    expect(harness.getState().job.progressPercent).toBe(0);

    // 3. Pre-heat and start 3DBenchy print at 100x speed
    harness.thermal.setActualTemperatureDirect('hotend', 205);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(205);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(100);
    harness.startPrint();
    expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);

    // Advance through Benchy layers
    harness.advanceTime(30.0);
    expect(harness.getToolpathCount()).toBeGreaterThan(50);
    expect(harness.getState().job.currentLayer).toBeGreaterThan(0);
    expect(harness.getState().job.filamentUsedMm).toBeGreaterThan(0);
  });
});
