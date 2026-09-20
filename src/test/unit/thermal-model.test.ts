import { describe, it, expect, beforeEach } from 'vitest';
import { ThermalModel } from '../../core/thermal/ThermalModel';
import { PIDController } from '../../core/thermal/PIDController';
import { GCodeExecutor } from '../../core/gcode/GCodeExecutor';
import { ExecutionState } from '../../core/gcode/types';

describe('ThermalModel and Safety Watchdog Unit Tests', () => {
  let model: ThermalModel;

  beforeEach(() => {
    model = new ThermalModel({ ambientTemp: 21.0 });
  });

  describe('PID Controller', () => {
    it('should compute zero output when target is 0 or less', () => {
      const pid = new PIDController({ kp: 0.045, ki: 0.0018, kd: 0.28 });
      expect(pid.update(0, 21.0, 0.1)).toBe(0);
      expect(pid.update(-5, 21.0, 0.1)).toBe(0);
    });

    it('should saturate at 1.0 when error is large and clamp properly', () => {
      const pid = new PIDController({ kp: 0.045, ki: 0.0018, kd: 0.28 });
      const out = pid.update(200, 21.0, 0.1);
      expect(out).toBe(1.0); // Output clamped to 1.0
    });

    it('should clamp anti-windup integral to avoid saturation', () => {
      const pid = new PIDController({ kp: 0.045, ki: 0.0018, kd: 0.28 });
      // Run with large error for 1000 seconds
      for (let i = 0; i < 1000; i++) {
        pid.update(200, 21.0, 1.0);
      }
      // Integral should be capped at 1.0 / ki = 1 / 0.0018 ≈ 555.55
      expect(pid.getIntegral()).toBeLessThanOrEqual(1.0 / 0.0018 + 0.001);
    });
  });

  describe('Thermal Physics ODE & Heating Curves', () => {
    it('should heat hotend toward 200°C with < 2.0°C overshoot and reach setpoint', () => {
      model.setHotendTarget(200);

      let maxTemp = 21.0;
      // Simulate 120 seconds of heating at 0.1s steps
      for (let t = 0; t < 1200; t++) {
        model.update(0.1);
        const cur = model.getHotend().actual;
        if (cur > maxTemp) maxTemp = cur;
      }

      const hotend = model.getHotend();
      // Must be within 1.0°C of 200°C
      expect(hotend.actual).toBeGreaterThan(199.0);
      expect(hotend.actual).toBeLessThan(201.0);
      // Overshoot requirement: max temp must not exceed setpoint by >= 2.0°C
      expect(maxTemp).toBeLessThan(202.0);
      expect(model.isTargetReached('hotend', 1.0)).toBe(true);
    });

    it('should heat bed toward 60°C and settle at setpoint smoothly', () => {
      model.setBedTarget(60);

      let maxTemp = 21.0;
      // Bed has higher thermal mass (~150-180 seconds to reach 60°C)
      for (let t = 0; t < 2000; t++) {
        model.update(0.1);
        const cur = model.getBed().actual;
        if (cur > maxTemp) maxTemp = cur;
      }

      const bed = model.getBed();
      expect(bed.actual).toBeGreaterThan(59.0);
      expect(bed.actual).toBeLessThan(61.0);
      expect(maxTemp).toBeLessThan(62.0);
      expect(model.isTargetReached('bed', 1.0)).toBe(true);
    });

    it('should maintain unconditional stability under large dt steps (up to 100x playback)', () => {
      const fastModel = new ThermalModel({ ambientTemp: 21.0 });
      fastModel.setHotendTarget(200);

      // Large time jumps (1.0s to 5.0s per step)
      for (let t = 0; t < 25; t++) {
        fastModel.update(5.0); // 5 seconds per update step
        expect(fastModel.getHotend().actual).toBeGreaterThanOrEqual(21.0);
        expect(fastModel.getHotend().actual).toBeLessThan(250.0);
        expect(Number.isFinite(fastModel.getHotend().actual)).toBe(true);
      }

      expect(fastModel.getHotend().actual).toBeCloseTo(200, 0);
    });

    it('should cool down toward ambient when target set to 0', () => {
      // First heat hotend to ~200°C
      model.setHotendTarget(200);
      for (let t = 0; t < 1000; t++) model.update(0.1);
      expect(model.getHotend().actual).toBeGreaterThan(195);

      // Now turn off
      model.setHotendTarget(0);
      for (let t = 0; t < 2000; t++) model.update(0.1);

      // Should have cooled down substantially toward 21°C
      expect(model.getHotend().actual).toBeLessThan(35.0);
    });

    it('should cool faster when part cooling fan is turned on', () => {
      const modelNoFan = new ThermalModel({ ambientTemp: 21.0 });
      const modelWithFan = new ThermalModel({ ambientTemp: 21.0 });

      // Heat both to 200°C
      modelNoFan.setHotendTarget(200);
      modelWithFan.setHotendTarget(200);
      for (let t = 0; t < 1000; t++) {
        modelNoFan.update(0.1);
        modelWithFan.update(0.1);
      }

      // Cut power on both; enable 100% fan on second
      modelNoFan.setHotendTarget(0);
      modelWithFan.setHotendTarget(0);
      modelWithFan.setFanSpeed(1.0);

      // Advance 40 seconds
      for (let t = 0; t < 400; t++) {
        modelNoFan.update(0.1);
        modelWithFan.update(0.1);
      }

      // Model with fan must have cooled measurably faster
      expect(modelWithFan.getHotend().actual).toBeLessThan(modelNoFan.getHotend().actual - 4.0);
    });

    it('should still reach normal printing setpoints with the part fan at 100%', () => {
      // Regression: the part fan used to cost the hotend so much headroom that
      // its saturated steady state fell below a PLA setpoint, so every print
      // with cooling on stalled under the heater and tripped the rise watchdog.
      for (const setpoint of [205, 240, 255]) {
        const model = new ThermalModel({ ambientTemp: 21.0 });
        model.setFanSpeed(1.0);
        model.setHotendTarget(setpoint);
        for (let t = 0; t < 6000; t++) model.update(0.1);

        // Full cooling costs a few degrees of droop, as it does on real
        // hardware, but the block must stay inside the firmware's own +/-10 C
        // in-range band so neither safety watchdog has grounds to trip.
        expect(model.isThermalRunaway()).toBe(false);
        expect(model.getHotend().actual).toBeGreaterThan(setpoint - 10.0);
      }
    });
  });

  describe('Cold Extrusion Interlock', () => {
    it('should forbid extrusion when hotend is below 170°C', () => {
      model.setHotendTarget(100);
      for (let t = 0; t < 300; t++) model.update(0.1);

      expect(model.getHotend().actual).toBeLessThan(170);
      expect(model.canExtrude()).toBe(false);
    });

    it('should permit extrusion when hotend reaches or exceeds 170°C', () => {
      model.setHotendTarget(180);
      for (let t = 0; t < 1000; t++) model.update(0.1);

      expect(model.getHotend().actual).toBeGreaterThanOrEqual(170);
      expect(model.canExtrude()).toBe(true);
    });

    it('should prevent extrusion if thermal model has an active error even if hot', () => {
      model.setHotendTarget(200);
      for (let t = 0; t < 1000; t++) model.update(0.1);
      expect(model.canExtrude()).toBe(true);

      model.triggerEmergencyStop();
      expect(model.canExtrude()).toBe(false);
    });
  });

  describe('Marlin/Klipper Thermal Runaway Safety Watchdogs', () => {
    it('should trip thermal runaway on open-loop heating stall (heating watchdog)', () => {
      model.setHotendTarget(200);
      // Simulate heater failure / cartridge fell out
      model.setSimulatedFailure('hotend', true);

      // Advance past tau_watch (25s)
      for (let t = 0; t < 300; t++) {
        model.update(0.1);
      }

      expect(model.isThermalRunaway()).toBe(true);
      expect(model.getHotend().hasError).toBe(true);
      expect(model.getHotend().power).toBe(0);
      expect(model.getFanSpeed()).toBe(1.0); // Fan forced to 100% on runaway
      expect(model.getErrorReason()).toContain('Thermal Runaway');
    });

    it('should trip in-range thermal runaway when temperature drops > 10°C under full power for > 15s', () => {
      // 1. Heat to 200°C setpoint
      model.setHotendTarget(200);
      for (let t = 0; t < 1000; t++) model.update(0.1);
      expect(model.isTargetReached('hotend', 1.0)).toBe(true);

      // 2. Drop temperature directly to 185°C (15°C below target) and simulate heater detachment
      model.setActualTemperatureDirect('hotend', 185.0);
      model.setSimulatedFailure('hotend', true);

      // Advance 16 seconds (in-range drift threshold is 15s)
      for (let t = 0; t < 170; t++) {
        model.update(0.1);
      }

      expect(model.isThermalRunaway()).toBe(true);
      expect(model.getErrorReason()).toContain('dropped > 10°C below setpoint');
    });

    it('should trip MINTEMP sensor fault if temperature drops below -10°C', () => {
      model.setActualTemperatureDirect('hotend', -15.0);
      model.update(0.1);

      expect(model.isThermalRunaway()).toBe(true);
      expect(model.getErrorReason()).toContain('MINTEMP');
    });

    it('should trip MAXTEMP sensor fault if temperature exceeds 310°C', () => {
      model.setActualTemperatureDirect('hotend', 320.0);
      model.update(0.1);

      expect(model.isThermalRunaway()).toBe(true);
      expect(model.getErrorReason()).toContain('MAXTEMP');
    });

    it('should allow clearing faults with resetFaults()', () => {
      model.triggerEmergencyStop();
      expect(model.isThermalRunaway()).toBe(true);

      model.resetFaults();
      expect(model.isThermalRunaway()).toBe(false);
      expect(model.getHotend().hasError).toBe(false);
    });
  });

  describe('GCodeExecutor Thermal Bridge Integration', () => {
    it('should update hotend and bed targets via M104 and M140 G-code commands', async () => {
      const executor = new GCodeExecutor({}, model);
      await executor.loadGCode('M104 S215\nM140 S65\n');
      executor.startPrint();

      // Step through commands
      executor.update(0.1);
      executor.update(0.1);

      expect(model.getHotend().target).toBe(215);
      expect(model.getBed().target).toBe(65);
    });

    it('should halt execution queue on M109 until hotend temperature is reached', async () => {
      const executor = new GCodeExecutor({}, model);
      await executor.loadGCode('M109 S190\nG1 X50 Y50 E10 F3000\n');
      executor.startPrint();

      // Initial tick: M109 starts waiting
      executor.update(0.1);
      expect(executor.getTargetTempSetpoint()).toBe(190);
      expect(executor.getKinematics().getState().currentPosition.x).toBe(0);

      // Fast-forward temperature to 190°C
      model.setActualTemperatureDirect('hotend', 190.0);
      executor.update(0.1);

      // Move should now execute
      for (let i = 0; i < 20; i++) {
        executor.update(0.1);
      }
      expect(executor.getKinematics().getState().currentPosition.x).toBe(50);
    });

    it('should prevent extrusion when hotend is cold during G-code execution', async () => {
      const executor = new GCodeExecutor({}, model);
      // Hotend starts at 21°C (< 170°C)
      await executor.loadGCode('G1 X20 Y20 E5 F1200\n');
      executor.startPrint();

      for (let i = 0; i < 30; i++) {
        executor.update(0.1);
      }

      // Carriage moves to (20, 20), but extrusion E must be suppressed (0)
      const pos = executor.getKinematics().getState().currentPosition;
      expect(pos.x).toBe(20);
      expect(pos.y).toBe(20);
      expect(pos.e).toBe(0);
      expect(executor.getLogHistory().some((l) => l.includes('cold extrusion prevented'))).toBe(true);
    });

    it('should cut power and halt printer on emergency stop M112', async () => {
      const executor = new GCodeExecutor({}, model);
      await executor.loadGCode('M104 S210\nM112\nG1 X50\n');
      executor.startPrint();

      for (let i = 0; i < 10; i++) {
        executor.update(0.1);
      }

      expect(executor.getState()).toBe(ExecutionState.ERROR);
      expect(model.getHotend().target).toBe(0);
      expect(executor.getKinematics().getState().fanSpeed).toBe(1.0);
      expect(executor.getKinematics().getState().steppersEnabled).toBe(false);
    });
  });
});
