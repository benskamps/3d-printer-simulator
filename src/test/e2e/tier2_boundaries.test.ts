import { describe, it, expect, beforeEach } from 'vitest';
import { TestSimulatorHarness } from './harness';
import { ExecutionState } from '../../core/gcode/types';
import { ToolpathType } from '../../core/kinematics/types';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 2: Boundary & Corner Cases Test Suite (F1 - F16)', () => {
  let harness: TestSimulatorHarness;

  beforeEach(() => {
    harness = new TestSimulatorHarness();
  });

  // =========================================================================
  // F1: G-Code Parsing Boundaries
  // =========================================================================
  describe('F1: G-Code Parsing Boundaries', () => {
    it('B1-1: parses extreme positive coordinates without numerical overflow', async () => {
      const summary = await harness.loadGCode('G1 X99999.5 Y88888.2 Z77777.1');
      expect(summary.totalLines).toBe(1);
      const parsed = harness.executor['parsedLines'][0];
      expect(parsed.parameters.X).toBe(99999.5);
      expect(parsed.parameters.Y).toBe(88888.2);
      expect(parsed.parameters.Z).toBe(77777.1);
    });

    it('B1-2: parses negative coordinates accurately', async () => {
      const summary = await harness.loadGCode('G1 X-50.5 Y-25.2 Z-10.8');
      expect(summary.totalLines).toBe(1);
      const parsed = harness.executor['parsedLines'][0];
      expect(parsed.parameters.X).toBe(-50.5);
      expect(parsed.parameters.Y).toBe(-25.2);
      expect(parsed.parameters.Z).toBe(-10.8);
    });

    it('B1-3: preserves high-precision fractional decimals', async () => {
      const summary = await harness.loadGCode('G1 X12.3456789 Y98.7654321');
      expect(summary.totalLines).toBe(1);
      const parsed = harness.executor['parsedLines'][0];
      expect(parsed.parameters.X).toBeCloseTo(12.3456789, 6);
      expect(parsed.parameters.Y).toBeCloseTo(98.7654321, 6);
    });

    it('B1-4: parses exponential scientific notation (1.5e2, 2e-1)', async () => {
      const summary = await harness.loadGCode('G1 X1.5e2 Y2e-1');
      expect(summary.totalLines).toBe(1);
      const parsed = harness.executor['parsedLines'][0];
      expect(parsed.parameters.X).toBe(150);
      expect(parsed.parameters.Y).toBe(0.2);
    });

    it('B1-5: handles zero-length move without NaN or duration division error', () => {
      const move = harness.executor.getKinematics().calculateMove(
        { x: 0, y: 0, z: 0, f: 3000 },
        1,
        { x: 0, y: 0, z: 0, e: 0 }
      );
      expect(move.distanceXYZ).toBe(0);
      expect(move.durationSeconds).toBe(0);
      expect(isNaN(move.durationSeconds)).toBe(false);
    });

    it('B1-6: handles multiple consecutive comment-only lines and trailing semicolons', async () => {
      const gcode = [';;; Multiple semicolons', '; Second line', ';;', 'G1 X10 ;;; comment ;;; more'].join('\n');
      const summary = await harness.loadGCode(gcode);
      expect(summary.totalLines).toBe(1);
    });
  });

  // =========================================================================
  // F2: Extrusion Modes Boundaries
  // =========================================================================
  describe('F2: Extrusion Modes Boundaries', () => {
    it('B2-1: handles micro-extrusion delta E (0.0001 mm)', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      await harness.loadGCode('M83\nG1 E0.0001 F300');
      harness.startPrint();
      harness.runUntilComplete(5);
      expect(harness.getNominalPosition().e).toBeCloseTo(0.0001, 4);
    });

    it('B2-2: handles large extrusion step (E1000 mm in single move)', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      await harness.loadGCode('M82\nG1 E1000 F6000');
      harness.startPrint();
      harness.runUntilComplete(30);
      expect(harness.getNominalPosition().e).toBeCloseTo(1000, 1);
    });

    it('B2-3: handles rapid alternating retract and unretract moves', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      const gcode = [
        'M83',
        'G1 E10 F1200',
        'G1 E-2 F1800',
        'G1 E2 F1800',
        'G1 E-2 F1800',
        'G1 E2 F1800',
      ].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.runUntilComplete(15);
      expect(harness.getNominalPosition().e).toBeCloseTo(10, 1);
    });

    it('B2-4: supports negative cumulative extrusion coordinates in M82', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      await harness.loadGCode('M82\nG1 E-5 F1800');
      harness.startPrint();
      harness.runUntilComplete(5);
      expect(harness.getNominalPosition().e).toBeCloseTo(-5, 1);
    });

    it('B2-5: toggles M82 and M83 rapidly on alternating lines', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      const gcode = [
        'M82',
        'G1 E5 F600',  // E is 5
        'M83',
        'G1 E3 F600',  // E becomes 5 + 3 = 8
        'M82',
        'G1 E12 F600', // E becomes 12
      ].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.runUntilComplete(10);
      expect(harness.getNominalPosition().e).toBeCloseTo(12, 1);
    });
  });

  // =========================================================================
  // F3: Playback Controls Boundaries
  // =========================================================================
  describe('F3: Playback Controls Boundaries', () => {
    it('B3-1: clamps speed multiplier at lower boundary (0.1x minimum)', () => {
      harness.setSpeedMultiplier(0.01);
      expect(harness.executor.getSpeedMultiplier()).toBe(0.1);
    });

    it('B3-2: clamps speed multiplier at upper boundary (100x maximum)', () => {
      harness.setSpeedMultiplier(250);
      expect(harness.executor.getSpeedMultiplier()).toBe(100);
    });

    it('B3-3: handles rapid start -> pause -> resume -> abort state churn', async () => {
      await harness.loadGCode('G1 X50 Y50 F600\nG1 X100 Y100 F600');
      harness.startPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
      harness.pausePrint();
      expect(harness.executor.getState()).toBe(ExecutionState.PAUSED);
      harness.resumePrint();
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
      harness.abortPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.ABORTED);
    });

    it('B3-4: stepping forward when print is COMPLETED remains safely in COMPLETED', async () => {
      await harness.loadGCode('G1 X10 F3000');
      harness.startPrint();
      harness.runUntilComplete(5);
      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);

      harness.stepPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    });

    it('B3-5: starting print on empty document logs notice and remains IDLE', async () => {
      await harness.loadGCode('');
      harness.startPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.IDLE);
      expect(harness.getTerminalLines().some((l) => l.includes('No G-code file loaded'))).toBe(true);
    });
  });

  // =========================================================================
  // F4: Pre-sliced Models & Ingestion Boundaries
  // =========================================================================
  describe('F4: Pre-sliced Models & Ingestion Boundaries', () => {
    it('B4-1: loads completely empty string without runtime error', async () => {
      const summary = await harness.loadGCode('');
      expect(summary.totalLines).toBe(0);
      expect(summary.totalLayers).toBe(1);
    });

    it('B4-2: loads document containing only comments and spaces', async () => {
      const gcode = '; Comment 1\n   ; Comment 2\n;\n   ';
      const summary = await harness.loadGCode(gcode);
      expect(summary.totalLines).toBe(0);
    });

    it('B4-3: handles 1,000 blank lines followed by a single move', async () => {
      const lines = new Array(1000).fill('').concat(['G1 X25 Y25 F3000']);
      const summary = await harness.loadGCode(lines.join('\n'));
      expect(summary.totalLines).toBe(1);
    });

    it('B4-4: handles extremely long line (>2,000 characters) safely', async () => {
      const longComment = '; ' + 'A'.repeat(2500);
      const summary = await harness.loadGCode(`${longComment}\nG1 X30 F3000`);
      expect(summary.totalLines).toBe(1);
    });

    it('B4-5: re-loading new G-code file while print is active aborts prior print', async () => {
      await harness.loadGCode('G1 X100 Y100 F300');
      harness.startPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);

      await harness.loadGCode('G1 X20 Y20 F3000', 'new_model.gcode');
      expect(harness.executor.getState()).toBe(ExecutionState.IDLE);
      expect(harness.getModelSummary()?.fileName).toBe('new_model.gcode');
    });
  });

  // =========================================================================
  // F5: Thermal Dynamics Math Boundaries
  // =========================================================================
  describe('F5: Thermal Dynamics Math Boundaries', () => {
    it('B5-1: target set to ambient temp (21°C) keeps power at 0 and temperature steady', () => {
      harness.setHotendTarget(21.0);
      harness.advanceTime(10.0);
      expect(harness.getHotendTemp().actual).toBeCloseTo(21.0, 1);
      expect(harness.getHotendTemp().power).toBeCloseTo(0, 1);
    });

    it('B5-2: target set to maximum hotend limit (285°C) operates without numerical instability', () => {
      harness.setHotendTarget(285.0);
      harness.advanceTime(30.0);
      const actual = harness.getHotendTemp().actual;
      expect(actual).toBeGreaterThan(21.0);
      expect(actual).toBeLessThanOrEqual(285.0);
      expect(isNaN(actual)).toBe(false);
    });

    it('B5-3: target set to maximum bed limit (115°C) operates smoothly', () => {
      harness.setBedTarget(115.0);
      harness.advanceTime(30.0);
      const actual = harness.getBedTemp().actual;
      expect(actual).toBeGreaterThan(21.0);
      expect(actual).toBeLessThanOrEqual(115.0);
      expect(isNaN(actual)).toBe(false);
    });

    it('B5-4: handles large delta time (dt = 10.0s) with sub-stepping stability', () => {
      harness.setHotendTarget(200);
      harness.thermal.update(10.0); // 10s in single call
      const actual = harness.getHotendTemp().actual;
      expect(actual).toBeGreaterThan(30.0);
      expect(actual).toBeLessThan(200.0);
      expect(isNaN(actual)).toBe(false);
    });

    it('B5-5: handles zero delta time (dt = 0.0s) safely without NaN', () => {
      harness.setHotendTarget(200);
      harness.thermal.update(0.0);
      expect(harness.getHotendTemp().actual).toBe(21.0);
      expect(isNaN(harness.getHotendTemp().actual)).toBe(false);
    });
  });

  // =========================================================================
  // F6: Temperature G-Codes Boundaries
  // =========================================================================
  describe('F6: Temperature G-Codes Boundaries', () => {
    it('B6-1: M104 S0 turns off hotend heater immediately', () => {
      harness.setHotendTarget(200);
      harness.sendCommand('M104 S0');
      expect(harness.getHotendTemp().target).toBe(0);
    });

    it('B6-2: M140 S0 turns off bed heater immediately', () => {
      harness.setBedTarget(60);
      harness.sendCommand('M140 S0');
      expect(harness.getBedTemp().target).toBe(0);
    });

    it('B6-3: M109 with setpoint already lower than current temp returns immediately', async () => {
      const gcode = ['M109 S200', 'G1 X50 F3000'].join('\n');
      await harness.loadGCode(gcode);
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      harness.startPrint();
      harness.advanceTime(2.0); // should not block
      expect(harness.getNominalPosition().x).toBeCloseTo(50, 1);
    });

    it('B6-4: M190 with bed setpoint already reached returns immediately', async () => {
      const gcode = ['M190 S55', 'G1 Y50 F3000'].join('\n');
      await harness.loadGCode(gcode);
      harness.thermal.setActualTemperatureDirect('bed', 55);
      harness.setBedTarget(55);
      harness.startPrint();
      harness.advanceTime(2.0);
      expect(harness.getNominalPosition().y).toBeCloseTo(50, 1);
    });

    it('B6-5: negative temperature parameter (e.g. S-10) is safely clamped to 0', () => {
      harness.sendCommand('M104 S-10');
      expect(harness.getHotendTemp().target).toBe(0);
      harness.sendCommand('M140 S-25');
      expect(harness.getBedTemp().target).toBe(0);
    });
  });

  // =========================================================================
  // F7: Cold Extrusion Prevention Boundaries (169.9°C vs 170.0°C)
  // =========================================================================
  describe('F7: Cold Extrusion Prevention Boundaries', () => {
    it('B7-1: rejects extrusion at exact boundary 169.9°C', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 169.9);
      expect(harness.canExtrude()).toBe(false);
      harness.sendCommand('G1 E10 F300');
      expect(harness.getNominalPosition().e).toBe(0);
    });

    it('B7-2: permits extrusion at exact boundary 170.0°C', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 170.0);
      expect(harness.canExtrude()).toBe(true);
      harness.sendCommand('G1 E10 F300');
      expect(harness.getNominalPosition().e).toBeCloseTo(10, 1);
    });

    it('B7-3: permits extrusion just above boundary at 170.1°C', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 170.1);
      expect(harness.canExtrude()).toBe(true);
      harness.sendCommand('G1 E5 F300');
      expect(harness.getNominalPosition().e).toBeCloseTo(5, 1);
    });

    it('B7-4: rejects cold extrusion in relative extruder mode (M83)', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 160.0);
      harness.sendCommand('M83');
      harness.sendCommand('G1 E5 F300');
      expect(harness.getNominalPosition().e).toBe(0);
    });

    it('B7-5: multi-segment file executed while cold filters all extrusions to zero while preserving motion', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 25.0); // ambient
      const gcode = ['G1 X10 Y10 E2 F1800', 'G1 X20 Y20 E4 F1800', 'G1 X30 Y30 E6 F1800'].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.runUntilComplete(10);
      expect(harness.getNominalPosition().x).toBeCloseTo(30, 1);
      expect(harness.getNominalPosition().y).toBeCloseTo(30, 1);
      expect(harness.getNominalPosition().e).toBe(0);
      expect(harness.getToolpathCount()).toBe(0);
    });
  });

  // =========================================================================
  // F8: Thermal Runaway Safety Watchdogs Boundaries
  // =========================================================================
  describe('F8: Thermal Runaway Watchdogs Boundaries', () => {
    it('B8-1: does NOT trip if hotend rises >= 2.0°C within 24s window', () => {
      harness.setHotendTarget(200);
      harness.advanceTime(24.0); // normal heating rises by >50°C
      expect(harness.thermal.isThermalRunaway()).toBe(false);
    });

    it('B8-2: trips heating watchdog if temperature rise is under 2.0°C after 25.1s', () => {
      harness.setHotendTarget(200);
      harness.thermal.setSimulatedFailure('hotend', true);
      harness.advanceTime(26.0);
      expect(harness.thermal.isThermalRunaway()).toBe(true);
      expect(harness.thermal.getErrorReason()).toContain('failed to rise by 2°C');
    });

    it('B8-3: trips bed heating watchdog if bed rise is stalled past 60s', () => {
      harness.setBedTarget(60);
      harness.thermal.setSimulatedFailure('bed', true);
      harness.advanceTime(61.0);
      expect(harness.thermal.isThermalRunaway()).toBe(true);
      expect(harness.thermal.getErrorReason()).toContain('Bed failed to rise');
    });

    it('B8-4: tests exact MAXTEMP boundary for hotend (>310.0°C)', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 310.0);
      harness.advanceTime(0.1);
      expect(harness.thermal.isThermalRunaway()).toBe(false);

      harness.thermal.setActualTemperatureDirect('hotend', 310.5);
      harness.advanceTime(0.1);
      expect(harness.thermal.isThermalRunaway()).toBe(true);
    });

    it('B8-5: tests exact MINTEMP boundary for hotend (<-10.0°C)', () => {
      harness.thermal.setActualTemperatureDirect('hotend', -9.9);
      harness.advanceTime(0.1);
      expect(harness.thermal.isThermalRunaway()).toBe(false);

      harness.thermal.setActualTemperatureDirect('hotend', -10.5);
      harness.advanceTime(0.1);
      expect(harness.thermal.isThermalRunaway()).toBe(true);
    });
  });

  // =========================================================================
  // F9: Hardware Failure Modes Boundaries
  // =========================================================================
  describe('F9: Hardware Failure Modes Boundaries', () => {
    it('B9-1: handles extreme layer shift offset (+100mm X, +100mm Y)', () => {
      harness.sendCommand('G1 X50 Y50 F3000');
      harness.triggerLayerShift(100, 100);
      expect(harness.getNominalPosition().x).toBeCloseTo(50, 1);
      expect(harness.getPhysicalPosition().x).toBeCloseTo(150, 1);
      expect(harness.getPhysicalPosition().y).toBeCloseTo(150, 1);
    });

    it('B9-2: handles negative layer shift offset (-50mm X, -30mm Y)', () => {
      harness.sendCommand('G1 X80 Y80 F3000');
      harness.triggerLayerShift(-50, -30);
      expect(harness.getPhysicalPosition().x).toBeCloseTo(30, 1);
      expect(harness.getPhysicalPosition().y).toBeCloseTo(50, 1);
    });

    it('B9-3: tripping filament runout while already paused is a safe no-op', () => {
      harness.pausePrint();
      harness.setFilamentRunout(true);
      expect(harness.failures.getConfig().filamentRunout).toBe(true);
    });

    it('B9-4: spaghetti mode on pure travel move does NOT generate noodles', () => {
      harness.setSpaghettiMode(true);
      harness.toolpaths.appendSegment({
        startX: 0,
        startY: 0,
        startZ: 0.2,
        endX: 50,
        endY: 50,
        endZ: 0.2,
        extrusionLength: 0.0, // travel move
        feedrate: 6000,
        type: ToolpathType.TRAVEL,
        layerIndex: 1,
        commandIndex: 1,
      });
      // Exactly 1 travel segment added, no noodles
      expect(harness.getToolpathCount()).toBe(1);
    });

    it('B9-5: transitions nozzle clog FULL -> PARTIAL -> NONE smoothly', () => {
      harness.setNozzleClog('FULL');
      expect(harness.failures.getExtrusionScale()).toBe(0.0);
      harness.setNozzleClog('PARTIAL');
      expect(harness.failures.getExtrusionScale()).toBe(0.25);
      harness.setNozzleClog('NONE');
      expect(harness.failures.getExtrusionScale()).toBe(1.0);
    });
  });

  // =========================================================================
  // F10: Kinematics & Cartesian Motion Boundaries
  // =========================================================================
  describe('F10: Kinematics & Cartesian Motion Boundaries', () => {
    it('B10-1: clamps negative coordinates to minimum bed volume boundary (0, 0, 0)', () => {
      harness.jog('X', -50);
      expect(harness.getNominalPosition().x).toBe(0);
      harness.jog('Y', -50);
      expect(harness.getNominalPosition().y).toBe(0);
      harness.jog('Z', -50);
      expect(harness.getNominalPosition().z).toBe(0);
    });

    it('B10-2: clamps excessive coordinates to maximum build volume (220, 220, 250)', () => {
      harness.jog('X', 500);
      expect(harness.getNominalPosition().x).toBe(220);
      harness.jog('Y', 500);
      expect(harness.getNominalPosition().y).toBe(220);
      harness.jog('Z', 500);
      expect(harness.getNominalPosition().z).toBe(250);
    });

    it('B10-3: handles extreme high feedrate (F100000) with safe minimum duration', () => {
      const move = harness.executor.getKinematics().calculateMove(
        { x: 100, f: 100000 },
        1,
        { x: 0, y: 0, z: 0, e: 0 }
      );
      expect(move.durationSeconds).toBeGreaterThan(0);
      expect(isNaN(move.durationSeconds)).toBe(false);
    });

    it('B10-4: ignores zero feedrate (F0) and preserves prior modal feedrate', () => {
      harness.sendCommand('G1 F3600');
      expect(harness.executor.getKinematics().getState().feedrate).toBe(3600);
      harness.sendCommand('G1 F0');
      expect(harness.executor.getKinematics().getState().feedrate).toBe(3600);
    });

    it('B10-5: calculates correct Euclidean distance across full diagonal (0,0,0) -> (220,220,250)', () => {
      const move = harness.executor.getKinematics().calculateMove(
        { x: 220, y: 220, z: 250, f: 3000 },
        1,
        { x: 0, y: 0, z: 0, e: 0 }
      );
      const expectedDist = Math.hypot(220, 220, 250);
      expect(move.distanceXYZ).toBeCloseTo(expectedDist, 2);
    });
  });

  // =========================================================================
  // F11: Filament Toolpath Deposition Boundaries
  // =========================================================================
  describe('F11: Filament Toolpath Deposition Boundaries', () => {
    it('B11-1: handles burst insertion of 2,000 micro-segments without allocation crash', () => {
      for (let i = 0; i < 2000; i++) {
        harness.toolpaths.appendSegment({
          startX: i * 0.05,
          startY: 0,
          startZ: 0.2,
          endX: (i + 1) * 0.05,
          endY: 0,
          endZ: 0.2,
          extrusionLength: 0.01,
          feedrate: 1800,
          type: ToolpathType.WALL_OUTER,
          layerIndex: 1,
          commandIndex: i,
        });
      }
      expect(harness.getToolpathCount()).toBe(2000);
    });

    it('B11-2: handles zero-displacement segment safely', () => {
      harness.toolpaths.appendSegment({
        startX: 10,
        startY: 10,
        startZ: 0.2,
        endX: 10,
        endY: 10,
        endZ: 0.2,
        extrusionLength: 0.0,
        feedrate: 1800,
        type: ToolpathType.TRAVEL,
        layerIndex: 1,
        commandIndex: 1,
      });
      expect(harness.getToolpathCount()).toBe(1);
    });

    it('B11-3: crosses volumetric bead chunkSize allocation boundary', () => {
      const smallHarness = new TestSimulatorHarness({ chunkSize: 10 });
      for (let i = 0; i < 25; i++) {
        smallHarness.toolpaths.appendSegment({
          startX: i,
          startY: 0,
          startZ: 0.2,
          endX: i + 1,
          endY: 0,
          endZ: 0.2,
          extrusionLength: 0.5,
          feedrate: 1800,
          type: ToolpathType.WALL_OUTER,
          layerIndex: 1,
          commandIndex: i,
        });
      }
      expect(smallHarness.getVolumetricInstanceCount()).toBe(25);
      expect(smallHarness.toolpaths.getChunkCount()).toBeGreaterThanOrEqual(3);
      smallHarness.dispose();
    });

    it('B11-4: clearing already empty toolpath buffer is a safe no-op', () => {
      expect(harness.getToolpathCount()).toBe(0);
      harness.toolpaths.clear();
      expect(harness.getToolpathCount()).toBe(0);
    });

    it('B11-5: renders segments for all 8 distinct ToolpathTypes', () => {
      const types = [
        ToolpathType.WALL_OUTER,
        ToolpathType.WALL_INNER,
        ToolpathType.INFILL,
        ToolpathType.SOLID_SURFACE,
        ToolpathType.SUPPORT,
        ToolpathType.SKIRT_BRIM,
        ToolpathType.PRIME_TOWER,
        ToolpathType.TRAVEL,
      ];

      for (let i = 0; i < types.length; i++) {
        harness.toolpaths.appendSegment({
          startX: i * 10,
          startY: 0,
          startZ: 0.2,
          endX: (i + 1) * 10,
          endY: 0,
          endZ: 0.2,
          extrusionLength: types[i] === ToolpathType.TRAVEL ? 0 : 0.5,
          feedrate: 1800,
          type: types[i],
          layerIndex: 1,
          commandIndex: i,
        });
      }
      expect(harness.getToolpathCount()).toBe(8);
    });
  });

  // =========================================================================
  // F12: Layer Slicing Preview & Scrubbing Boundaries
  // =========================================================================
  describe('F12: Layer Slicing Preview Boundaries', () => {
    it('B12-1: inverted layer range [min > max] sets draw range to 0', () => {
      harness.toolpaths.appendSegment({
        startX: 0,
        startY: 0,
        startZ: 0.2,
        endX: 10,
        endY: 0,
        endZ: 0.2,
        extrusionLength: 0.5,
        feedrate: 1800,
        type: ToolpathType.WALL_OUTER,
        layerIndex: 1,
        commandIndex: 1,
      });
      harness.setLayerFilter(10, 2);
      expect(harness.toolpaths.getActiveDrawCount()).toBe(0);
    });

    it('B12-2: negative layer bounds set draw range to 0', () => {
      harness.setLayerFilter(-10, -1);
      expect(harness.toolpaths.getActiveDrawCount()).toBe(0);
    });

    it('B12-3: infinite layer bounds [0, Infinity] encompass all active segments', () => {
      for (let i = 0; i < 5; i++) {
        harness.toolpaths.appendSegment({
          startX: i,
          startY: 0,
          startZ: i * 0.2,
          endX: i + 1,
          endY: 0,
          endZ: i * 0.2,
          extrusionLength: 0.1,
          feedrate: 1800,
          type: ToolpathType.WALL_OUTER,
          layerIndex: i,
          commandIndex: i,
        });
      }
      harness.setLayerFilter(0, Infinity);
      // 5 segments * 2 vertices = 10 vertices
      expect(harness.toolpaths.getActiveDrawCount()).toBe(10);
    });

    it('B12-4: rapidly scrubbing layer filter 100 times executes stably', () => {
      for (let i = 0; i < 5; i++) {
        harness.toolpaths.appendSegment({
          startX: 0,
          startY: 0,
          startZ: i * 0.2,
          endX: 10,
          endY: 0,
          endZ: i * 0.2,
          extrusionLength: 0.1,
          feedrate: 1800,
          type: ToolpathType.WALL_OUTER,
          layerIndex: i,
          commandIndex: i,
        });
      }

      for (let s = 0; s < 100; s++) {
        const l = s % 5;
        harness.setLayerFilter(l, l);
      }
      expect(harness.toolpaths.getActiveDrawCount()).toBe(2);
    });

    it('B12-5: layer filter on model with only layer 0', () => {
      harness.toolpaths.appendSegment({
        startX: 0,
        startY: 0,
        startZ: 0.2,
        endX: 10,
        endY: 0,
        endZ: 0.2,
        extrusionLength: 0.5,
        feedrate: 1800,
        type: ToolpathType.WALL_OUTER,
        layerIndex: 0,
        commandIndex: 1,
      });
      harness.setLayerFilter(0, 0);
      expect(harness.toolpaths.getActiveDrawCount()).toBe(2);
      harness.setLayerFilter(1, 1);
      expect(harness.toolpaths.getActiveDrawCount()).toBe(0);
    });
  });

  // =========================================================================
  // F13: Fluidd/Mainsail Dashboard Boundaries
  // =========================================================================
  describe('F13: Fluidd/Mainsail Dashboard Boundaries', () => {
    it('B13-1: rolling thermal history caps at maximum 120 samples', () => {
      for (let i = 0; i < 150; i++) {
        harness.store.recordThermalSample();
      }
      expect(harness.getState().thermalHistory.length).toBe(120);
    });

    it('B13-2: terminal log caps at maximum 500 lines', () => {
      for (let i = 0; i < 550; i++) {
        harness.store.appendTerminal(`Line ${i}`);
      }
      expect(harness.getState().terminalLog.length).toBe(500);
    });

    it('B13-3: reset restores exact factory default telemetry state', () => {
      harness.jog('X', 50);
      harness.setHotendTarget(200);
      harness.store.reset();
      const state = harness.getState();
      expect(state.status).toBe('IDLE');
      expect(state.hotend.target).toBe(0);
      expect(state.nominalPosition.x).toBe(0);
      expect(state.thermalHistory.length).toBe(0);
    });

    it('B13-4: supports rapid burst of 50 state subscriber notifications', () => {
      let count = 0;
      const unsubscribe = harness.store.subscribe(() => {
        count++;
      });
      for (let i = 0; i < 50; i++) {
        harness.store.setFanSpeed(i / 50);
      }
      expect(count).toBeGreaterThanOrEqual(50);
      unsubscribe();
    });

    it('B13-5: clamps speed override (M220) factor between [10, 500]', () => {
      harness.sendCommand('M220 S5'); // below 10 -> clamped to 10
      expect(harness.executor.getKinematics().getState().speedOverride).toBe(10);
      harness.sendCommand('M220 S600'); // above 500 -> clamped to 500
      expect(harness.executor.getKinematics().getState().speedOverride).toBe(500);
    });
  });

  // =========================================================================
  // F14: Manual Jog Controls & Homing Boundaries
  // =========================================================================
  describe('F14: Manual Jog Controls & Homing Boundaries', () => {
    it('B14-1: micro-jog 0.1mm increment on X axis', () => {
      harness.jog('X', 0.1);
      expect(harness.getNominalPosition().x).toBeCloseTo(0.1, 2);
    });

    it('B14-2: macro-jog 100mm increment on Y axis', () => {
      harness.jog('Y', 100);
      expect(harness.getNominalPosition().y).toBeCloseTo(100, 1);
    });

    it('B14-3: jogXY simultaneous coordinate shift', () => {
      harness.jogXY(30, 40);
      expect(harness.getNominalPosition().x).toBeCloseTo(30, 1);
      expect(harness.getNominalPosition().y).toBeCloseTo(40, 1);
    });

    it('B14-4: homing Z axis only (G28 Z) leaves X and Y intact', () => {
      harness.jog('X', 40);
      harness.jog('Y', 50);
      harness.jog('Z', 20);
      harness.home({ z: true });
      const pos = harness.getNominalPosition();
      expect(pos.x).toBeCloseTo(40, 1);
      expect(pos.y).toBeCloseTo(50, 1);
      expect(pos.z).toBe(0);
      expect(harness.isHomed().z).toBe(true);
      expect(harness.isHomed().x).toBe(false);
    });

    it('B14-5: manual jog while cold extrude button pressed is blocked', () => {
      expect(harness.getHotendTemp().actual).toBeLessThan(170);
      const success = harness.extrude(10);
      expect(success).toBe(false);
      expect(harness.getNominalPosition().e).toBe(0);
    });
  });

  // =========================================================================
  // F15: Interactive Firmware Terminal Boundaries
  // =========================================================================
  describe('F15: Interactive Firmware Terminal Boundaries', () => {
    it('B15-1: empty command returns ok without crashing', () => {
      const res = harness.sendCommand('');
      expect(res).toBe('ok');
    });

    it('B15-2: command with excessive leading and trailing whitespace is trimmed', () => {
      harness.sendCommand('   G90   ');
      expect(harness.getTerminalLines()).toContain('> G90');
      expect(harness.getTerminalLines()).toContain('ok');
    });

    it('B15-3: unrecognized G-code code (M9999) returns ok gracefully', () => {
      const res = harness.sendCommand('M9999 S100');
      expect(res).toBe('ok');
    });

    it('B15-4: lowercase command syntax (g1 x25) is parsed correctly', () => {
      harness.sendCommand('g1 x25.0 f3000');
      expect(harness.getNominalPosition().x).toBeCloseTo(25.0, 1);
    });

    it('B15-5: processes rapid burst of 20 sequential terminal commands', () => {
      for (let i = 1; i <= 20; i++) {
        harness.sendCommand(`M117 Message ${i}`);
      }
      expect(harness.getTerminalLines().some((l) => l.includes('Message 20'))).toBe(true);
    });
  });

  // =========================================================================
  // F16: Single-Command Runnable & Stress Boundaries
  // =========================================================================
  describe('F16: Single-Command Runnable & Stress Boundaries', () => {
    it('B16-1: processes 500 micro-segments at 100x playback speed without accumulator drift', async () => {
      harness.setSpeedMultiplier(100);
      const lines: string[] = ['G90', 'G1 F6000'];
      for (let i = 1; i <= 500; i++) {
        lines.push(`G1 X${(i * 0.1).toFixed(1)}`);
      }
      await harness.loadGCode(lines.join('\n'));
      harness.startPrint();
      const completed = harness.runUntilComplete(20);
      expect(completed).toBe(true);
      expect(harness.getNominalPosition().x).toBeCloseTo(50.0, 1);
    });

    it('B16-2: verifies dist/index.html begins with valid HTML doctype', () => {
      const distHtml = path.resolve(process.cwd(), 'dist/index.html');
      const content = fs.readFileSync(distHtml, 'utf-8');
      expect(content.toLowerCase()).toContain('<!doctype html>');
    });

    it('B16-3: verifies production JS bundle size is substantial (>100KB)', () => {
      const assetsDir = path.resolve(process.cwd(), 'dist/assets');
      const files = fs.readdirSync(assetsDir);
      const jsFile = files.find((f) => f.endsWith('.js'));
      expect(jsFile).toBeDefined();
      const stats = fs.statSync(path.join(assetsDir, jsFile!));
      expect(stats.size).toBeGreaterThan(100_000); // > 100KB
    });

    it('B16-4: verifies production CSS bundle size is valid (>5KB)', () => {
      const assetsDir = path.resolve(process.cwd(), 'dist/assets');
      const files = fs.readdirSync(assetsDir);
      const cssFile = files.find((f) => f.endsWith('.css'));
      expect(cssFile).toBeDefined();
      const stats = fs.statSync(path.join(assetsDir, cssFile!));
      expect(stats.size).toBeGreaterThan(5_000); // > 5KB
    });

    it('B16-5: sequential creation and disposal of 10 harnesses executes cleanly', () => {
      for (let i = 0; i < 10; i++) {
        const h = new TestSimulatorHarness();
        h.jog('X', 10);
        h.dispose();
      }
      expect(true).toBe(true);
    });
  });
});
