import { describe, it, expect, beforeEach } from 'vitest';
import { MotionInterpolator } from '../../core/kinematics/MotionInterpolator';
import { GCodeExecutor } from '../../core/gcode/GCodeExecutor';
import { ToolpathType } from '../../core/kinematics/types';
import { generateQuickPadGCode } from '../../core/gcode/sampleModels';
import { ExecutionState } from '../../core/gcode/types';

describe('MotionInterpolator Unit Tests', () => {
  let interpolator: MotionInterpolator;

  beforeEach(() => {
    interpolator = new MotionInterpolator('linear', 1500);
    interpolator.reset({ x: 0, y: 0, z: 0, e: 0 });
  });

  it('should smoothly interpolate positions across time slices at 1x speed', () => {
    // 100mm move at F3000 (50 mm/s) -> duration = 2.0s
    interpolator.enqueue({
      commandIndex: 1,
      layerIndex: 0,
      startPosition: { x: 0, y: 0, z: 0, e: 0 },
      targetPosition: { x: 100, y: 0, z: 0, e: 2.0 },
      deltaX: 100,
      deltaY: 0,
      deltaZ: 0,
      deltaE: 2.0,
      distanceXYZ: 100,
      feedrate: 3000,
      duration: 2.0,
      type: ToolpathType.WALL_OUTER,
      isExtruding: true,
    });

    // Step 0.5s -> 25% progress
    const step1 = interpolator.step(0.5, 1.0);
    expect(step1.currentPosition.x).toBeCloseTo(25.0);
    expect(step1.currentPosition.e).toBeCloseTo(0.5);
    expect(step1.completedBlocks.length).toBe(0);
    expect(step1.hasRemaining).toBe(true);

    // Step 0.5s -> 50% progress
    const step2 = interpolator.step(0.5, 1.0);
    expect(step2.currentPosition.x).toBeCloseTo(50.0);
    expect(step2.currentPosition.e).toBeCloseTo(1.0);

    // Step 1.0s -> 100% progress (block completes)
    const step3 = interpolator.step(1.0, 1.0);
    expect(step3.currentPosition.x).toBeCloseTo(100.0);
    expect(step3.currentPosition.e).toBeCloseTo(2.0);
    expect(step3.completedBlocks.length).toBe(1);
    expect(step3.hasRemaining).toBe(false);
  });

  it('should handle speed multipliers (5x, 20x, 100x) without losing moves', () => {
    // Queue 20 small segments, each 0.05s duration (total 1.0s duration)
    for (let i = 1; i <= 20; i++) {
      interpolator.enqueue({
        commandIndex: i,
        layerIndex: 0,
        startPosition: { x: (i - 1) * 5, y: 0, z: 0, e: 0 },
        targetPosition: { x: i * 5, y: 0, z: 0, e: 0 },
        deltaX: 5,
        deltaY: 0,
        deltaZ: 0,
        deltaE: 0,
        distanceXYZ: 5,
        feedrate: 6000,
        duration: 0.05,
        type: ToolpathType.TRAVEL,
        isExtruding: false,
      });
    }

    expect(interpolator.getQueueLength()).toBe(20);

    // At 100x speed multiplier, a single 16.6ms animation frame (0.0166s) provides timeBudget = 1.66s
    // which should consume all 20 blocks in one tick!
    const step = interpolator.step(0.0166, 100);

    expect(step.completedBlocks.length).toBe(20);
    expect(step.hasRemaining).toBe(false);
    expect(step.currentPosition.x).toBeCloseTo(100.0);
  });

  it('should support single-step mode completing exactly 1 block', () => {
    for (let i = 1; i <= 5; i++) {
      interpolator.enqueue({
        commandIndex: i,
        layerIndex: 0,
        startPosition: { x: (i - 1) * 10, y: 0, z: 0, e: 0 },
        targetPosition: { x: i * 10, y: 0, z: 0, e: 0 },
        deltaX: 10,
        deltaY: 0,
        deltaZ: 0,
        deltaE: 0,
        distanceXYZ: 10,
        feedrate: 3000,
        duration: 0.2,
        type: ToolpathType.TRAVEL,
        isExtruding: false,
      });
    }

    // Single step
    const result = interpolator.step(10.0, 1.0, true);
    expect(result.completedBlocks.length).toBe(1);
    expect(result.currentPosition.x).toBeCloseTo(10.0);
    expect(interpolator.getQueueLength()).toBe(4);
  });

  it('should preserve progress on mid-segment pause and resume', () => {
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
      duration: 1.0,
      type: ToolpathType.TRAVEL,
      isExtruding: false,
    });

    // Advance 0.4s
    interpolator.step(0.4, 1.0);
    const active = interpolator.getActiveBlock();
    expect(active).not.toBeNull();
    expect(active?.elapsed).toBeCloseTo(0.4);

    // Resume after pause: advance 0.6s to complete
    const finishStep = interpolator.step(0.6, 1.0);
    expect(finishStep.completedBlocks.length).toBe(1);
    expect(finishStep.currentPosition.x).toBeCloseTo(100.0);
  });

  it('should support trapezoidal interpolation mode without domain errors', () => {
    interpolator.setMode('trapezoidal');
    interpolator.setAcceleration(1000);

    interpolator.enqueue({
      commandIndex: 1,
      layerIndex: 0,
      startPosition: { x: 0, y: 0, z: 0, e: 0 },
      targetPosition: { x: 50, y: 0, z: 0, e: 0 },
      deltaX: 50,
      deltaY: 0,
      deltaZ: 0,
      deltaE: 0,
      distanceXYZ: 50,
      feedrate: 3000,
      duration: 1.0,
      type: ToolpathType.TRAVEL,
      isExtruding: false,
    });

    // Step at 0.5s (midpoint)
    const midStep = interpolator.step(0.5, 1.0);
    expect(midStep.currentPosition.x).toBeGreaterThan(0);
    expect(midStep.currentPosition.x).toBeLessThan(50);

    // Complete move
    const finalStep = interpolator.step(0.6, 1.0);
    expect(finalStep.completedBlocks.length).toBe(1);
    expect(finalStep.currentPosition.x).toBeCloseTo(50.0);
  });
});

