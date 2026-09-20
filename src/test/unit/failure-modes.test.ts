import { describe, it, expect, beforeEach } from 'vitest';
import { FailureManager } from '../../core/failures/FailureManager';
import { SpaghettiGenerator } from '../../core/failures/SpaghettiGenerator';
import { GCodeExecutor } from '../../core/gcode/GCodeExecutor';
import { ToolpathSegment, ToolpathType } from '../../core/kinematics/types';
import { ExecutionState } from '../../core/gcode/types';

describe('Hardware Failure Modes Unit Tests', () => {
  let failureManager: FailureManager;

  beforeEach(() => {
    failureManager = new FailureManager();
  });

  describe('FailureManager Configuration & Subscriptions', () => {
    it('should initialize with default clean configuration', () => {
      const config = failureManager.getConfig();
      expect(config.nozzleClog).toBe('NONE');
      expect(config.spaghettiMode).toBe(false);
      expect(config.layerShift).toEqual({ x: 0, y: 0 });
      expect(config.filamentRunout).toBe(false);
      expect(config.thermalRunawaySimulated).toBe(false);
    });

    it('should notify subscribers when configuration changes', () => {
      const changes: string[] = [];
      const unsubscribe = failureManager.subscribe((cfg) => {
        changes.push(cfg.nozzleClog);
      });

      failureManager.setNozzleClog('PARTIAL');
      failureManager.setNozzleClog('FULL');
      failureManager.resetAllFailures();

      unsubscribe();
      failureManager.setNozzleClog('PARTIAL'); // Should not notify after unsubscribe

      expect(changes).toEqual(['NONE', 'PARTIAL', 'FULL', 'NONE']);
    });

    it('should reset all failures to default clean state', () => {
      failureManager.setNozzleClog('FULL');
      failureManager.setSpaghettiMode(true);
      failureManager.triggerLayerShift(10, -5);
      failureManager.setFilamentRunout(true);

      failureManager.resetAllFailures();

      const config = failureManager.getConfig();
      expect(config.nozzleClog).toBe('NONE');
      expect(config.spaghettiMode).toBe(false);
      expect(config.layerShift).toEqual({ x: 0, y: 0 });
      expect(config.filamentRunout).toBe(false);
    });
  });

  describe('Nozzle Clog Mode & Extrusion Scaling', () => {
    it('should report correct extrusion scale for NONE, PARTIAL, and FULL modes', () => {
      failureManager.setNozzleClog('NONE');
      expect(failureManager.getExtrusionScale()).toBe(1.0);
      expect(failureManager.isNozzleClogged()).toBe(false);

      failureManager.setNozzleClog('PARTIAL');
      expect(failureManager.getExtrusionScale()).toBe(0.25);
      expect(failureManager.isNozzleClogged()).toBe(false);

      failureManager.setNozzleClog('FULL');
      expect(failureManager.getExtrusionScale()).toBe(0.0);
      expect(failureManager.isNozzleClogged()).toBe(true);
    });

    it('should throttle extrusion in GCodeExecutor during PARTIAL clog', async () => {
      const executor = new GCodeExecutor({}, undefined, failureManager);
      failureManager.setNozzleClog('PARTIAL');

      // Pre-heat to permit extrusion
      await executor.loadGCode('M104 S200\nG1 X10 Y0 E4 F1200\n');
      executor.startPrint();

      for (let i = 0; i < 20; i++) executor.update(0.1);

      // In PARTIAL clog, 4mm requested extrusion must be throttled to 25% = 1.0mm
      const pos = executor.getKinematics().getState().currentPosition;
      expect(pos.x).toBe(10);
      expect(pos.e).toBeCloseTo(1.0, 2);
    });

    it('should suppress extrusion completely during FULL clog (air printing)', async () => {
      const executor = new GCodeExecutor({}, undefined, failureManager);
      failureManager.setNozzleClog('FULL');

      await executor.loadGCode('G1 X25 Y25 E10 F1200\n');
      executor.startPrint();

      for (let i = 0; i < 30; i++) executor.update(0.1);

      // Toolhead carriage moved to (25, 25), but E extrusion is 0 (air printing)
      const pos = executor.getKinematics().getState().currentPosition;
      expect(pos.x).toBe(25);
      expect(pos.y).toBe(25);
      expect(pos.e).toBe(0);
    });
  });

  describe('Procedural 3D Spaghetti Generator', () => {
    let generator: SpaghettiGenerator;

    beforeEach(() => {
      generator = new SpaghettiGenerator({
        minRadius: 2.0,
        maxRadius: 5.0,
        curlFrequency: Math.PI * 4,
        gravitySagRate: 1.0,
      });
    });

    it('should generate 3D curled points with radial deflection and gravity sag', () => {
      const start = { x: 50, y: 50, z: 10 };
      const end = { x: 70, y: 50, z: 10 };
      const points = generator.generateNoodlePath(start, end, 5.0, 16);

      expect(points.length).toBe(17);
      expect(points[0]).toEqual(start);

      // Check radial deviation: intermediate points must deviate in Y
      const maxDeviationY = Math.max(...points.map((p) => Math.abs(p.y - 50)));
      expect(maxDeviationY).toBeGreaterThan(1.0);

      // Check downward gravity drop: Z of intermediate points should sag below initial Z=10
      const minZ = Math.min(...points.map((p) => p.z));
      expect(minZ).toBeLessThan(10.0);
      // But must not penetrate build plate (Z >= 0)
      expect(minZ).toBeGreaterThanOrEqual(0.0);
    });

    it('should convert a ToolpathSegment into segmented curling noodle toolpaths', () => {
      const nominalSegment: ToolpathSegment = {
        startX: 100,
        startY: 100,
        startZ: 5,
        endX: 120,
        endY: 100,
        endZ: 5,
        extrusionLength: 4.0,
        feedrate: 3000,
        type: ToolpathType.WALL_OUTER,
        layerIndex: 1,
        commandIndex: 12,
      };

      const noodles = generator.generateSpaghettiSegments(nominalSegment, 8);
      expect(noodles.length).toBe(8);

      // Total sub-extrusions must sum to nominal extrusion length
      const totalExtrusion = noodles.reduce((sum, seg) => sum + seg.extrusionLength, 0);
      expect(totalExtrusion).toBeCloseTo(4.0, 3);

      // Segments must be contiguous end-to-end
      for (let i = 0; i < noodles.length - 1; i++) {
        expect(noodles[i].endX).toBeCloseTo(noodles[i + 1].startX, 5);
        expect(noodles[i].endY).toBeCloseTo(noodles[i + 1].startY, 5);
        expect(noodles[i].endZ).toBeCloseTo(noodles[i + 1].startZ, 5);
      }
    });

    it('should return untouched segment if extrusion length is zero (travel move)', () => {
      const travelSegment: ToolpathSegment = {
        startX: 0,
        startY: 0,
        startZ: 0,
        endX: 50,
        endY: 50,
        endZ: 0,
        extrusionLength: 0,
        feedrate: 6000,
        type: ToolpathType.TRAVEL,
        layerIndex: 0,
        commandIndex: 1,
      };

      const result = generator.generateSpaghettiSegments(travelSegment);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual(travelSegment);
    });
  });

  describe('Layer Shift Simulation', () => {
    it('should accumulate hardware offset vector upon repeated triggers', () => {
      failureManager.triggerLayerShift(4.0, -2.5);
      expect(failureManager.getLayerShiftOffset()).toEqual({ x: 4.0, y: -2.5 });

      failureManager.triggerLayerShift(2.0, 1.0);
      expect(failureManager.getLayerShiftOffset()).toEqual({ x: 6.0, y: -1.5 });
    });

    it('should apply layer shift to physical coordinates in GCodeExecutor while preserving nominal G-code position', async () => {
      const executor = new GCodeExecutor({}, undefined, failureManager);
      await executor.loadGCode('G1 X50 Y50 F3000\n');
      executor.startPrint();

      for (let i = 0; i < 20; i++) executor.update(0.1);

      // Nominal position: (50, 50)
      const nom = executor.getKinematics().getState().currentPosition;
      expect(nom.x).toBe(50);
      expect(nom.y).toBe(50);

      // Physical position before shift
      expect(executor.getKinematics().getPhysicalPosition().x).toBe(50);
      expect(executor.getKinematics().getPhysicalPosition().y).toBe(50);

      // Trigger layer shift: +10mm X, -5mm Y
      failureManager.triggerLayerShift(10, -5);
      executor.update(0.05);

      // Nominal coordinates must still report exactly 50, 50 (open loop!)
      const nomAfter = executor.getKinematics().getState().currentPosition;
      expect(nomAfter.x).toBe(50);
      expect(nomAfter.y).toBe(50);

      // Physical coordinates shifted to (60, 45)
      const physAfter = executor.getKinematics().getPhysicalPosition();
      expect(physAfter.x).toBe(60);
      expect(physAfter.y).toBe(45);
    });
  });

  describe('Filament Runout Simulation', () => {
    it('should pause print, park head at (10, 10, Z+5), and log warning on filament runout', async () => {
      const executor = new GCodeExecutor({}, undefined, failureManager);
      await executor.loadGCode('G1 Z2.0 F3000\nG1 X80 Y80 F3000\n');
      executor.startPrint();

      // Step through Z move and start XY move
      for (let i = 0; i < 10; i++) executor.update(0.1);

      // Trigger filament runout
      failureManager.setFilamentRunout(true);

      // Next tick must detect runout, pause print, and park
      executor.update(0.1);

      expect(executor.getState()).toBe(ExecutionState.PAUSED);

      // Verify head parked at (10, 10, Z+5) = (10, 10, 7.0)
      const parkedPos = executor.getKinematics().getState().currentPosition;
      expect(parkedPos.x).toBe(10);
      expect(parkedPos.y).toBe(10);
      expect(parkedPos.z).toBeCloseTo(7.0, 1);

      // Verify log message
      const logs = executor.getLogHistory();
      expect(logs.some((l) => l.includes('echo: Filament runout sensor triggered! Head parked at (10, 10).'))).toBe(true);
      expect(logs.some((l) => l.includes('// action:paused'))).toBe(true);
    });
  });
});
