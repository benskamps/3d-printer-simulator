import { describe, it, expect, beforeEach } from 'vitest';
import { TestSimulatorHarness } from './harness';
import { ExecutionState } from '../../core/gcode/types';

describe('Empirical Layer Tracking Verification', () => {
  let harness: TestSimulatorHarness;

  beforeEach(() => {
    harness = new TestSimulatorHarness({
      thermal: {
        hotendParams: { kHeat: 5.2, kFan: 0.003 },
      },
    });
  });

  it('Quick Pad layer tracking and completion', async () => {
    await harness.loadSampleModel('quick_pad');
    harness.thermal.setActualTemperatureDirect('hotend', 205);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(205);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(100);
    harness.startPrint();

    const layerHistory: number[] = [];
    let lastL = -1;

    const completed = harness.runUntil((h) => {
      const curL = h.getState().job.currentLayer;
      if (curL !== lastL) {
        layerHistory.push(curL);
        lastL = curL;
      }
      return h.executor.getState() === ExecutionState.COMPLETED;
    }, 120, 0.5);

    console.log('Quick Pad - completed:', completed, 'state:', harness.executor.getState(), 'layers:', layerHistory, 'final:', harness.getState().job.currentLayer, 'total:', harness.getState().job.totalLayers);
    expect(completed).toBe(true);
    expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    expect(layerHistory).toEqual([0, 1, 2, 3, 4]);
    expect(harness.getState().job.currentLayer).toBe(4);
    expect(harness.getState().job.totalLayers).toBe(5);
  });

  it('Calibration Cube layer tracking and completion', async () => {
    const summary = await harness.loadSampleModel('cube');
    expect(summary.totalLayers).toBe(100);
    harness.thermal.setActualTemperatureDirect('hotend', 200);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(200);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(100);
    harness.startPrint();

    const layerHistory: number[] = [];
    let lastL = -1;

    const completed = harness.runUntil((h) => {
      const curL = h.getState().job.currentLayer;
      if (curL !== lastL) {
        layerHistory.push(curL);
        lastL = curL;
      }
      return h.executor.getState() === ExecutionState.COMPLETED;
    }, 300, 0.5);

    console.log('Cube - completed:', completed, 'state:', harness.executor.getState(), 'layers observed:', layerHistory.length, 'first:', layerHistory[0], 'last:', layerHistory[layerHistory.length - 1], 'final:', harness.getState().job.currentLayer, 'total:', harness.getState().job.totalLayers);
    expect(completed).toBe(true);
    expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    expect(layerHistory[0]).toBe(0);
    expect(layerHistory[layerHistory.length - 1]).toBe(99);
    expect(harness.getState().job.currentLayer).toBe(99);
    expect(harness.getState().job.totalLayers).toBe(100);
  });

  it('3DBenchy layer tracking and completion', async () => {
    const summary = await harness.loadSampleModel('benchy');
    expect(summary.totalLayers).toBe(60);
    harness.thermal.setActualTemperatureDirect('hotend', 205);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(205);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(100);
    harness.startPrint();

    const layerHistory: number[] = [];
    let lastL = -1;

    const completed = harness.runUntil((h) => {
      const curL = h.getState().job.currentLayer;
      if (curL !== lastL) {
        layerHistory.push(curL);
        lastL = curL;
      }
      return h.executor.getState() === ExecutionState.COMPLETED;
    }, 200, 0.5);

    console.log('Benchy - completed:', completed, 'state:', harness.executor.getState(), 'layers observed:', layerHistory.length, 'first:', layerHistory[0], 'last:', layerHistory[layerHistory.length - 1], 'final:', harness.getState().job.currentLayer, 'total:', harness.getState().job.totalLayers);
    expect(completed).toBe(true);
    expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    expect(layerHistory[0]).toBe(0);
    expect(layerHistory[layerHistory.length - 1]).toBe(59);
    expect(harness.getState().job.currentLayer).toBe(59);
    expect(harness.getState().job.totalLayers).toBe(60);
  });

  it('Sequential Multi-Model prints reset currentLayer and re-track accurately', async () => {
    // Model 1: Quick Pad
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
    expect(harness.getState().job.totalLayers).toBe(5);

    // Clear / Load Model 2: Benchy
    harness.abortPrint();
    const benchySummary = await harness.loadSampleModel('benchy');
    expect(benchySummary.totalLayers).toBe(60);
    expect(harness.getState().job.currentLayer).toBe(0);
    expect(harness.getState().job.totalLayers).toBe(60);

    // Print Benchy to completion
    harness.thermal.setActualTemperatureDirect('hotend', 205);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(205);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(100);
    harness.startPrint();

    const benchyDone = harness.runUntil(
      (h) => h.executor.getState() === ExecutionState.COMPLETED,
      200,
      0.5
    );
    expect(benchyDone).toBe(true);
    expect(harness.getState().job.currentLayer).toBe(59);
    expect(harness.getState().job.totalLayers).toBe(60);
  });

  it('Fallback mode tracks layer increments without ;LAYER comments', async () => {
    const rawGCode = [
      'G21',
      'G90',
      'M82',
      'G28',
      'G1 Z0.2 F1000',
      'G1 X10 Y10 E1.0 F1800',
      'G1 X20 Y10 E2.0',
      'G1 Z0.4 F1000',
      'G1 X10 Y10 E3.0',
      'G1 X20 Y10 E4.0',
      'G1 Z0.6 F1000',
      'G1 X10 Y10 E5.0',
      'G1 X20 Y10 E6.0',
    ].join('\n');

    const summary = await harness.loadGCode(rawGCode, 'fallback.gcode');
    expect(summary.totalLayers).toBe(3);
    expect(harness.getState().job.totalLayers).toBe(3);
    expect(harness.getState().job.currentLayer).toBe(0);

    harness.thermal.setActualTemperatureDirect('hotend', 200);
    harness.thermal.setActualTemperatureDirect('bed', 60);
    harness.setHotendTarget(200);
    harness.setBedTarget(60);
    harness.setSpeedMultiplier(100);
    harness.startPrint();

    const done = harness.runUntil(
      (h) => h.executor.getState() === ExecutionState.COMPLETED,
      60,
      0.1
    );
    expect(done).toBe(true);
    console.log('Fallback final layer:', harness.getState().job.currentLayer, 'totalLayers:', harness.getState().job.totalLayers);
    expect(harness.getState().job.currentLayer).toBe(2);
    expect(harness.getState().job.totalLayers).toBe(3);
  });
});
