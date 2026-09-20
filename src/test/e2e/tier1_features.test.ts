import { describe, it, expect, beforeEach } from 'vitest';
import { TestSimulatorHarness } from './harness';
import { ExecutionState } from '../../core/gcode/types';
import { ToolpathType } from '../../core/kinematics/types';
import { SAMPLE_MODELS } from '../../core/gcode/sampleModels';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Feature Coverage Test Suite (F1 - F16)', () => {
  let harness: TestSimulatorHarness;

  beforeEach(() => {
    harness = new TestSimulatorHarness();
  });

  // =========================================================================
  // F1: G-Code Parsing (G0/G1/G28/G90/G91/G92)
  // =========================================================================
  describe('F1: G-Code Parsing', () => {
    it('F1-1: parses linear motion G0/G1 with full Cartesian coordinates and feedrate', async () => {
      const summary = await harness.loadGCode('G1 X100.5 Y50.2 Z10.0 E5.25 F2400');
      expect(summary.totalLines).toBe(1);
      harness.startPrint();
      harness.advanceTime(5.0);
      const pos = harness.getNominalPosition();
      expect(pos.x).toBeCloseTo(100.5, 1);
      expect(pos.y).toBeCloseTo(50.2, 1);
      expect(pos.z).toBeCloseTo(10.0, 1);
    });

    it('F1-2: parses auto-homing G28 for all axes', async () => {
      harness.sendCommand('G1 X50 Y50 Z20 F3000');
      harness.sendCommand('G28');
      const pos = harness.getNominalPosition();
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
      expect(pos.z).toBe(0);
      expect(harness.isHomed()).toEqual({ x: true, y: true, z: true });
    });

    it('F1-3: parses auto-homing G28 for individual axes', () => {
      harness.sendCommand('G1 X40 Y60 Z15 F3000');
      harness.home({ x: true });
      const pos = harness.getNominalPosition();
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(60);
      expect(pos.z).toBe(15);
      expect(harness.isHomed().x).toBe(true);
      expect(harness.isHomed().y).toBe(false);
    });

    it('F1-4: parses absolute (G90) and relative (G91) positioning modes', async () => {
      harness.sendCommand('G90');
      expect(harness.executor.getKinematics().getState().isRelativePositioning).toBe(false);
      harness.sendCommand('G1 X10 F3000');
      harness.sendCommand('G91');
      expect(harness.executor.getKinematics().getState().isRelativePositioning).toBe(true);
      harness.sendCommand('G1 X10 F3000');
      const pos = harness.getNominalPosition();
      expect(pos.x).toBeCloseTo(20, 1);
    });

    it('F1-5: parses coordinate reset G92 without physical movement', async () => {
      harness.sendCommand('G1 X30 Y30 F3000');
      harness.sendCommand('G92 X0 Y0');
      const pos = harness.getNominalPosition();
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
    });

    it('F1-6: strips comments (; and ()) and ignores whitespace/blank lines', async () => {
      const gcode = [
        '; Initial Setup Comment',
        '   ',
        'G1 X25 (Inline parenthesis comment) Y30 ; trailing comment',
        '   ; only whitespace before comment',
        'G1 Z5',
      ].join('\n');
      const summary = await harness.loadGCode(gcode);
      expect(summary.totalLines).toBe(2);
    });
  });

  // =========================================================================
  // F2: Extrusion Modes (M82/M83, G92 E0)
  // =========================================================================
  describe('F2: Extrusion Modes', () => {
    it('F2-1: supports cumulative extrusion in absolute mode M82', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      const gcode = ['M82', 'G1 E2 F600', 'G1 E5 F600', 'G1 E10 F600'].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.runUntilComplete(20);
      expect(harness.getNominalPosition().e).toBeCloseTo(10, 1);
    });

    it('F2-2: supports incremental extrusion in relative mode M83', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      const gcode = ['M83', 'G1 E2 F600', 'G1 E3 F600', 'G1 E5 F600'].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.runUntilComplete(20);
      expect(harness.getNominalPosition().e).toBeCloseTo(10, 1);
    });

    it('F2-3: resets cumulative extrusion tracker on G92 E0', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      harness.sendCommand('G92 E0');
      expect(harness.getNominalPosition().e).toBe(0);
      harness.sendCommand('G1 E15 F600');
      expect(harness.getNominalPosition().e).toBeCloseTo(15, 1);
      harness.sendCommand('G92 E0');
      expect(harness.getNominalPosition().e).toBe(0);
    });

    it('F2-4: handles filament retraction (negative delta E) without toolpath emission', async () => {
      harness.setHotendTarget(200);
      harness.advanceTime(15);
      harness.sendCommand('G92 E10');
      const toolpathsBefore = harness.getToolpathCount();
      harness.retract(2); // retract 2mm
      expect(harness.getNominalPosition().e).toBeCloseTo(8, 1);
      // Retract should not create new positive extrusion toolpaths
      expect(harness.getToolpathCount()).toBe(toolpathsBefore);
    });

    it('F2-5: toggles extruder mode dynamically between M82 and M83', () => {
      harness.sendCommand('M82');
      expect(harness.executor.getKinematics().getState().isRelativeExtruder).toBe(false);
      harness.sendCommand('M83');
      expect(harness.executor.getKinematics().getState().isRelativeExtruder).toBe(true);
    });
  });

  // =========================================================================
  // F3: Playback Controls (Play/Pause/Step/Abort/1x-100x)
  // =========================================================================
  describe('F3: Playback Controls', () => {
    it('F3-1: transitions to RUNNING on startPrint', async () => {
      await harness.loadGCode('G1 X50 Y50 F600\nG1 X100 Y100 F600');
      expect(harness.executor.getState()).toBe(ExecutionState.IDLE);
      harness.startPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
    });

    it('F3-2: pauses execution on pausePrint and freezes motion', async () => {
      await harness.loadGCode('G1 X100 Y100 F600');
      harness.startPrint();
      harness.advanceTime(1.0);
      harness.pausePrint();
      expect(harness.executor.getState()).toBe(ExecutionState.PAUSED);
      const posAtPause = harness.getNominalPosition();
      harness.advanceTime(3.0);
      const posAfterWait = harness.getNominalPosition();
      expect(posAfterWait.x).toBeCloseTo(posAtPause.x, 2);
    });

    it('F3-3: resumes execution on resumePrint', async () => {
      await harness.loadGCode('G1 X100 Y100 F1200');
      harness.startPrint();
      harness.advanceTime(1.0);
      harness.pausePrint();
      harness.resumePrint();
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
      harness.runUntilComplete(20);
      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    });

    it('F3-4: executes single discrete step forward in stepPrint mode', async () => {
      await harness.loadGCode('G1 X20 F1200\nG1 X40 F1200\nG1 X60 F1200');
      harness.pausePrint();
      harness.stepPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.PAUSED);
    });

    it('F3-5: aborts print immediately, clears queue, turns off heaters', async () => {
      harness.setHotendTarget(200);
      harness.setBedTarget(60);
      await harness.loadGCode('G1 X100 Y100 F300');
      harness.startPrint();
      harness.advanceTime(1.0);
      harness.abortPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.ABORTED);
      expect(harness.getHotendTemp().target).toBe(0);
      expect(harness.getBedTemp().target).toBe(0);
    });

    it('F3-6: scales playback speed with multiplier from 1x to 100x', () => {
      harness.setSpeedMultiplier(5);
      expect(harness.executor.getSpeedMultiplier()).toBe(5);
      harness.setSpeedMultiplier(100);
      expect(harness.executor.getSpeedMultiplier()).toBe(100);
      harness.setSpeedMultiplier(150); // clamped to 100 max
      expect(harness.executor.getSpeedMultiplier()).toBe(100);
    });
  });

  // =========================================================================
  // F4: Pre-sliced Models & Ingestion
  // =========================================================================
  describe('F4: Pre-sliced Models & Ingestion', () => {
    it('F4-1: ingests Calibration Cube sample model with 100 layers', async () => {
      const summary = await harness.loadSampleModel('cube');
      expect(summary.totalLayers).toBe(100);
      expect(summary.fileName).toContain('Calibration Cube');
      expect(summary.totalLines).toBeGreaterThan(500);
    });

    it('F4-2: ingests 3DBenchy sample model with 60 layers', async () => {
      const summary = await harness.loadSampleModel('benchy');
      expect(summary.totalLayers).toBe(60);
      expect(summary.fileName).toContain('3DBenchy');
      expect(summary.totalLines).toBeGreaterThan(500);
    });

    it('F4-3: ingests Quick Test Pad sample model with 5 layers', async () => {
      const summary = await harness.loadSampleModel('quick_pad');
      expect(summary.totalLayers).toBe(5);
      expect(summary.totalLines).toBeGreaterThan(20);
    });

    it('F4-4: ingests custom user G-code string via loadGCode', async () => {
      const customGCode = '; My Custom Part\nG28\nG1 Z0.2 F1000\nG1 X50 Y50 E1 F1500';
      const summary = await harness.loadGCode(customGCode, 'custom_part.gcode');
      expect(summary.fileName).toBe('custom_part.gcode');
      expect(summary.totalLines).toBe(3);
    });

    it('F4-5: provides estimated print time and dimension bounds in summary', async () => {
      const summary = await harness.loadSampleModel('cube');
      expect(summary.estimatedPrintTimeSeconds).toBeGreaterThan(0);
      expect(summary.boundingBox.maxX).toBeGreaterThan(summary.boundingBox.minX);
      expect(summary.boundingBox.maxY).toBeGreaterThan(summary.boundingBox.minY);
      expect(summary.boundingBox.maxZ).toBeGreaterThan(summary.boundingBox.minZ);
    });
  });

  // =========================================================================
  // F5: Thermal Dynamics Math (Newton/Joule ODE & PID)
  // =========================================================================
  describe('F5: Thermal Dynamics Math', () => {
    it('F5-1: integrates exponential rise toward hotend setpoint', () => {
      harness.setHotendTarget(200);
      const initial = harness.getHotendTemp().actual;
      harness.advanceTime(5.0);
      const after5s = harness.getHotendTemp().actual;
      expect(after5s).toBeGreaterThan(initial + 10);
      harness.advanceTime(90.0);
      expect(harness.getHotendTemp().actual).toBeCloseTo(200, 0);
    });

    it('F5-2: integrates exponential rise toward bed setpoint', () => {
      harness.setBedTarget(60);
      const initial = harness.getBedTemp().actual;
      harness.advanceTime(10.0);
      const after10s = harness.getBedTemp().actual;
      expect(after10s).toBeGreaterThan(initial + 3);
      harness.advanceTime(140.0);
      expect(harness.getBedTemp().actual).toBeGreaterThan(58);
      expect(harness.getBedTemp().actual).toBeLessThanOrEqual(61);
    });

    it('F5-3: exhibits Newton cooling toward ambient when heater power is zero', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(0);
      harness.advanceTime(30.0);
      const cooled = harness.getHotendTemp().actual;
      expect(cooled).toBeLessThan(200);
      expect(cooled).toBeGreaterThan(21.0);
    });

    it('F5-4: clamps PID controller output within [0.0, 1.0]', () => {
      harness.setHotendTarget(250);
      harness.advanceTime(1.0);
      const power = harness.getHotendTemp().power;
      expect(power).toBeGreaterThanOrEqual(0);
      expect(power).toBeLessThanOrEqual(1.0);
    });

    it('F5-5: maintains steady-state temperature stability within ±1.0°C', () => {
      harness.setHotendTarget(210);
      harness.advanceTime(140.0);
      for (let i = 0; i < 10; i++) {
        harness.advanceTime(1.0);
        expect(Math.abs(harness.getHotendTemp().actual - 210)).toBeLessThan(1.0);
      }
    });

    it('F5-6: increases convective cooling rate when part cooling fan is activated', () => {
      // Hotend at 200°C without fan
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(0);
      harness.setFanSpeed(0.0);
      harness.advanceTime(10.0);
      const tempNoFan = harness.getHotendTemp().actual;

      // Hotend at 200°C with 100% fan
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(0);
      harness.setFanSpeed(1.0);
      harness.advanceTime(10.0);
      const tempWithFan = harness.getHotendTemp().actual;

      expect(tempWithFan).toBeLessThan(tempNoFan);
    });
  });

  // =========================================================================
  // F6: Temperature G-Codes (M104/M109/M140/M190/M105)
  // =========================================================================
  describe('F6: Temperature G-Codes', () => {
    it('F6-1: sets hotend target asynchronously with M104', () => {
      harness.sendCommand('M104 S215');
      expect(harness.getHotendTemp().target).toBe(215);
    });

    it('F6-2: sets bed target asynchronously with M140', () => {
      harness.sendCommand('M140 S65');
      expect(harness.getBedTemp().target).toBe(65);
    });

    it('F6-3: blocks motion until hotend temperature is reached with M109', async () => {
      const gcode = ['M109 S100', 'G1 X50 F3000'].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();

      // Before reaching 100°C, motion must be held at (0, 0)
      harness.advanceTime(5.0);
      expect(harness.getHotendTemp().actual).toBeLessThan(100);
      expect(harness.getNominalPosition().x).toBe(0);

      // Advance until target reached
      harness.runUntil(() => harness.getHotendTemp().actual >= 99.0, 60);
      harness.advanceTime(5.0); // allow motion to execute
      expect(harness.getNominalPosition().x).toBeCloseTo(50, 1);
    });

    it('F6-4: blocks motion until bed temperature is reached with M190', async () => {
      const gcode = ['M190 S40', 'G1 Y40 F3000'].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();

      harness.advanceTime(5.0);
      expect(harness.getBedTemp().actual).toBeLessThan(40);
      expect(harness.getNominalPosition().y).toBe(0);

      harness.runUntil(() => harness.getBedTemp().actual >= 39.0, 120);
      harness.advanceTime(5.0);
      expect(harness.getNominalPosition().y).toBeCloseTo(40, 1);
    });

    it('F6-5: returns standard temperature report format on M105', () => {
      harness.setHotendTarget(200);
      harness.setBedTarget(60);
      harness.advanceTime(2.0);
      harness.sendCommand('M105');
      const lines = harness.getTerminalLines();
      const m105Line = lines.find((l) => l.includes('T:') && l.includes('B:'));
      expect(m105Line).toBeDefined();
      expect(m105Line).toMatch(/T:\d+\.\d+\s+\/200\.0\s+B:\d+\.\d+\s+\/60\.0/);
    });
  });

  // =========================================================================
  // F7: Cold Extrusion Prevention (< 170°C)
  // =========================================================================
  describe('F7: Cold Extrusion Prevention', () => {
    it('F7-1: rejects extrusion move when hotend is at ambient (21°C)', () => {
      expect(harness.canExtrude()).toBe(false);
      harness.sendCommand('G1 E10 F300');
      expect(harness.getNominalPosition().e).toBe(0);
      expect(harness.getTerminalLines().some((l) => l.includes('cold extrusion prevented'))).toBe(true);
    });

    it('F7-2: rejects extrusion at boundary temperature 169.5°C', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 169.5);
      expect(harness.canExtrude()).toBe(false);
      harness.sendCommand('G1 E5 F300');
      expect(harness.getNominalPosition().e).toBe(0);
    });

    it('F7-3: permits extrusion once hotend reaches 170.0°C threshold', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 170.0);
      expect(harness.canExtrude()).toBe(true);
      harness.sendCommand('G1 E5 F300');
      expect(harness.getNominalPosition().e).toBeCloseTo(5, 1);
    });

    it('F7-4: blocks manual jog extrude via dashboard helper when cold', () => {
      const allowed = harness.extrude(5);
      expect(allowed).toBe(false);
      expect(harness.getNominalPosition().e).toBe(0);
    });

    it('F7-5: allows travel moves (deltaE = 0) even when hotend is cold', () => {
      expect(harness.getHotendTemp().actual).toBeLessThan(170);
      harness.sendCommand('G1 X50 Y50 F3000');
      const pos = harness.getNominalPosition();
      expect(pos.x).toBeCloseTo(50, 1);
      expect(pos.y).toBeCloseTo(50, 1);
    });
  });

  // =========================================================================
  // F8: Thermal Runaway Safety Watchdogs & M112
  // =========================================================================
  describe('F8: Thermal Runaway Safety Watchdogs & M112', () => {
    it('F8-1: trips heating watchdog if hotend fails to rise by 2°C within tau_watch (25s)', () => {
      harness.setHotendTarget(220);
      // Simulate disconnected heater cartridge (delivering 0 heat)
      harness.thermal.setSimulatedFailure('hotend', true);
      harness.advanceTime(26.0);
      expect(harness.thermal.isThermalRunaway()).toBe(true);
      expect(harness.getState().status).toBe('HALTED');
    });

    it('F8-2: trips in-range watchdog if hotend drops >10°C below setpoint under full power', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      harness.advanceTime(0.5); // reach steady state
      expect(Math.abs(harness.getHotendTemp().actual - 200)).toBeLessThan(2.0);

      // Force sudden drop to 180°C and simulate heater failure
      harness.thermal.setActualTemperatureDirect('hotend', 180);
      harness.thermal.setSimulatedFailure('hotend', true);
      harness.advanceTime(16.0);
      expect(harness.thermal.isThermalRunaway()).toBe(true);
    });

    it('F8-3: trips MINTEMP watchdog if sensor reads disconnected open circuit (<-10°C)', () => {
      harness.thermal.setActualTemperatureDirect('hotend', -15);
      harness.advanceTime(0.2);
      expect(harness.thermal.isThermalRunaway()).toBe(true);
      expect(harness.thermal.getErrorReason()).toContain('MINTEMP');
    });

    it('F8-4: trips MAXTEMP watchdog if temperature exceeds 310°C', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 315);
      harness.advanceTime(0.2);
      expect(harness.thermal.isThermalRunaway()).toBe(true);
      expect(harness.thermal.getErrorReason()).toContain('MAXTEMP');
    });

    it('F8-5: executes emergency stop M112, shutting off heaters and enabling max cooling', () => {
      harness.setHotendTarget(220);
      harness.setBedTarget(70);
      harness.sendCommand('M112');
      expect(harness.getHotendTemp().target).toBe(0);
      expect(harness.getBedTemp().target).toBe(0);
      expect(harness.thermal.getFanSpeed()).toBe(1.0);
      expect(harness.getState().status).toBe('HALTED');
    });

    it('F8-6: clears fault status and restores ready state on resetFaults', () => {
      harness.sendCommand('M112');
      expect(harness.thermal.isThermalRunaway()).toBe(true);
      harness.resetFaults();
      expect(harness.thermal.isThermalRunaway()).toBe(false);
      expect(harness.getState().status).toBe('IDLE');
    });
  });

  // =========================================================================
  // F9: Hardware Failure Modes (Clog/Spaghetti/Shift/Runout)
  // =========================================================================
  describe('F9: Hardware Failure Modes', () => {
    it('F9-1: halts filament deposition during FULL nozzle clog (air printing)', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      harness.setNozzleClog('FULL');

      await harness.loadGCode('G1 X50 E5 F1200');
      harness.startPrint();
      harness.runUntilComplete(10);

      expect(harness.getNominalPosition().x).toBeCloseTo(50, 1);
      // Toolpaths should not have recorded positive extrusion
      expect(harness.getToolpathCount()).toBe(0);
    });

    it('F9-2: scales extrusion to 25% flow during PARTIAL nozzle clog', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      harness.setNozzleClog('PARTIAL');

      await harness.loadGCode('G1 X40 E10 F1200');
      harness.startPrint();
      harness.runUntilComplete(10);

      expect(harness.getNominalPosition().x).toBeCloseTo(40, 1);
      expect(harness.getNominalPosition().e).toBeCloseTo(2.5, 1);
    });

    it('F9-3: generates procedural curly noodles when spaghetti mode is active', () => {
      harness.setSpaghettiMode(true);
      harness.toolpaths.appendSegment({
        startX: 10,
        startY: 10,
        startZ: 0.2,
        endX: 20,
        endY: 10,
        endZ: 0.2,
        extrusionLength: 1.0,
        feedrate: 1500,
        type: ToolpathType.WALL_OUTER,
        layerIndex: 1,
        commandIndex: 1,
      });
      // 1 segment replaced by multiple curly noodle segments
      expect(harness.getToolpathCount()).toBeGreaterThan(1);
    });

    it('F9-4: injects hardware coordinate offset into physical position on layer shift', () => {
      harness.sendCommand('G1 X50 Y50 F3000');
      harness.triggerLayerShift(10, 5);
      const nominal = harness.getNominalPosition();
      const physical = harness.getPhysicalPosition();
      expect(nominal.x).toBeCloseTo(50, 1);
      expect(physical.x).toBeCloseTo(60, 1);
      expect(physical.y).toBeCloseTo(55, 1);
    });

    it('F9-5: trips filament runout, pauses print, and parks toolhead at (10, 10, Z+5)', async () => {
      await harness.loadGCode('G1 Z2 F3000\nG1 X200 Y200 F300\nG1 X0 Y0 F300');
      harness.startPrint();
      harness.advanceTime(1.0); // mid-print

      harness.setFilamentRunout(true);
      harness.advanceTime(0.2);

      expect(harness.executor.getState()).toBe(ExecutionState.PAUSED);
      const pos = harness.getNominalPosition();
      expect(pos.x).toBeCloseTo(10, 1);
      expect(pos.y).toBeCloseTo(10, 1);
      expect(pos.z).toBeCloseTo(7, 1); // 2 + 5
    });

    it('F9-6: resets all active failures back to nominal on resetFailures', () => {
      harness.setNozzleClog('FULL');
      harness.setSpaghettiMode(true);
      harness.triggerLayerShift(5, 5);
      harness.setFilamentRunout(true);

      harness.resetFailures();
      const cfg = harness.failures.getConfig();
      expect(cfg.nozzleClog).toBe('NONE');
      expect(cfg.spaghettiMode).toBe(false);
      expect(cfg.layerShift).toEqual({ x: 0, y: 0 });
      expect(cfg.filamentRunout).toBe(false);
    });
  });

  // =========================================================================
  // F10: Kinematics & 3D Viewport Motion (Cartesian XYZ)
  // =========================================================================
  describe('F10: Kinematics & Cartesian Motion', () => {
    it('F10-1: tracks currentPosition accurately across multi-axis move', () => {
      harness.sendCommand('G1 X120 Y80 Z15 F3000');
      const pos = harness.getNominalPosition();
      expect(pos.x).toBeCloseTo(120, 1);
      expect(pos.y).toBeCloseTo(80, 1);
      expect(pos.z).toBeCloseTo(15, 1);
    });

    it('F10-2: smoothly interpolates printhead over time proportional to distance and feedrate', async () => {
      // 100mm move at 600 mm/min (10 mm/s) takes 10 seconds
      await harness.loadGCode('G1 X100 F600');
      harness.startPrint();
      harness.advanceTime(5.0); // halfway
      const midPos = harness.getNominalPosition();
      expect(midPos.x).toBeGreaterThan(40);
      expect(midPos.x).toBeLessThan(60);
      harness.advanceTime(6.0); // finished
      expect(harness.getNominalPosition().x).toBeCloseTo(100, 1);
    });

    it('F10-3: updates isHomed axis flags on G28 homing', () => {
      expect(harness.isHomed()).toEqual({ x: false, y: false, z: false });
      harness.home({ x: true, y: true });
      expect(harness.isHomed().x).toBe(true);
      expect(harness.isHomed().y).toBe(true);
      expect(harness.isHomed().z).toBe(false);
    });

    it('F10-4: converts mm/min feedrate to mm/s and calculates move duration accurately', () => {
      const kin = harness.executor.getKinematics();
      // Move 60mm at 3600 mm/min (60 mm/s) should take 1.0s
      const move = kin.calculateMove({ x: 60, f: 3600 }, 1, { x: 0, y: 0, z: 0, e: 0 });
      expect(move.durationSeconds).toBeCloseTo(1.0, 2);
    });

    it('F10-5: isolates nominal coordinates from layer shift physical offset', () => {
      harness.sendCommand('G1 X50 Y50 F3000');
      harness.triggerLayerShift(8, -4);
      expect(harness.getNominalPosition().x).toBeCloseTo(50, 1);
      expect(harness.getNominalPosition().y).toBeCloseTo(50, 1);
      expect(harness.getPhysicalPosition().x).toBeCloseTo(58, 1);
      expect(harness.getPhysicalPosition().y).toBeCloseTo(46, 1);
    });
  });

  // =========================================================================
  // F11: Filament Toolpath Deposition (BufferGeometry/Instancing)
  // =========================================================================
  describe('F11: Filament Toolpath Deposition', () => {
    it('F11-1: appends segment vertices to BufferGeometry typed array', () => {
      harness.toolpaths.appendSegment({
        startX: 0,
        startY: 0,
        startZ: 0.2,
        endX: 10,
        endY: 20,
        endZ: 0.2,
        extrusionLength: 1.0,
        feedrate: 1800,
        type: ToolpathType.WALL_OUTER,
        layerIndex: 1,
        commandIndex: 1,
      });
      expect(harness.getToolpathCount()).toBe(1);
      const posBuffer = harness.toolpaths.getPositionBuffer();
      expect(posBuffer[0]).toBe(0);
      expect(posBuffer[1]).toBe(0);
      expect(posBuffer[2]).toBeCloseTo(0.2);
      expect(posBuffer[3]).toBe(10);
      expect(posBuffer[4]).toBe(20);
      expect(posBuffer[5]).toBeCloseTo(0.2);
    });

    it('F11-2: assigns distinct vertex colors for different ToolpathTypes', () => {
      harness.toolpaths.appendSegment({
        startX: 0,
        startY: 0,
        startZ: 0.2,
        endX: 10,
        endY: 0,
        endZ: 0.2,
        extrusionLength: 1.0,
        feedrate: 1800,
        type: ToolpathType.WALL_OUTER, // Orange
        layerIndex: 1,
        commandIndex: 1,
      });
      harness.toolpaths.appendSegment({
        startX: 10,
        startY: 0,
        startZ: 0.2,
        endX: 20,
        endY: 0,
        endZ: 0.2,
        extrusionLength: 1.0,
        feedrate: 1800,
        type: ToolpathType.INFILL, // Cyan
        layerIndex: 1,
        commandIndex: 2,
      });
      const colBuffer = harness.toolpaths.getColorBuffer();
      // Orange (r high, b low) vs Cyan (r low, b high)
      expect(colBuffer[0]).toBeGreaterThan(colBuffer[6]); // r1 > r2
      expect(colBuffer[2]).toBeLessThan(colBuffer[8]); // b1 < b2
    });

    it('F11-3: generates volumetric bead instances on extrusion moves', () => {
      harness.toolpaths.appendSegment({
        startX: 0,
        startY: 0,
        startZ: 0.2,
        endX: 15,
        endY: 0,
        endZ: 0.2,
        extrusionLength: 1.2,
        feedrate: 1800,
        type: ToolpathType.WALL_OUTER,
        layerIndex: 1,
        commandIndex: 1,
      });
      expect(harness.getVolumetricInstanceCount()).toBe(1);
    });

    it('F11-4: suppresses volumetric bead instance on travel moves', () => {
      harness.toolpaths.appendSegment({
        startX: 0,
        startY: 0,
        startZ: 0.2,
        endX: 30,
        endY: 30,
        endZ: 0.2,
        extrusionLength: 0.0,
        feedrate: 6000,
        type: ToolpathType.TRAVEL,
        layerIndex: 1,
        commandIndex: 1,
      });
      expect(harness.getVolumetricInstanceCount()).toBe(0);
      expect(harness.getToolpathCount()).toBe(1);
    });

    it('F11-5: dynamically expands BufferGeometry capacity when initial capacity is exceeded', () => {
      const smallHarness = new TestSimulatorHarness({ initialCapacity: 4 });
      expect(smallHarness.toolpaths.getCapacity()).toBe(4);
      for (let i = 0; i < 6; i++) {
        smallHarness.toolpaths.appendSegment({
          startX: i,
          startY: 0,
          startZ: 0.2,
          endX: i + 1,
          endY: 0,
          endZ: 0.2,
          extrusionLength: 0.1,
          feedrate: 1800,
          type: ToolpathType.WALL_OUTER,
          layerIndex: 1,
          commandIndex: i,
        });
      }
      expect(smallHarness.toolpaths.getCapacity()).toBeGreaterThanOrEqual(8);
      expect(smallHarness.getToolpathCount()).toBe(6);
      smallHarness.dispose();
    });
  });

  // =========================================================================
  // F12: Layer Slicing Preview & Scrubbing
  // =========================================================================
  describe('F12: Layer Slicing Preview & Scrubbing', () => {
    beforeEach(() => {
      // Create 3 layers of toolpaths
      for (let layer = 0; layer < 3; layer++) {
        for (let seg = 0; seg < 5; seg++) {
          harness.toolpaths.appendSegment({
            startX: seg * 10,
            startY: layer * 10,
            startZ: layer * 0.2,
            endX: (seg + 1) * 10,
            endY: layer * 10,
            endZ: layer * 0.2,
            extrusionLength: 0.5,
            feedrate: 1800,
            type: ToolpathType.WALL_OUTER,
            layerIndex: layer,
            commandIndex: layer * 5 + seg,
          });
        }
      }
    });

    it('F12-1: records layer index ranges per layer', () => {
      const ranges = harness.toolpaths.getLayerRanges();
      expect(ranges.size).toBe(3);
      expect(ranges.get(0)).toEqual({ firstSegmentIndex: 0, lastSegmentIndex: 4 });
      expect(ranges.get(1)).toEqual({ firstSegmentIndex: 5, lastSegmentIndex: 9 });
      expect(ranges.get(2)).toEqual({ firstSegmentIndex: 10, lastSegmentIndex: 14 });
    });

    it('F12-2: filters draw range instantly when scrubbing to single layer', () => {
      harness.setLayerFilter(1, 1);
      const drawCount = harness.toolpaths.getActiveDrawCount();
      // 5 segments on layer 1 * 2 vertices = 10 vertices
      expect(drawCount).toBe(10);
    });

    it('F12-3: filters draw range for multi-layer range [0, 1]', () => {
      harness.setLayerFilter(0, 1);
      const drawCount = harness.toolpaths.getActiveDrawCount();
      // 10 segments * 2 vertices = 20 vertices
      expect(drawCount).toBe(20);
    });

    it('F12-4: sets draw range to 0 when filter is outside recorded layers', () => {
      harness.setLayerFilter(5, 10);
      expect(harness.toolpaths.getActiveDrawCount()).toBe(0);
    });

    it('F12-5: updates volumetric bead visibility matching layer filter', () => {
      harness.setRenderMode('volumetric');
      harness.setLayerFilter(0, 0);
      expect(harness.toolpaths.getRenderMode()).toBe('volumetric');
    });
  });

  // =========================================================================
  // F13: Fluidd/Mainsail Dashboard & Live Temp Charts
  // =========================================================================
  describe('F13: Fluidd/Mainsail Dashboard & Live Temp Charts', () => {
    it('F13-1: provides central TelemetryStore single source of truth', () => {
      const state = harness.getState();
      expect(state.status).toBe('IDLE');
      expect(state.hotend.actual).toBeCloseTo(21, 1);
      expect(state.bed.actual).toBeCloseTo(21, 1);
      expect(state.job.speedMultiplier).toBe(1.0);
    });

    it('F13-2: records rolling thermal history points for charts', () => {
      harness.setHotendTarget(180);
      harness.advanceTime(5.0);
      const history = harness.getState().thermalHistory;
      expect(history.length).toBeGreaterThan(0);
      const lastPoint = history[history.length - 1];
      expect(lastPoint.hotendTarget).toBe(180);
      expect(lastPoint.hotendActual).toBeGreaterThan(21);
    });

    it('F13-3: notifies subscribers on telemetry state changes', () => {
      let notified = false;
      const unsubscribe = harness.store.subscribe((state) => {
        if (state.partCoolingFanSpeed === 0.75) {
          notified = true;
        }
      });
      harness.setFanSpeed(0.75);
      expect(notified).toBe(true);
      unsubscribe();
    });

    it('F13-4: updates print metrics with layer, ETA, and filament consumption', async () => {
      await harness.loadGCode(';LAYER:1\nG1 X50 E10 F1200\n;LAYER:2\nG1 X100 E20 F1200');
      harness.setHotendTarget(200);
      harness.advanceTime(15);
      harness.startPrint();
      harness.advanceTime(2.0);
      const job = harness.getState().job;
      expect(job.totalLayers).toBeGreaterThanOrEqual(1);
    });

    it('F13-5: tracks printer status transitions: IDLE -> HEATING -> PRINTING -> IDLE', async () => {
      harness.setHotendTarget(200);
      harness.advanceTime(0.2);
      expect(harness.getState().status).toBe('HEATING');
      harness.advanceTime(90); // reach temp
      await harness.loadGCode('G1 X20 F3000');
      harness.startPrint();
      harness.syncTelemetry();
      expect(harness.getState().status).toBe('PRINTING');
      harness.runUntilComplete(10);
      harness.setHotendTarget(0); // turn off heater after print
      harness.advanceTime(0.1);
      expect(harness.getState().status).toBe('IDLE');
    });
  });

  // =========================================================================
  // F14: Manual Jog Controls & Homing Interface
  // =========================================================================
  describe('F14: Manual Jog Controls & Homing', () => {
    it('F14-1: jogs X axis incrementally and clamps to bed bounds [0, 220]', () => {
      harness.jog('X', 50);
      expect(harness.getNominalPosition().x).toBeCloseTo(50, 1);
      harness.jog('X', 200); // 50 + 200 = 250 -> clamped to 220
      expect(harness.getNominalPosition().x).toBeCloseTo(220, 1);
    });

    it('F14-2: jogs Y axis incrementally and clamps to bed bounds [0, 220]', () => {
      harness.jog('Y', 80);
      expect(harness.getNominalPosition().y).toBeCloseTo(80, 1);
      harness.jog('Y', -100); // clamped to 0
      expect(harness.getNominalPosition().y).toBeCloseTo(0, 1);
    });

    it('F14-3: jogs Z axis incrementally and clamps to height bounds [0, 250]', () => {
      harness.jog('Z', 25);
      expect(harness.getNominalPosition().z).toBeCloseTo(25, 1);
      harness.jog('Z', 300); // clamped to 250
      expect(harness.getNominalPosition().z).toBeCloseTo(250, 1);
    });

    it('F14-4: homes all axes via home() bringing XYZ to (0, 0, 0)', () => {
      harness.jog('X', 30);
      harness.jog('Y', 40);
      harness.jog('Z', 10);
      harness.home();
      const pos = harness.getNominalPosition();
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
      expect(pos.z).toBe(0);
      expect(harness.isHomed()).toEqual({ x: true, y: true, z: true });
    });

    it('F14-5: disables steppers via disableSteppers() and updates state', () => {
      harness.disableSteppers();
      expect(harness.executor.getKinematics().getState().steppersEnabled).toBe(false);
    });
  });

  // =========================================================================
  // F15: Interactive Firmware Terminal & Telemetry Stream
  // =========================================================================
  describe('F15: Interactive Firmware Terminal & Telemetry Stream', () => {
    it('F15-1: logs sent command and standard serial "ok" response', () => {
      harness.sendCommand('G90');
      const lines = harness.getTerminalLines();
      expect(lines).toContain('> G90');
      expect(lines).toContain('ok');
    });

    it('F15-2: reports current coordinates on M114 command', () => {
      harness.sendCommand('G1 X75.5 Y45.2 Z5.0 F3000');
      harness.sendCommand('M114');
      const lines = harness.getTerminalLines();
      const m114Line = lines.find((l) => l.includes('X:75.50') && l.includes('Y:45.20'));
      expect(m114Line).toBeDefined();
    });

    it('F15-3: logs LCD display messages from M117 command', () => {
      harness.sendCommand('M117 Printing Layer 1');
      const lines = harness.getTerminalLines();
      expect(lines.some((l) => l.includes('echo: Printing Layer 1'))).toBe(true);
    });

    it('F15-4: captures error output on emergency stop', () => {
      harness.emergencyStop('Emergency Halt Requested');
      const lines = harness.getTerminalLines();
      expect(lines.some((l) => l.includes('Error: Emergency Halt Requested'))).toBe(true);
    });

    it('F15-5: clears terminal log via clearTerminal() without altering kinematics', () => {
      harness.sendCommand('G1 X50 F3000');
      expect(harness.getTerminalLines().length).toBeGreaterThan(0);
      harness.clearTerminal();
      expect(harness.getTerminalLines().length).toBe(0);
      expect(harness.getNominalPosition().x).toBeCloseTo(50, 1);
    });
  });

  // =========================================================================
  // F16: Single-Command Runnable & Build Verification
  // =========================================================================
  describe('F16: Single-Command Runnable & Build Verification', () => {
    it('F16-1: verifies production build index.html exists in dist/', () => {
      const distIndex = path.resolve(process.cwd(), 'dist/index.html');
      expect(fs.existsSync(distIndex)).toBe(true);
      const content = fs.readFileSync(distIndex, 'utf-8');
      expect(content).toContain('<div id="root">');
    });

    it('F16-2: verifies bundled production JavaScript assets exist in dist/assets/', () => {
      const assetsDir = path.resolve(process.cwd(), 'dist/assets');
      expect(fs.existsSync(assetsDir)).toBe(true);
      const files = fs.readdirSync(assetsDir);
      const jsFiles = files.filter((f) => f.endsWith('.js'));
      expect(jsFiles.length).toBeGreaterThan(0);
    });

    it('F16-3: verifies bundled production CSS assets exist in dist/assets/', () => {
      const assetsDir = path.resolve(process.cwd(), 'dist/assets');
      const files = fs.readdirSync(assetsDir);
      const cssFiles = files.filter((f) => f.endsWith('.css'));
      expect(cssFiles.length).toBeGreaterThan(0);
    });

    it('F16-4: initializes simulator stack with zero runtime exceptions in Node environment', () => {
      const localHarness = new TestSimulatorHarness();
      expect(localHarness.getState().status).toBe('IDLE');
      expect(localHarness.getHotendTemp().actual).toBeCloseTo(21, 1);
      localHarness.dispose();
    });

    it('F16-5: executes complete multi-layer mock print cycle cleanly to COMPLETED state', async () => {
      harness.setSpeedMultiplier(100);

      const quickPad = SAMPLE_MODELS.quick_pad.getGCode();
      await harness.loadGCode(quickPad, 'quick_pad.gcode');
      harness.startPrint();

      const done = harness.runUntilComplete(120, 0.02);
      expect(done).toBe(true);
      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    });
  });
});