describe('GCodeExecutor Integration Tests', () => {
  let executor: GCodeExecutor;

  beforeEach(() => {
    executor = new GCodeExecutor();
  });

  it('should execute full Quick Test Pad print and transition to COMPLETED', async () => {
    const gcode = generateQuickPadGCode();
    await executor.loadGCode(gcode, 'quick_pad.gcode');

    expect(executor.getState()).toBe(ExecutionState.IDLE);
    executor.setSpeedMultiplier(100); // 100x high speed for fast test execution
    executor.startPrint();
    expect(executor.getState()).toBe(ExecutionState.RUNNING);

    // Step the simulation engine until complete (or max 200 ticks)
    let ticks = 0;
    while (executor.getState() === ExecutionState.RUNNING && ticks < 200) {
      executor.update(0.05); // 50ms ticks at 100x
      ticks++;
    }

    expect(executor.getState()).toBe(ExecutionState.COMPLETED);
    const progress = executor.getProgress();
    expect(progress.percentage).toBe(100);
    expect(progress.filamentConsumedMm).toBeGreaterThan(10);
    expect(executor.getLogHistory().some((l) => l.includes('Print completed successfully'))).toBe(true);
  });

  it('should support play, pause, resume, and abort states', async () => {
    const gcode = generateQuickPadGCode();
    await executor.loadGCode(gcode);

    executor.startPrint();
    expect(executor.getState()).toBe(ExecutionState.RUNNING);

    executor.pausePrint();
    expect(executor.getState()).toBe(ExecutionState.PAUSED);

    executor.resumePrint();
    expect(executor.getState()).toBe(ExecutionState.RUNNING);

    executor.abortPrint();
    expect(executor.getState()).toBe(ExecutionState.ABORTED);
  });

  it('should execute immediate commands via virtual terminal protocol', () => {
    const resHoming = executor.executeImmediateCommand('G28');
    expect(resHoming).toBe('ok');
    expect(executor.getKinematics().getState().isHomed.x).toBe(true);

    const resJog = executor.executeImmediateCommand('G1 X50 Y75 F3000');
    expect(resJog).toBe('ok');
    const pos = executor.getKinematics().getState().currentPosition;
    expect(pos.x).toBeCloseTo(50);
    expect(pos.y).toBeCloseTo(75);

    const resM114 = executor.executeImmediateCommand('M114');
    expect(resM114).toBe('ok');
    expect(executor.getLogHistory().some((l) => l.includes('X:50.00 Y:75.00'))).toBe(true);
  });

  it('should enforce cold extrusion guard when hotend is below threshold', async () => {
    // Thermal bridge reporting cold hotend (25°C)
    executor.setThermalBridge({
      getHotendTemp: () => ({ actual: 25, target: 0 }),
      getBedTemp: () => ({ actual: 25, target: 0 }),
      setHotendTarget: () => {},
      setBedTarget: () => {},
      isTargetReached: () => true,
      getColdExtrusionThreshold: () => 170,
      isThermalRunaway: () => false,
    });

    executor.executeImmediateCommand('G1 E5.0 F1200');
    expect(executor.getLogHistory().some((l) => l.includes('cold extrusion prevented'))).toBe(true);
  });
});
