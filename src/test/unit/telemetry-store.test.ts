import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryStore } from '../../core/telemetry/TelemetryStore';
import { PrinterStatus } from '../../core/telemetry/types';

describe('Centralized TelemetryStore Unit Tests', () => {
  let store: TelemetryStore;

  beforeEach(() => {
    store = new TelemetryStore();
  });

  describe('Initial Default State', () => {
    it('should initialize with standard idle printer telemetry', () => {
      const state = store.getState();
      expect(state.status).toBe('IDLE');
      expect(state.statusMessage).toBe('Ready');
      expect(state.hotend.actual).toBe(21.0);
      expect(state.hotend.target).toBe(0);
      expect(state.bed.actual).toBe(21.0);
      expect(state.bed.target).toBe(0);
      expect(state.nominalPosition).toEqual({ x: 0, y: 0, z: 0, e: 0 });
      expect(state.physicalPosition).toEqual({ x: 0, y: 0, z: 0, e: 0 });
      expect(state.homedAxes).toEqual({ x: false, y: false, z: false });
      expect(state.thermalHistory).toEqual([]);
      expect(state.terminalLog).toEqual([]);
    });
  });

  describe('Status Transitions & Subscriptions', () => {
    it('should transition status and notify active subscribers', () => {
      const statuses: PrinterStatus[] = [];
      const unsubscribe = store.subscribe((s) => {
        statuses.push(s.status);
      });

      store.setStatus('HOMING', 'Homing all axes...');
      store.setStatus('HEATING', 'Heating hotend to 200°C');
      store.setStatus('PRINTING', 'Printing layer 1/50');
      store.setStatus('PAUSED', 'Filament runout pause');
      store.setStatus('ERROR', 'Thermal Runaway');

      unsubscribe();
      store.setStatus('IDLE'); // Should not trigger subscriber after unsubscribe

      expect(statuses).toEqual([
        'IDLE',
        'HOMING',
        'HEATING',
        'PRINTING',
        'PAUSED',
        'ERROR',
      ]);
      expect(store.getState().statusMessage).toBe('Thermal Runaway');
    });
  });

  describe('Heater & Thermal Telemetry Updates', () => {
    it('should update hotend and bed telemetry snapshots', () => {
      store.updateHotend({
        actual: 205.2,
        target: 205.0,
        power: 0.65,
        isHeating: true,
        hasError: false,
      });

      store.updateBed({
        actual: 60.1,
        target: 60.0,
        power: 0.35,
        isHeating: true,
        hasError: false,
      });

      const state = store.getState();
      expect(state.hotend.actual).toBe(205.2);
      expect(state.hotend.power).toBe(0.65);
      expect(state.bed.actual).toBe(60.1);
      expect(state.bed.power).toBe(0.35);
    });
  });

  describe('Rolling Thermal History Ring Buffer', () => {
    it('should append samples and strictly cap history at 120 samples', () => {
      store.updateHotend({ actual: 200, target: 200, power: 0.5, isHeating: true, hasError: false });
      store.updateBed({ actual: 60, target: 60, power: 0.3, isHeating: true, hasError: false });

      // Add 150 thermal samples
      for (let i = 1; i <= 150; i++) {
        store.recordThermalSample({
          timestamp: 1000 + i,
          hotendActual: 200 + i * 0.1,
          hotendTarget: 200,
          bedActual: 60,
          bedTarget: 60,
        });
      }

      const history = store.getState().thermalHistory;
      expect(history.length).toBe(120); // Strict cap of 120 samples

      // Oldest retained sample should be sample #31 (150 - 120 + 1 = 31)
      expect(history[0].timestamp).toBe(1031);
      // Newest sample should be sample #150
      expect(history[history.length - 1].timestamp).toBe(1150);
    });

    it('should auto-create thermal sample from current state if none provided', () => {
      store.updateHotend({ actual: 195.5, target: 200, power: 0.8, isHeating: true, hasError: false });
      store.updateBed({ actual: 55.2, target: 60, power: 0.4, isHeating: true, hasError: false });

      store.recordThermalSample();

      const history = store.getState().thermalHistory;
      expect(history.length).toBe(1);
      expect(history[0].hotendActual).toBe(195.5);
      expect(history[0].bedActual).toBe(55.2);
      expect(history[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe('Coordinates, Fan, and Hardware Failures', () => {
    it('should synchronize nominal and physical coordinates', () => {
      store.updateNominalPosition({ x: 50, y: 75, z: 10, e: 15 });
      store.updatePhysicalPosition({ x: 60, y: 70, z: 10, e: 15 }); // Shifted (+10, -5)

      const state = store.getState();
      expect(state.nominalPosition).toEqual({ x: 50, y: 75, z: 10, e: 15 });
      expect(state.physicalPosition).toEqual({ x: 60, y: 70, z: 10, e: 15 });
    });

    it('should clamp fan duty cycle between 0.0 and 1.0', () => {
      store.setFanSpeed(0.5);
      expect(store.getState().partCoolingFanSpeed).toBe(0.5);

      store.setFanSpeed(1.5);
      expect(store.getState().partCoolingFanSpeed).toBe(1.0);

      store.setFanSpeed(-0.2);
      expect(store.getState().partCoolingFanSpeed).toBe(0.0);
    });

    it('should update failure state flags', () => {
      store.updateFailures({
        nozzleClog: 'PARTIAL',
        spaghettiMode: true,
        layerShift: { x: 5, y: -3 },
        filamentRunout: true,
        thermalRunawaySimulated: false,
      });

      const failures = store.getState().failures;
      expect(failures.nozzleClog).toBe('PARTIAL');
      expect(failures.spaghettiMode).toBe(true);
      expect(failures.layerShift).toEqual({ x: 5, y: -3 });
      expect(failures.filamentRunout).toBe(true);
    });
  });

  describe('Terminal Logging Stream', () => {
    it('should append terminal log entries with sequential IDs and timestamps', () => {
      store.appendTerminal('echo: Print started.', 'echo');
      store.appendTerminal('ok T:200.0 /200.0', 'response');
      store.appendTerminal('Error: Thermal Runaway', 'error');

      const logs = store.getState().terminalLog;
      expect(logs.length).toBe(3);
      expect(logs[0].message).toBe('echo: Print started.');
      expect(logs[0].type).toBe('echo');
      expect(logs[1].type).toBe('response');
      expect(logs[2].type).toBe('error');

      store.clearTerminal();
      expect(store.getState().terminalLog.length).toBe(0);
    });
  });

  describe('Reset', () => {
    it('should reset telemetry store to clean defaults', () => {
      store.setStatus('PRINTING');
      store.updateHotend({ actual: 210, target: 210, power: 0.5, isHeating: true, hasError: false });
      store.setFanSpeed(1.0);
      store.recordThermalSample();
      store.appendTerminal('test log');

      store.reset();

      const state = store.getState();
      expect(state.status).toBe('IDLE');
      expect(state.hotend.actual).toBe(21.0);
      expect(state.hotend.target).toBe(0);
      expect(state.partCoolingFanSpeed).toBe(0.0);
      expect(state.thermalHistory.length).toBe(0);
      expect(state.terminalLog.length).toBe(0);
    });
  });
});
