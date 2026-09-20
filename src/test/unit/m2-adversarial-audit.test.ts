import { describe, it, expect, beforeEach } from 'vitest';
import { ThermalModel } from '../../core/thermal/ThermalModel';
import { PIDController } from '../../core/thermal/PIDController';
import { FailureManager } from '../../core/failures/FailureManager';
import { SpaghettiGenerator } from '../../core/failures/SpaghettiGenerator';
import { TelemetryStore } from '../../core/telemetry/TelemetryStore';
import { GCodeExecutor } from '../../core/gcode/GCodeExecutor';
import { ExecutionState } from '../../core/gcode/types';

describe('Milestone 2 Forensic Auditor Adversarial Stress Tests', () => {
  describe('Thermal ODE & PID Boundary Stress Tests', () => {
    let model: ThermalModel;

    beforeEach(() => {
      model = new ThermalModel({ ambientTemp: 21.0 });
    });

    it('AUDIT-STRESS-01: ThermalModel should safely handle dt <= 0 without throwing or altering temperatures', () => {
      model.setHotendTarget(200);
      const tempBefore = model.getHotend().actual;
      model.update(0);
      expect(model.getHotend().actual).toBe(tempBefore);
      model.update(-0.1);
      expect(model.getHotend().actual).toBe(tempBefore);
      expect(Number.isFinite(model.getHotend().actual)).toBe(true);
    });

    it('AUDIT-STRESS-02: ThermalModel should clamp extreme targets to max physical temperatures', () => {
      model.setHotendTarget(9999);
      expect(model.getHotend().target).toBe(285.0); // Clamped to hotend maxTemp

      model.setHotendTarget(-500);
      expect(model.getHotend().target).toBe(0.0); // Clamped to 0

      model.setBedTarget(9999);
      expect(model.getBed().target).toBe(115.0); // Clamped to bed maxTemp

      model.setBedTarget(-50);
      expect(model.getBed().target).toBe(0.0);
    });

    it('AUDIT-STRESS-03: PIDController anti-windup should prevent infinite integrator growth under sustained maximum error', () => {
      const pid = new PIDController({ kp: 0.045, ki: 0.0018, kd: 0.28 }, 0.75);
      // Simulate 50,000 seconds of unachievable setpoint
      for (let i = 0; i < 50000; i++) {
        pid.update(250, 21.0, 1.0);
      }

      // Max integral allowed = maxI / ki = 0.75 / 0.0018 = 416.666...
      expect(pid.getIntegral()).toBeCloseTo(0.75 / 0.0018, 2);
      expect(Number.isFinite(pid.getIntegral())).toBe(true);
    });

    it('AUDIT-STRESS-04: Derivative-on-measurement prevents derivative spike on instantaneous target step change', () => {
      const pid = new PIDController({ kp: 0.045, ki: 0.0018, kd: 0.28 }, 0.75);
      // Steady state at 200°C
      pid.update(200, 200, 0.1);
      // Target steps from 200 to 250 in a single step with actual staying at 200
      const u = pid.update(250, 200, 0.1);
      // Since actual didn't change (200 -> 200), dMeas = 0, so termD is 0 (no derivative spike!)
      // TermP = 0.045 * 50 = 2.25 -> clamped to 1.0
      expect(u).toBe(1.0);
    });

    it('AUDIT-STRESS-05: Part cooling fan duty cycle clamping and extreme inputs', () => {
      model.setFanSpeed(5.0);
      expect(model.getFanSpeed()).toBe(1.0);
      model.setFanSpeed(-2.0);
      expect(model.getFanSpeed()).toBe(0.0);
    });

    it('AUDIT-STRESS-06: M109 wait terminated cleanly by emergency stop M112', async () => {
      const executor = new GCodeExecutor({}, model);
      await executor.loadGCode('M109 S210\nG1 X50 Y50 E5\n');
      executor.startPrint();

      // Tick once to enter M109 waiting state
      executor.update(0.1);
      expect(executor.getTargetTempSetpoint()).toBe(210);

      // Trigger M112 emergency stop while waiting for temperature
      executor.emergencyStop('Emergency test abort');

      expect(executor.getState()).toBe(ExecutionState.ERROR);
      expect(model.getHotend().target).toBe(0);
      expect(executor.getKinematics().getState().steppersEnabled).toBe(false);

      // Subsequent ticks must remain in ERROR state and not resume motion
      executor.update(0.1);
      expect(executor.getState()).toBe(ExecutionState.ERROR);
      expect(executor.getKinematics().getState().currentPosition.x).toBe(0);
    });
  });

  describe('SpaghettiGenerator Adversarial Inputs', () => {
    const generator = new SpaghettiGenerator();

    it('AUDIT-STRESS-07: handles zero extrusion length and single vertex gracefully', () => {
      const start = { x: 10, y: 10, z: 0.2 };
      const end = { x: 20, y: 20, z: 0.2 };

      const pointsZero = generator.generateNoodlePath(start, end, 0, 16);
      expect(pointsZero.length).toBe(2);
      expect(pointsZero[0]).toEqual(start);
      expect(pointsZero[1]).toEqual(end);

      const pointsOneVertex = generator.generateNoodlePath(start, end, 5.0, 1);
      expect(pointsOneVertex.length).toBe(2);
      expect(pointsOneVertex[0]).toEqual(start);
      expect(pointsOneVertex[1]).toEqual(end);
    });

    it('AUDIT-STRESS-08: guarantees noodle coordinates never drop below bed Z=0', () => {
      const start = { x: 10, y: 10, z: 0.1 };
      const end = { x: 20, y: 20, z: 0.1 };

      const points = generator.generateNoodlePath(start, end, 50.0, 64);
      for (const pt of points) {
        expect(pt.z).toBeGreaterThanOrEqual(0.0);
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
        expect(Number.isFinite(pt.z)).toBe(true);
      }
    });
  });

  describe('TelemetryStore Immutability and Buffer Caps', () => {
    it('AUDIT-STRESS-09: TelemetryStore snapshots are deeply cloned and resist outside mutation', () => {
      const store = new TelemetryStore();
      const state1 = store.getState();

      // Attempt to mutate the returned state snapshot directly
      state1.hotend.actual = 999.0;
      state1.failures.layerShift.x = 888.0;
      state1.thermalHistory.push({ timestamp: 1, hotendActual: 0, hotendTarget: 0, bedActual: 0, bedTarget: 0 });

      // Clean state in store should be unaffected
      const state2 = store.getState();
      expect(state2.hotend.actual).toBe(21.0);
      expect(state2.failures.layerShift.x).toBe(0.0);
      expect(state2.thermalHistory.length).toBe(0);
    });

    it('AUDIT-STRESS-10: TelemetryStore caps terminal log at 500 entries under flood', () => {
      const store = new TelemetryStore();
      for (let i = 0; i < 750; i++) {
        store.appendTerminal(`Flood message ${i}`);
      }

      const log = store.getState().terminalLog;
      expect(log.length).toBe(500);
      // First retained message should be message #250
      expect(log[0].message).toBe('Flood message 250');
      // Last message should be message #749
      expect(log[log.length - 1].message).toBe('Flood message 749');
    });

    it('AUDIT-STRESS-11: FailureManager physical runaway simulation trips watchdog after time elapsed', () => {
      const model = new ThermalModel();
      const fm = new FailureManager(model);
      model.setHotendTarget(200);
      fm.simulateThermalRunaway('hotend');
      expect(fm.getConfig().thermalRunawaySimulated).toBe(true);

      // Advance 26s past hotendTauWatch (25s)
      for (let i = 0; i < 260; i++) {
        model.update(0.1);
      }

      expect(model.isThermalRunaway()).toBe(true);

      fm.resetAllFailures();
      expect(fm.getConfig().thermalRunawaySimulated).toBe(false);
      expect(model.isThermalRunaway()).toBe(false);
    });
  });
});
