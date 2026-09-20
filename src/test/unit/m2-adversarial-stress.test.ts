import { describe, it, expect, beforeEach } from 'vitest';
import { ThermalModel } from '../../core/thermal/ThermalModel';
import { PIDController } from '../../core/thermal/PIDController';
import { FailureManager } from '../../core/failures/FailureManager';
import { SpaghettiGenerator } from '../../core/failures/SpaghettiGenerator';
import { TelemetryStore } from '../../core/telemetry/TelemetryStore';
import { GCodeExecutor } from '../../core/gcode/GCodeExecutor';
import { ExecutionState } from '../../core/gcode/types';

describe('Adversarial Stress & Edge-Case Suite: Milestone 2', () => {
  let thermalModel: ThermalModel;
  let failureManager: FailureManager;
  let telemetryStore: TelemetryStore;

  beforeEach(() => {
    thermalModel = new ThermalModel({ ambientTemp: 21.0 });
    failureManager = new FailureManager(thermalModel);
    telemetryStore = new TelemetryStore();
  });

  // =========================================================================
  // Dimension 1: Thermal Physics ODE Numerical Stability & Extreme Inputs
  // =========================================================================
  describe('Dimension 1: Thermal Physics ODE Extremes & Stability', () => {
    it('should ignore negative or zero deltaTimeSeconds without altering state', () => {
      thermalModel.setHotendTarget(200);
      const initial = thermalModel.getHotend().actual;

      thermalModel.update(0);
      expect(thermalModel.getHotend().actual).toBe(initial);

      thermalModel.update(-10);
      expect(thermalModel.getHotend().actual).toBe(initial);
    });

    it('should handle extreme dt jumps (1 hour = 3600s) without NaN or divergence', () => {
      thermalModel.setHotendTarget(200);
      thermalModel.update(3600); // 1 hour step

      const hotend = thermalModel.getHotend();
      expect(Number.isFinite(hotend.actual)).toBe(true);
      expect(hotend.actual).toBeGreaterThan(190);
      expect(hotend.actual).toBeLessThanOrEqual(285); // Clamped to physical max
    });

    it('should clamp targets exceeding physical limits safely', () => {
      // Hotend max is 285°C
      thermalModel.setHotendTarget(500);
      expect(thermalModel.getHotend().target).toBe(285);

      // Bed max is 115°C
      thermalModel.setBedTarget(200);
      expect(thermalModel.getBed().target).toBe(115);

      // Negative targets clamp to 0
      thermalModel.setHotendTarget(-50);
      expect(thermalModel.getHotend().target).toBe(0);
    });

    it('should clamp fan speeds outside [0, 1] range', () => {
      thermalModel.setFanSpeed(-0.5);
      expect(thermalModel.getFanSpeed()).toBe(0.0);

      thermalModel.setFanSpeed(2.5);
      expect(thermalModel.getFanSpeed()).toBe(1.0);
    });

    it('should maintain long-term stability without drift over 10,000 steps', () => {
      thermalModel.setHotendTarget(210);
      thermalModel.setBedTarget(60);

      // Simulate 1000 seconds in 0.1s increments
      for (let i = 0; i < 10000; i++) {
        thermalModel.update(0.1);
      }

      const hotend = thermalModel.getHotend();
      const bed = thermalModel.getBed();

      expect(hotend.actual).toBeCloseTo(210, 0);
      expect(bed.actual).toBeCloseTo(60, 0);
      expect(thermalModel.isTargetReached('hotend', 1.0)).toBe(true);
      expect(thermalModel.isTargetReached('bed', 1.0)).toBe(true);
      expect(thermalModel.isThermalRunaway()).toBe(false);
    });
  });

  // =========================================================================
  // Dimension 2: PID Controller Adversarial Stress
  // =========================================================================
  describe('Dimension 2: PID Controller Robustness', () => {
    it('should handle zero ki gracefully without dividing by zero', () => {
      const pid = new PIDController({ kp: 0.1, ki: 0, kd: 0.5 });
      const out = pid.update(200, 21, 0.1);
      expect(Number.isFinite(out)).toBe(true);
      expect(pid.getIntegral()).toBe(0);
    });

    it('should handle dt = 0 gracefully without NaN', () => {
      const pid = new PIDController({ kp: 0.1, ki: 0.01, kd: 0.5 });
      const out = pid.update(200, 21, 0);
      expect(out).toBe(0.0);
    });

    it('should handle sudden target drop from 250°C to 0°C cleanly', () => {
      const pid = new PIDController({ kp: 0.045, ki: 0.0018, kd: 0.28 });
      pid.update(250, 21, 10.0); // Large integral accumulation
      expect(pid.getIntegral()).toBeGreaterThan(0);

      const out = pid.update(0, 240, 0.1);
      expect(out).toBe(0.0);
      expect(pid.getIntegral()).toBe(0); // Integral cleared on target <= 0
    });
  });

  // =========================================================================
  // Dimension 3: Safety Watchdogs & Boundary Fault Conditions
  // =========================================================================
  describe('Dimension 3: Safety Watchdogs & Boundary Faults', () => {
    it('should trip MINTEMP at exactly below -10.0°C', () => {
      thermalModel.setActualTemperatureDirect('hotend', -10.05);
      thermalModel.update(0.1);
      expect(thermalModel.isThermalRunaway()).toBe(true);
      expect(thermalModel.getErrorReason()).toContain('MINTEMP');
    });

    it('should trip MAXTEMP at exactly above 310.0°C', () => {
      thermalModel.setActualTemperatureDirect('hotend', 310.05);
      thermalModel.update(0.1);
      expect(thermalModel.isThermalRunaway()).toBe(true);
      expect(thermalModel.getErrorReason()).toContain('MAXTEMP');
    });

    it('should trip MAXTEMP on bed exceeding 130.0°C', () => {
      thermalModel.setActualTemperatureDirect('bed', 130.5);
      thermalModel.update(0.1);
      expect(thermalModel.isThermalRunaway()).toBe(true);
      expect(thermalModel.getErrorReason()).toContain('MAXTEMP');
    });

    it('should reset heating rise watchdog timer if temperature rises >= 2.0°C within window', () => {
      thermalModel.setHotendTarget(200);
      // Simulate normal heating for 20s (less than 25s tau_watch)
      for (let i = 0; i < 200; i++) {
        thermalModel.update(0.1);
      }
      expect(thermalModel.isThermalRunaway()).toBe(false);
      expect(thermalModel.getHotend().actual).toBeGreaterThan(25.0); // Rose significantly
    });

    it('should NOT trip in-range watchdog if temperature drop is <= 10°C', () => {
      thermalModel.setHotendTarget(200);
      for (let i = 0; i < 1000; i++) thermalModel.update(0.1);
      expect(thermalModel.isTargetReached('hotend', 1.0)).toBe(true);

      // Temperature drops by 5°C (to 195°C, <= 10°C drop)
      thermalModel.setActualTemperatureDirect('hotend', 195.0);
      for (let i = 0; i < 200; i++) thermalModel.update(0.1); // 20 seconds

      expect(thermalModel.isThermalRunaway()).toBe(false);
    });

    it('should immediately kill heater power to 0 and set fan to 1.0 on emergency stop', () => {
      thermalModel.setHotendTarget(220);
      thermalModel.setBedTarget(70);
      thermalModel.update(0.1);

      thermalModel.triggerEmergencyStop();

      expect(thermalModel.isThermalRunaway()).toBe(true);
      expect(thermalModel.getHotend().power).toBe(0);
      expect(thermalModel.getBed().power).toBe(0);
      expect(thermalModel.getHotend().target).toBe(0);
      expect(thermalModel.getBed().target).toBe(0);
      expect(thermalModel.getFanSpeed()).toBe(1.0);
    });
  });

  // =========================================================================
  // Dimension 4: Hardware Failures & Procedural Noodle Boundary Behavior
  // =========================================================================
  describe('Dimension 4: Hardware Failure Modes & Spaghetti Mechanics', () => {
    it('should handle zero-length and zero-extrusion moves in SpaghettiGenerator without NaN', () => {
      const gen = new SpaghettiGenerator();
      const points = gen.generateNoodlePath({ x: 10, y: 10, z: 5 }, { x: 10, y: 10, z: 5 }, 0, 16);
      expect(points.length).toBe(2);
      expect(points[0]).toEqual({ x: 10, y: 10, z: 5 });
      expect(points[1]).toEqual({ x: 10, y: 10, z: 5 });
    });

    it('should never produce negative Z in SpaghettiGenerator regardless of gravity sag', () => {
      const gen = new SpaghettiGenerator({ gravitySagRate: 50.0 }); // Massive gravity drop
      const points = gen.generateNoodlePath({ x: 0, y: 0, z: 1 }, { x: 50, y: 50, z: 1 }, 10, 32);

      for (const pt of points) {
        expect(pt.z).toBeGreaterThanOrEqual(0.0);
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
        expect(Number.isFinite(pt.z)).toBe(true);
      }
    });

    it('should accumulate and invert layer shifts accurately', () => {
      failureManager.triggerLayerShift(15, -10);
      expect(failureManager.getLayerShiftOffset()).toEqual({ x: 15, y: -10 });

      failureManager.triggerLayerShift(-15, 10);
      expect(failureManager.getLayerShiftOffset()).toEqual({ x: 0, y: 0 });
    });

    it('should clamp head parking Z at maximum build height (250mm) on filament runout', async () => {
      const executor = new GCodeExecutor({}, undefined, failureManager);
      // Start print at Z=248mm
      await executor.loadGCode('G1 Z248 F3000\nG1 X50 Y50 F3000\n');
      executor.startPrint();

      // Advance simulation so Z reaches 248mm (248mm / 50mm/s = ~5s)
      for (let i = 0; i < 60; i++) {
        executor.update(0.1);
      }
      expect(executor.getKinematics().getState().currentPosition.z).toBe(248);

      failureManager.setFilamentRunout(true);
      executor.update(0.1);

      expect(executor.getState()).toBe(ExecutionState.PAUSED);
      const pos = executor.getKinematics().getState().currentPosition;
      expect(pos.x).toBe(10);
      expect(pos.y).toBe(10);
      // Z was 248, Z+5 = 253, but must clamp at 250
      expect(pos.z).toBe(250);
    });
  });

  // =========================================================================
  // Dimension 5: Telemetry Store Immutability & Ring Buffer Integrity
  // =========================================================================
  describe('Dimension 5: Telemetry Store Ring Buffer & Immutability', () => {
    it('should maintain strict 120-element ring buffer when inundated with 1,000 samples', () => {
      for (let i = 0; i < 1000; i++) {
        telemetryStore.recordThermalSample({
          timestamp: i,
          hotendActual: 200,
          hotendTarget: 200,
          bedActual: 60,
          bedTarget: 60,
        });
      }

      const history = telemetryStore.getState().thermalHistory;
      expect(history.length).toBe(120);
      expect(history[0].timestamp).toBe(880); // 1000 - 120 = 880
      expect(history[119].timestamp).toBe(999);
    });

    it('should not allow external mutation to corrupt internal telemetry state (defensive copy)', () => {
      const state1 = telemetryStore.getState();
      // Attempt to mutate returned objects directly
      state1.hotend.actual = 999;
      state1.failures.layerShift.x = 999;
      state1.thermalHistory.push({
        timestamp: 0,
        hotendActual: 0,
        hotendTarget: 0,
        bedActual: 0,
        bedTarget: 0,
      });

      // Fetch fresh state: should remain unpolluted
      const state2 = telemetryStore.getState();
      expect(state2.hotend.actual).toBe(21.0);
      expect(state2.failures.layerShift.x).toBe(0);
      expect(state2.thermalHistory.length).toBe(0);
    });

    it('should cap terminal logs at 500 entries to prevent memory leak', () => {
      for (let i = 0; i < 700; i++) {
        telemetryStore.appendTerminal(`Log message #${i}`);
      }

      const logs = telemetryStore.getState().terminalLog;
      expect(logs.length).toBe(500);
      expect(logs[0].message).toBe('Log message #200');
      expect(logs[499].message).toBe('Log message #699');
    });
  });

  // =========================================================================
  // Dimension 6: System Integration & GCodeExecutor Bridging
  // =========================================================================
  describe('Dimension 6: GCodeExecutor & Thermal Bridge Interlocks', () => {
    it('should prevent cold extrusion on manual terminal jog commands when cold', () => {
      const executor = new GCodeExecutor({}, thermalModel);
      expect(thermalModel.getHotend().actual).toBe(21.0);

      // Attempt manual extrusion jog
      executor.executeImmediateCommand('G1 E10 F600');

      expect(executor.getKinematics().getState().currentPosition.e).toBe(0);
      expect(executor.getLogHistory().some((l) => l.includes('cold extrusion prevented'))).toBe(true);
    });

    it('should abort print and enter ERROR state if thermal runaway occurs while printing', async () => {
      const executor = new GCodeExecutor({}, thermalModel, failureManager);
      await executor.loadGCode('M104 S200\nG1 X100 Y100 E10 F1200\n');
      executor.startPrint();

      executor.update(0.1);
      expect(executor.getState()).toBe(ExecutionState.RUNNING);

      // Inject thermal runaway
      thermalModel.triggerEmergencyStop();
      executor.update(0.1);

      expect(executor.getState()).toBe(ExecutionState.ERROR);
      expect(executor.getKinematics().getState().steppersEnabled).toBe(false);
      expect(executor.getKinematics().getState().fanSpeed).toBe(1.0);
    });

    it('should run smoothly under 100x playback speed multiplier without throwing or stalling', async () => {
      const executor = new GCodeExecutor({}, thermalModel);
      await executor.loadGCode('M104 S200\nG1 X50 Y50 E5 F3000\nG1 X100 Y100 E10 F3000\n');
      executor.setSpeedMultiplier(100);
      executor.startPrint();

      // Pre-heat to allow extrusion
      thermalModel.setActualTemperatureDirect('hotend', 200.0);

      // Advance at 60fps (0.016s) at 100x speed
      for (let i = 0; i < 50; i++) {
        executor.update(0.016);
      }

      expect(executor.getKinematics().getState().currentPosition.x).toBeGreaterThan(0);
      expect(Number.isFinite(thermalModel.getHotend().actual)).toBe(true);
    });
  });
});
