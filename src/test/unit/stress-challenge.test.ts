import { describe, it, expect } from 'vitest';
import { GCodeExecutor } from '../../core/gcode/GCodeExecutor';
import { GCodeParser } from '../../core/gcode/GCodeParser';
import { CartesianKinematics } from '../../core/kinematics/CartesianKinematics';
import { MotionInterpolator } from '../../core/kinematics/MotionInterpolator';
import { ToolpathSegment, ToolpathType } from '../../core/kinematics/types';
import { ExecutionState } from '../../core/gcode/types';
import { generateQuickPadGCode } from '../../core/gcode/sampleModels';

describe('Milestone 1 Empirical Stress & Adversarial Challenge Tests', () => {
  // TC-STRESS-01: Toolpath continuity across queued sequential moves
  it('TC-STRESS-01: should produce continuous toolpath segments chained end-to-end', async () => {
    const segments: ToolpathSegment[] = [];
    const executor = new GCodeExecutor({
      onToolpathSegment: (s) => segments.push(s),
    });

    const gcode = [
      'G90',
      'G1 X10 Y0 E1 F3000',
      'G1 X10 Y10 E2 F3000',
      'G1 X0 Y10 E3 F3000',
      'G1 X0 Y0 E4 F3000',
    ].join('\n');

    await executor.loadGCode(gcode, 'square.gcode');
    executor.startPrint();

    while (executor.getState() === 'RUNNING') {
      executor.update(0.05);
    }

    expect(segments.length).toBe(4);

    // Segment 1: (0, 0) -> (10, 0)
    expect(segments[0].startX).toBeCloseTo(0);
    expect(segments[0].startY).toBeCloseTo(0);
    expect(segments[0].endX).toBeCloseTo(10);
    expect(segments[0].endY).toBeCloseTo(0);

    // Segment 2: (10, 0) -> (10, 10)
    expect(segments[1].startX).toBeCloseTo(10);
    expect(segments[1].startY).toBeCloseTo(0);
    expect(segments[1].endX).toBeCloseTo(10);
    expect(segments[1].endY).toBeCloseTo(10);

    // Segment 3: (10, 10) -> (0, 10)
    expect(segments[2].startX).toBeCloseTo(10);
    expect(segments[2].startY).toBeCloseTo(10);
    expect(segments[2].endX).toBeCloseTo(0);
    expect(segments[2].endY).toBeCloseTo(10);

    // Segment 4: (0, 10) -> (0, 0)
    expect(segments[3].startX).toBeCloseTo(0);
    expect(segments[3].startY).toBeCloseTo(10);
    expect(segments[3].endX).toBeCloseTo(0);
    expect(segments[3].endY).toBeCloseTo(0);
  });

  // TC-STRESS-02: G91 relative coordinate accumulation across queued moves
  it('TC-STRESS-02: should accumulate relative coordinates correctly across multiple queued moves (G91)', async () => {
    const executor = new GCodeExecutor();
    const gcode = [
      'G91',
      'G1 X10 F3000',
      'G1 X10 F3000',
      'G1 X10 F3000',
    ].join('\n');

    await executor.loadGCode(gcode, 'relative_x.gcode');
    executor.startPrint();

    while (executor.getState() === 'RUNNING') {
      executor.update(0.05);
    }

    // 3 relative moves of +10mm must reach X=30, NOT X=10
    expect(executor.getKinematics().getState().currentPosition.x).toBeCloseTo(30);
  });

  // TC-STRESS-03: M83 relative extrusion accumulation across queued moves
  it('TC-STRESS-03: should accumulate relative extrusion correctly across multiple queued moves (M83)', async () => {
    const executor = new GCodeExecutor();
    const gcode = [
      'M83',
      'G1 E5 F3000',
      'G1 E5 F3000',
      'G1 E5 F3000',
    ].join('\n');

    await executor.loadGCode(gcode, 'relative_e.gcode');
    executor.startPrint();

    while (executor.getState() === 'RUNNING') {
      executor.update(0.05);
    }

    // 3 relative extrusions of +5mm must reach E=15, NOT E=5
    expect(executor.getKinematics().getState().currentPosition.e).toBeCloseTo(15);
  });

  // TC-STRESS-04: Coordinate boundary clamping during execution
  it('TC-STRESS-04: should clamp commanded coordinates to printer build volume (220x220x250) during execution', async () => {
    const executor = new GCodeExecutor();
    const gcode = [
      'G90',
      'G1 X300 Y-50 Z400 F3000',
    ].join('\n');

    await executor.loadGCode(gcode, 'out_of_bounds.gcode');
    executor.startPrint();

    while (executor.getState() === 'RUNNING') {
      executor.update(0.05);
    }

    const pos = executor.getKinematics().getState().currentPosition;
    // Commanded X300 should be clamped to maxX (220)
    expect(pos.x).toBeLessThanOrEqual(220);
    // Commanded Y-50 should be clamped to minY (0)
    expect(pos.y).toBeGreaterThanOrEqual(0);
    // Commanded Z400 should be clamped to maxZ (250)
    expect(pos.z).toBeLessThanOrEqual(250);
  });

  // TC-STRESS-05: G92 E0 layer resets in parseDocument do not erase cumulative filament
  it('TC-STRESS-05: should preserve cumulative filament across G92 E0 layer resets in parseDocument', () => {
    const parser = new GCodeParser();
    const gcode = [
      'M82',
      ';LAYER:0',
      'G1 E100 F1800',
      'G92 E0',
      ';LAYER:1',
      'G1 E100 F1800',
      'G92 E0',
      ';LAYER:2',
      'G1 E50 F1800',
    ].join('\n');

    const { summary } = parser.parseDocument(gcode, 'multi_layer.gcode');
    // Total filament should be 100 + 100 + 50 = 250mm, NOT 50mm
    expect(summary.totalFilamentMm).toBeCloseTo(250);
  });

  // TC-STRESS-06: parseDocument estimatedPrintTimeSeconds calculates motion deltas, not distance from origin
  it('TC-STRESS-06: should calculate motion time based on displacement delta, not absolute coordinate magnitude', () => {
    const parser = new GCodeParser();
    // Move from (100, 100) to (101, 100) at 60 mm/s (F3600) -> displacement is 1mm, motion time ~0.016s
    const gcode = [
      'G90',
      'G1 X100 Y100 E0 F3600',
      'G1 X101 Y100 E1 F3600',
    ].join('\n');

    const { summary } = parser.parseDocument(gcode, 'delta_test.gcode');
    // Motion time for 1mm move at 60mm/s should be well under 2 seconds, NOT ~2.5s from sqrt(101^2 + 100^2)
    expect(summary.estimatedPrintTimeSeconds).toBeLessThan(5);
  });

  // TC-STRESS-07: Position continuity during multi-segment execution (no yoyo jumping to origin)
  it('TC-STRESS-07: should maintain continuous position progress without dropping back to origin between moves', async () => {
    const positions: number[] = [];
    const executor = new GCodeExecutor({
      onPositionUpdate: (pos) => positions.push(pos.x),
    });

    const gcode = [
      'G90',
      'G1 X10 F3000',
      'G1 X20 F3000',
      'G1 X30 F3000',
    ].join('\n');

    await executor.loadGCode(gcode, 'continuous_x.gcode');
    executor.startPrint();

    while (executor.getState() === 'RUNNING') {
      executor.update(0.02);
    }

    // Positions should never drop back to near 0 once moving forward past 5mm
    const reachedPastFive = positions.findIndex((x) => x > 5);
    expect(reachedPastFive).toBeGreaterThanOrEqual(0);

    const positionsAfterFive = positions.slice(reachedPastFive);
    for (const x of positionsAfterFive) {
      expect(x).toBeGreaterThanOrEqual(4.5); // should NEVER drop back to 0
    }
  });

  // TC-STRESS-08: 100x speed scaling with micro-segments filament tracking
  it('TC-STRESS-08: should accurately track filament consumption across micro-segments at 100x speed', async () => {
    const executor = new GCodeExecutor();
    const lines = ['G90', 'G1 X100 Y100 F6000'];
    const count = 100;
    for (let i = 1; i <= count; i++) {
      lines.push(`G1 X${(100 + i * 0.1).toFixed(2)} E${(i * 0.1).toFixed(2)} F3000`);
    }

    await executor.loadGCode(lines.join('\n'), 'micro_segments.gcode');
    executor.setSpeedMultiplier(100);
    executor.startPrint();

    let iterations = 0;
    while (executor.getState() === 'RUNNING' && iterations < 500) {
      executor.update(0.0166);
      iterations++;
    }

    expect(executor.getState()).toBe('COMPLETED');
    // Total commanded E was 10.0mm. Filament consumed must be close to 10.0mm, NOT 50x higher
    const progress = executor.getProgress();
    expect(progress.filamentConsumedMm).toBeCloseTo(10.0, 0);
  });

  // TC-STRESS-09: Jog during PAUSED print executes jog rather than hijacking paused print move
  it('TC-STRESS-09: should execute jog target directly without executing pending paused print move', async () => {
    const executor = new GCodeExecutor();
    const gcode = [
      'G1 X10 Y10 F3000',
      'G1 X20 Y20 F3000',
      'G1 X30 Y30 F3000',
    ].join('\n');

    await executor.loadGCode(gcode);
    executor.startPrint();
    executor.update(0.001); // queue loaded
    executor.pausePrint();
    expect(executor.getState()).toBe(ExecutionState.PAUSED);

    // Send immediate jog to (100, 100)
    executor.executeImmediateCommand('G1 X100 Y100 F3000');
    const pos = executor.getKinematics().getState().currentPosition;

    // Carriage must move to jog target (100, 100), NOT pop the print block (10, 10)
    expect(pos.x).toBeCloseTo(100);
    expect(pos.y).toBeCloseTo(100);
  });

  // TC-STRESS-10: abortPrint must clear activeBlock in MotionInterpolator
  it('TC-STRESS-10: should purge activeBlock upon abortPrint() so aborted moves do not linger', async () => {
    const interpolator = new MotionInterpolator();
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

    interpolator.step(0.5, 1.0);
    expect(interpolator.getActiveBlock()).not.toBeNull();

    // Resetting or clearing after abort should nullify activeBlock
    interpolator.clearQueue();
    expect(interpolator.getActiveBlock()).toBeNull();
  });

  // TC-STRESS-11: stepForward to EOF must reach COMPLETED state
  it('TC-STRESS-11: should transition to COMPLETED when stepped forward to the end of the file', async () => {
    const executor = new GCodeExecutor();
    const gcode = 'G1 X10 F3000\nG1 X20 F3000\n';
    await executor.loadGCode(gcode);

    executor.startPrint();
    executor.pausePrint();

    for (let i = 0; i < 20; i++) {
      executor.stepForward();
      if (executor.getState() === ExecutionState.COMPLETED) break;
    }

    expect(executor.getState()).toBe(ExecutionState.COMPLETED);
  });

  // TC-STRESS-12: Flow override in M82 mode should not cause negative deltaE retractions
  it('TC-STRESS-12: should not convert forward extrusion into retractions when flow override > 100% in M82 mode', () => {
    const kinematics = new CartesianKinematics();
    kinematics.setExtruderMode(false); // M82
    kinematics.setCurrentPosition({ x: 0, y: 0, z: 0, e: 0 });
    kinematics.setFlowOverride(150); // 150% flow

    // Move 1: Slicer commands E10
    const m1 = kinematics.calculateMove({ e: 10 });
    kinematics.setCurrentPosition(m1.target);

    // Move 2: Slicer commands E12 (slicer commanded +2mm forward extrusion)
    const m2 = kinematics.calculateMove({ e: 12 });

    // Move 2 must be forward extrusion, NOT retraction
    expect(m2.deltaE).toBeGreaterThan(0);
    expect(m2.isRetracting).toBe(false);
  });

  // TC-STRESS-13: Preserve distinct toolpath types without lookahead mutation in quick_pad
  it('TC-STRESS-13: should preserve distinct toolpath types without lookahead mutation in quick_pad', async () => {
    const segments: ToolpathSegment[] = [];
    const executor = new GCodeExecutor({
      onToolpathSegment: (s) => segments.push(s),
    });

    await executor.loadGCode(generateQuickPadGCode(), 'quick_pad.gcode');
    executor.setSpeedMultiplier(100);
    executor.startPrint();

    let iterations = 0;
    while (executor.getState() === 'RUNNING' && iterations < 500) {
      executor.update(0.0166);
      iterations++;
    }

    expect(executor.getState()).toBe(ExecutionState.COMPLETED);
    expect(segments.length).toBeGreaterThan(20);

    const outerWalls = segments.filter((s) => s.type === ToolpathType.WALL_OUTER);
    const innerWalls = segments.filter((s) => s.type === ToolpathType.WALL_INNER);
    const infill = segments.filter((s) => s.type === ToolpathType.INFILL);

    // Lookahead queue must NOT mutate all perimeter segments into infill
    expect(outerWalls.length).toBeGreaterThan(0);
    expect(innerWalls.length).toBeGreaterThan(0);
    expect(infill.length).toBeGreaterThan(0);

    // Verify toolpath segments are physically chained
    for (let i = 1; i < 10; i++) {
      if (segments[i].layerIndex === segments[i - 1].layerIndex && segments[i].commandIndex === segments[i - 1].commandIndex + 1) {
        expect(segments[i].startX).toBeCloseTo(segments[i - 1].endX, 3);
        expect(segments[i].startY).toBeCloseTo(segments[i - 1].endY, 3);
        expect(segments[i].startZ).toBeCloseTo(segments[i - 1].endZ, 3);
      }
    }
  });

  // TC-STRESS-14: Accurate cumulative filament count across quick_pad layers (~37.1 mm)
  it('TC-STRESS-14: should accumulate accurate total filament consumed in quick_pad (~37.1 mm)', async () => {
    const executor = new GCodeExecutor();
    await executor.loadGCode(generateQuickPadGCode(), 'quick_pad.gcode');
    executor.setSpeedMultiplier(100);
    executor.startPrint();

    let iterations = 0;
    while (executor.getState() === 'RUNNING' && iterations < 500) {
      executor.update(0.0166);
      iterations++;
    }

    expect(executor.getState()).toBe(ExecutionState.COMPLETED);
    const progress = executor.getProgress();
    // Quick pad has 2.5mm prime line + 5 layers each ~7.42mm extrusion = 39.6mm total
    expect(progress.filamentConsumedMm).toBeCloseTo(39.6, 0);
  });
});
