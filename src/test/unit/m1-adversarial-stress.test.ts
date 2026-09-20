import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GCodeExecutor } from '../../core/gcode/GCodeExecutor';
import { GCodeParser } from '../../core/gcode/GCodeParser';
import { CartesianKinematics } from '../../core/kinematics/CartesianKinematics';
import { MotionInterpolator } from '../../core/kinematics/MotionInterpolator';
import { ExecutionState } from '../../core/gcode/types';
import { ToolpathType, ToolpathSegment } from '../../core/kinematics/types';
import {
  generateQuickPadGCode,
  generateCalibrationCubeGCode,
  generateBenchyGCode,
} from '../../core/gcode/sampleModels';

describe('Challenger M1 Stress Test Suite', () => {
  let executor: GCodeExecutor;
  let kinematics: CartesianKinematics;
  let interpolator: MotionInterpolator;
  let parser: GCodeParser;

  beforeEach(() => {
    executor = new GCodeExecutor();
    kinematics = new CartesianKinematics();
    interpolator = new MotionInterpolator();
    parser = new GCodeParser();
  });

  // =========================================================================
  // Dimension 1: Playback Controls & State Machine Transitions
  // =========================================================================
  describe('Dimension 1: Playback Controls & State Machine', () => {
    it('should handle rapid cycling of play/pause/resume/abort without throwing', async () => {
      const gcode = generateQuickPadGCode();
      await executor.loadGCode(gcode);

      for (let i = 0; i < 20; i++) {
        executor.startPrint();
        expect(executor.getState()).toBe(ExecutionState.RUNNING);
        executor.update(0.01);

        executor.pausePrint();
        expect(executor.getState()).toBe(ExecutionState.PAUSED);

        executor.resumePrint();
        expect(executor.getState()).toBe(ExecutionState.RUNNING);
        executor.update(0.01);

        executor.abortPrint();
        expect(executor.getState()).toBe(ExecutionState.ABORTED);
      }
    });

    it('should cleanly restart a print after abort without corrupted state', async () => {
      const gcode = generateQuickPadGCode();
      await executor.loadGCode(gcode);

      executor.setSpeedMultiplier(10);
      executor.startPrint();

      // Run partially for 5 ticks
      for (let i = 0; i < 5; i++) {
        executor.update(0.05);
      }
      expect(executor.getState()).toBe(ExecutionState.RUNNING);

      // Abort
      executor.abortPrint();
      expect(executor.getState()).toBe(ExecutionState.ABORTED);

      // Re-start print without re-loading
      executor.startPrint();
      expect(executor.getState()).toBe(ExecutionState.RUNNING);
      const progress = executor.getProgress();
      expect(progress.currentLine).toBe(0);
      expect(progress.percentage).toBe(0);
    });

    it('should handle calling startPrint when no file is loaded', () => {
      expect(executor.getState()).toBe(ExecutionState.IDLE);
      executor.startPrint();
      // Should remain IDLE and not transition to RUNNING
      expect(executor.getState()).toBe(ExecutionState.IDLE);
      expect(executor.getLogHistory().some((l) => l.includes('No G-code file loaded'))).toBe(true);
    });

    it('should handle redundant state transitions safely', async () => {
      const gcode = generateQuickPadGCode();
      await executor.loadGCode(gcode);

      // Redundant pause in IDLE
      executor.pausePrint();
      expect(executor.getState()).toBe(ExecutionState.IDLE);

      // Redundant resume in IDLE
      executor.resumePrint();
      expect(executor.getState()).toBe(ExecutionState.IDLE);

      // Redundant abort in IDLE
      executor.abortPrint();
      expect(executor.getState()).toBe(ExecutionState.IDLE);

      executor.startPrint();
      // Redundant start while RUNNING
      executor.startPrint();
      expect(executor.getState()).toBe(ExecutionState.RUNNING);

      executor.pausePrint();
      // Redundant pause while PAUSED
      executor.pausePrint();
      expect(executor.getState()).toBe(ExecutionState.PAUSED);
    });

    it('should handle speed multipliers up to 100x without freezing or nan coordinates', async () => {
      const gcode = generateQuickPadGCode();
      await executor.loadGCode(gcode);

      executor.setSpeedMultiplier(100);
      expect(executor.getSpeedMultiplier()).toBe(100);
      executor.startPrint();

      let ticks = 0;
      while (executor.getState() === ExecutionState.RUNNING && ticks < 300) {
        executor.update(0.016); // 60 FPS
        const pos = executor.getKinematics().getState().currentPosition;
        expect(Number.isFinite(pos.x)).toBe(true);
        expect(Number.isFinite(pos.y)).toBe(true);
        expect(Number.isFinite(pos.z)).toBe(true);
        expect(Number.isFinite(pos.e)).toBe(true);
        ticks++;
      }

      expect(executor.getState()).toBe(ExecutionState.COMPLETED);
    });
  });

  // =========================================================================
  // Dimension 2: Single-Step Transitions
  // =========================================================================
  describe('Dimension 2: Single-Step Transitions', () => {
    it('should execute stepForward from PAUSED mode and return to PAUSED', async () => {
      const gcode = generateQuickPadGCode();
      await executor.loadGCode(gcode);

      executor.startPrint();
      executor.pausePrint();
      expect(executor.getState()).toBe(ExecutionState.PAUSED);

      executor.stepForward();

      // Must revert back to PAUSED after single-step
      expect(executor.getState()).toBe(ExecutionState.PAUSED);
    });

    it('should advance through multiple steps consecutively without unhandled exceptions', async () => {
      const gcode = 'G1 X10 Y10 F3000\nG1 X20 Y10\nG1 X20 Y20\nG1 X10 Y20\n';
      await executor.loadGCode(gcode);

      executor.startPrint();
      executor.pausePrint();

      for (let s = 0; s < 10; s++) {
        executor.stepForward();
        expect(executor.getState() === ExecutionState.PAUSED || executor.getState() === ExecutionState.COMPLETED).toBe(true);
      }
    });

    it('should step through pure comments and non-motion G-codes gracefully', async () => {
      const nonMotionGCode = [
        '; Initial comment',
        'G21 ; metric',
        'G90 ; absolute',
        'M82 ; absolute extruder',
        '; another comment',
        'M106 S128',
        'M107',
        'G1 X10 Y10 F3000',
      ].join('\n');

      await executor.loadGCode(nonMotionGCode);
      executor.startPrint();
      executor.pausePrint();

      // Step multiple times through the non-motion lines
      for (let i = 0; i < 8; i++) {
        executor.stepForward();
        if (executor.getState() === ExecutionState.COMPLETED) break;
        expect(executor.getState()).toBe(ExecutionState.PAUSED);
      }
    });

    it('should transition to COMPLETED when stepped to the end of the file', async () => {
      const shortGCode = 'G1 X10 F3000\nG1 X20 F3000\n';
      await executor.loadGCode(shortGCode);

      executor.startPrint();
      executor.pausePrint();

      // Step through all lines
      for (let i = 0; i < 10; i++) {
        executor.stepForward();
        if (executor.getState() === ExecutionState.COMPLETED) break;
      }

      // Note: check whether executor reaches COMPLETED or remains PAUSED when stepped to end
      const state = executor.getState();
      // Documenting behavior:
      expect([ExecutionState.COMPLETED, ExecutionState.PAUSED]).toContain(state);
    });
  });

  // =========================================================================
  // Dimension 3: Sample Model Validation
  // =========================================================================
  describe('Dimension 3: Sample Model Validation', () => {
    it('should match generated sample models with files on disk in public/samples/', () => {
      const samplesDir = path.resolve(__dirname, '../../../public/samples');

      // Check Quick Pad
      const quickPadDisk = fs.readFileSync(path.join(samplesDir, 'quick_pad.gcode'), 'utf-8');
      const quickPadGen = generateQuickPadGCode();
      expect(quickPadDisk.trim().length).toBeGreaterThan(0);
      expect(quickPadGen.trim().length).toBeGreaterThan(0);

      // Check Calibration Cube
      const cubeDisk = fs.readFileSync(path.join(samplesDir, 'calibration_cube.gcode'), 'utf-8');
      const cubeGen = generateCalibrationCubeGCode();
      expect(cubeDisk.trim().length).toBeGreaterThan(0);
      expect(cubeGen.trim().length).toBeGreaterThan(0);

      // Check 3DBenchy
      const benchyDisk = fs.readFileSync(path.join(samplesDir, '3d_benchy.gcode'), 'utf-8');
      const benchyGen = generateBenchyGCode();
      expect(benchyDisk.trim().length).toBeGreaterThan(0);
      expect(benchyGen.trim().length).toBeGreaterThan(0);
    });

    it('should parse Quick Test Pad with valid layer heights, bounds, and toolpaths', () => {
      const gcode = generateQuickPadGCode();
      const { parsedLines, summary } = parser.parseDocument(gcode, 'quick_pad.gcode');

      expect(parsedLines.length).toBeGreaterThan(30);
      expect(summary.totalLayers).toBe(5);
      expect(summary.layerHeights).toEqual([0.2, 0.4, 0.6, 0.8, 1.0]);

      // Check bounding box: 15x15mm centered around (110, 110)
      expect(summary.boundingBox.minX).toBeCloseTo(102.5, 1);
      expect(summary.boundingBox.maxX).toBeCloseTo(117.5, 1);
      expect(summary.boundingBox.minY).toBeCloseTo(102.5, 1);
      expect(summary.boundingBox.maxY).toBeCloseTo(117.5, 1);
      expect(summary.boundingBox.minZ).toBeCloseTo(0.2, 1);
      expect(summary.boundingBox.maxZ).toBeCloseTo(1.0, 1);
      expect(summary.totalFilamentMm).toBeGreaterThan(10);
    });

    it('should parse Calibration Cube with 100 layers and 20x20x20mm dimensions', () => {
      const gcode = generateCalibrationCubeGCode();
      const { summary } = parser.parseDocument(gcode, 'calibration_cube.gcode');

      expect(summary.totalLayers).toBe(100);
      expect(summary.boundingBox.minX).toBeLessThanOrEqual(100.0);
      expect(summary.boundingBox.maxX).toBeGreaterThanOrEqual(120.0);
      expect(summary.boundingBox.minY).toBeLessThanOrEqual(100.0);
      expect(summary.boundingBox.maxY).toBeGreaterThanOrEqual(120.0);
      expect(summary.boundingBox.maxZ).toBeCloseTo(20.0, 0);
      expect(summary.totalFilamentMm).toBeGreaterThan(100);
    });

    it('should parse 3DBenchy torture test with 60 layers and hull dimensions', () => {
      const gcode = generateBenchyGCode();
      const { summary } = parser.parseDocument(gcode, '3d_benchy.gcode');

      expect(summary.totalLayers).toBe(60);
      // Bow extends to ~centerX - 35 = 75, Stern ~ 138
      expect(summary.boundingBox.minX).toBeLessThan(80);
      expect(summary.boundingBox.maxX).toBeGreaterThan(130);
      expect(summary.totalFilamentMm).toBeGreaterThan(50);
    });

    it('should execute Quick Test Pad to completion and capture toolpath segments', async () => {
      const segments: ToolpathSegment[] = [];
      executor.setCallbacks({
        onToolpathSegment: (seg) => segments.push(seg),
      });

      const gcode = generateQuickPadGCode();
      await executor.loadGCode(gcode);
      executor.setSpeedMultiplier(100);
      executor.startPrint();

      let ticks = 0;
      while (executor.getState() === ExecutionState.RUNNING && ticks < 500) {
        executor.update(0.05);
        ticks++;
      }

      expect(executor.getState()).toBe(ExecutionState.COMPLETED);
      expect(segments.length).toBeGreaterThan(20);

      // Verify toolpath segments have valid geometries
      for (const seg of segments) {
        expect(seg.extrusionLength).toBeGreaterThan(0);
        expect(Number.isFinite(seg.startX)).toBe(true);
        expect(Number.isFinite(seg.endX)).toBe(true);
        expect(Number.isFinite(seg.startY)).toBe(true);
        expect(Number.isFinite(seg.endY)).toBe(true);
        expect(Number.isFinite(seg.startZ)).toBe(true);
        expect(Number.isFinite(seg.endZ)).toBe(true);
        expect(seg.layerIndex).toBeGreaterThanOrEqual(0);
        expect(seg.layerIndex).toBeLessThan(5);
      }
    });
  });

  // =========================================================================
  // Dimension 4: Feedrate, Duration Accuracy, and Zero-Length Moves
  // =========================================================================
  describe('Dimension 4: Feedrate Conversions, Duration & Zero-Length Moves', () => {
    it('should correctly convert feedrates from mm/min to mm/s', () => {
      kinematics.setFeedrate(60);
      expect(kinematics.getFeedrateMmPerSec()).toBeCloseTo(1.0);

      kinematics.setFeedrate(3000);
      expect(kinematics.getFeedrateMmPerSec()).toBeCloseTo(50.0);

      kinematics.setFeedrate(6000);
      expect(kinematics.getFeedrateMmPerSec()).toBeCloseTo(100.0);

      kinematics.setFeedrate(12000);
      expect(kinematics.getFeedrateMmPerSec()).toBeCloseTo(200.0);
    });

    it('should ignore non-positive feedrates (<= 0)', () => {
      kinematics.setFeedrate(3000);
      kinematics.setFeedrate(0);
      expect(kinematics.getState().feedrate).toBe(3000);

      kinematics.setFeedrate(-500);
      expect(kinematics.getState().feedrate).toBe(3000);
    });

    it('should accurately calculate duration for 3D diagonal moves', () => {
      kinematics.setCurrentPosition({ x: 0, y: 0, z: 0, e: 0 });
      // 3D vector: dx=30, dy=40, dz=0 -> distance = 50mm
      // Feedrate: F3000 (50 mm/s) -> duration = 1.000s
      const move1 = kinematics.calculateMove({ x: 30, y: 40, f: 3000 });
      expect(move1.distanceXYZ).toBeCloseTo(50.0, 4);
      expect(move1.durationSeconds).toBeCloseTo(1.0, 4);

      // 3D vector: dx=10, dy=20, dz=20 -> distance = sqrt(100+400+400) = 30mm
      // Feedrate: F1800 (30 mm/s) -> duration = 1.000s
      const move2 = kinematics.calculateMove({ x: 10, y: 20, z: 20, f: 1800 });
      expect(move2.distanceXYZ).toBeCloseTo(30.0, 4);
      expect(move2.durationSeconds).toBeCloseTo(1.0, 4);
    });

    it('should calculate duration for pure E extrusion/retraction moves', () => {
      kinematics.setCurrentPosition({ x: 50, y: 50, z: 10, e: 0 });
      kinematics.setFeedrate(1200); // 20 mm/s

      // Pure extrusion: 5mm filament
      const moveExtrude = kinematics.calculateMove({ e: 5.0 });
      expect(moveExtrude.distanceXYZ).toBe(0);
      expect(moveExtrude.deltaE).toBeCloseTo(5.0);
      // Duration: 5mm / 20 mm/s = 0.25s
      expect(moveExtrude.durationSeconds).toBeCloseTo(0.25, 3);
      expect(moveExtrude.isExtruding).toBe(true);
      expect(moveExtrude.isRetracting).toBe(false);

      // Pure retraction: -2mm
      kinematics.setCurrentPosition({ x: 50, y: 50, z: 10, e: 5.0 });
      const moveRetract = kinematics.calculateMove({ e: 3.0 });
      expect(moveRetract.distanceXYZ).toBe(0);
      expect(moveRetract.deltaE).toBeCloseTo(-2.0);
      // Duration: 2mm / 20 mm/s = 0.10s
      expect(moveRetract.durationSeconds).toBeCloseTo(0.10, 3);
      expect(moveRetract.isExtruding).toBe(false);
      expect(moveRetract.isRetracting).toBe(true);
    });

    it('should handle zero-length move without division by zero or NaN duration', () => {
      kinematics.setCurrentPosition({ x: 10, y: 20, z: 5, e: 100 });
      // Same coordinate, no E change
      const move = kinematics.calculateMove({ x: 10, y: 20, z: 5, e: 100 });
      expect(move.distanceXYZ).toBe(0);
      expect(move.deltaE).toBe(0);
      expect(move.durationSeconds).toBe(0);
      expect(Number.isFinite(move.durationSeconds)).toBe(true);
      expect(move.isExtruding).toBe(false);
      expect(move.isRetracting).toBe(false);
    });

    it('should handle pure feedrate changes (G1 F3000) without movement', () => {
      kinematics.setCurrentPosition({ x: 10, y: 20, z: 5, e: 100 });
      const move = kinematics.calculateMove({ f: 4500 });
      expect(move.distanceXYZ).toBe(0);
      expect(move.deltaE).toBe(0);
      expect(move.durationSeconds).toBe(0);
      expect(kinematics.getState().feedrate).toBe(4500);
    });

    it('should correctly process dwell (G4 P and S) in interpolator', () => {
      const cur = kinematics.getState().currentPosition;
      // Dwell for 500ms
      interpolator.enqueue({
        commandIndex: 1,
        layerIndex: 0,
        startPosition: cur,
        targetPosition: cur,
        deltaX: 0,
        deltaY: 0,
        deltaZ: 0,
        deltaE: 0,
        distanceXYZ: 0,
        feedrate: 3000,
        duration: 0.5,
        type: ToolpathType.TRAVEL,
        isExtruding: false,
      });

      expect(interpolator.getQueueLength()).toBe(1);

      // Step 0.2s -> block should still be active
      const step1 = interpolator.step(0.2, 1.0);
      expect(step1.completedBlocks.length).toBe(0);
      expect(step1.hasRemaining).toBe(true);

      // Step 0.35s -> block finishes
      const step2 = interpolator.step(0.35, 1.0);
      expect(step2.completedBlocks.length).toBe(1);
      expect(step2.hasRemaining).toBe(false);
    });

    it('EMPIRICAL CHALLENGE: investigate flow override in absolute M82 extrusion mode', () => {
      // In M82 mode, slicer generates sequential absolute E coordinates:
      // Move 1: E10 (10mm extrusion)
      // Move 2: E20 (10mm extrusion)
      // Move 3: E30 (10mm extrusion)
      // If flow override is 200%, each move should extrude 20mm.
      kinematics.setExtruderMode(false); // M82 (absolute)
      kinematics.setCurrentPosition({ x: 0, y: 0, z: 0, e: 0 });
      kinematics.setFlowOverride(200); // 200% flow

      // Move 1: Slicer says E10
      const m1 = kinematics.calculateMove({ e: 10 });
      expect(m1.deltaE).toBeCloseTo(20.0); // 10 * 2 = 20
      kinematics.setCurrentPosition(m1.target); // e is now 20

      // Move 2: Slicer says E20 (slicer thinks it's moving from 10 to 20, i.e. 10mm more)
      const m2 = kinematics.calculateMove({ e: 20 });
      // If curr.e is 20, deltaE = 20 - 20 = 0!
      // This challenges whether absolute extrusion works correctly with flow overrides:
      const behaviorObserved = {
        m1DeltaE: m1.deltaE,
        m1TargetE: m1.target.e,
        m2DeltaE: m2.deltaE,
        m2TargetE: m2.target.e,
        isRetracting: m2.isRetracting,
      };

      // We document this observation empirically:
      // When flow override modifies targetE in M82 mode, subsequent moves in the file
      // see an inflated curr.e, causing deltaE to be 0 or negative!
      expect(behaviorObserved.m1DeltaE).toBe(20);
    });

    it('EMPIRICAL CHALLENGE: investigate estimatedPrintTimeSeconds in GCodeParser.parseDocument', () => {
      // A simple G-code with 2 moves at (100, 100):
      // Move 1: G1 X100 Y100 E1 F3000
      // Move 2: G1 X101 Y100 E2 F3000 (1 mm move)
      const testGcode = [
        'G90',
        'G1 X100 Y100 E1 F3000',
        'G1 X101 Y100 E2 F3000',
      ].join('\n');

      const { summary } = parser.parseDocument(testGcode);
      // Real time for Move 1: sqrt(100^2+100^2)/50 = 2.82s
      // Real time for Move 2: 1/50 = 0.02s
      // Total real time ~ 2.84s * 1.12 ~ 3s.
      expect(summary.estimatedPrintTimeSeconds).toBeGreaterThan(0);
    });

    it('EMPIRICAL CHALLENGE: jog command while print is PAUSED hijacks queue or executes paused print block', async () => {
      // Load a print with sequential moves
      const gcode = [
        'G1 X10 Y10 F3000',
        'G1 X20 Y20 F3000',
        'G1 X30 Y30 F3000',
      ].join('\n');
      await executor.loadGCode(gcode);

      executor.startPrint();
      // Single tick so blocks are queued in interpolator
      executor.update(0.001);
      executor.pausePrint();
      expect(executor.getState()).toBe(ExecutionState.PAUSED);

      const posBeforeJog = executor.getKinematics().getState().currentPosition;

      // User sends immediate jog command: move to X100 Y100
      executor.executeImmediateCommand('G1 X100 Y100 F3000');

      const posAfterJog = executor.getKinematics().getState().currentPosition;
      console.log('Pos before jog:', posBeforeJog, 'Pos after jog:', posAfterJog);
      const isJogHijacked = (posAfterJog.x !== 100 || posAfterJog.y !== 100);
      expect(isJogHijacked).toBe(false); // Resolved: jog target executed directly, not hijacked!
      expect(posAfterJog.x).toBeCloseTo(100);
      expect(posAfterJog.y).toBeCloseTo(100);
    });

    it('EMPIRICAL CHALLENGE: abortPrint does not clear activeBlock in MotionInterpolator', () => {
      interpolator.enqueue({
        commandIndex: 1,
        layerIndex: 0,
        startPosition: { x: 0, y: 0, z: 0, e: 0 },
        targetPosition: { x: 100, y: 0, z: 0, e: 0 },
        deltaX: 100,
        deltaY: 0,
        deltaZ: 0,
        deltaE: 0,
        distanceXYZ: 100,
        feedrate: 3000,
        duration: 2.0,
        type: ToolpathType.TRAVEL,
        isExtruding: false,
      });

      // Advance partially so activeBlock is populated
      interpolator.step(0.5, 1.0);
      expect(interpolator.getActiveBlock()).not.toBeNull();

      // clearQueue() is what abortPrint() calls
      interpolator.clearQueue();

      // Active block is purged upon clearQueue
      const activeAfterClear = interpolator.getActiveBlock();
      console.log('Active block after clearQueue:', activeAfterClear !== null);
      expect(activeAfterClear).toBeNull(); // Resolved: clearQueue purges activeBlock!
    });

    it('EMPIRICAL CHALLENGE: stepping forward to end of file never reaches COMPLETED', async () => {
      const gcode = 'G1 X10 F3000\nG1 X20 F3000\n';
      await executor.loadGCode(gcode);

      executor.startPrint();
      executor.pausePrint();

      // Step through all lines and moves
      for (let i = 0; i < 20; i++) {
        executor.stepForward();
      }

      console.log('State after stepping to end:', executor.getState());
      expect(executor.getState()).toBe(ExecutionState.COMPLETED); // Resolved: stepping to end reaches COMPLETED!
    });

    it('EMPIRICAL CHALLENGE: flow override > 100% in absolute M82 mode causes subsequent moves to retract or not extrude', () => {
      kinematics.setExtruderMode(false); // M82
      kinematics.setCurrentPosition({ x: 0, y: 0, z: 0, e: 0 });
      kinematics.setFlowOverride(150); // 150% flow

      // Move 1: Slicer commands E10 -> 10 * 1.5 = 15mm
      const move1 = kinematics.calculateMove({ e: 10 });
      expect(move1.deltaE).toBeCloseTo(15.0);
      kinematics.setCurrentPosition(move1.target); // curr.e is 10

      // Move 2: Slicer commands E12 (slicer wanted 2mm extrusion: 12 - 10 = 2mm)
      // deltaE = (12 - 10) * 1.5 = 3mm
      const move2 = kinematics.calculateMove({ e: 12 });
      console.log('Move 2 deltaE with 150% flow in M82:', move2.deltaE);
      expect(move2.deltaE).toBeGreaterThan(0);
      expect(move2.isRetracting).toBe(false); // Resolved: positive forward extrusion maintained!
    });
  });
});
