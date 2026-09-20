import { describe, it, expect, beforeEach } from 'vitest';
import { TestSimulatorHarness } from './harness';
import { HeatedBedMesh } from '../../viewport/HeatedBedMesh';
import { ExecutionState } from '../../core/gcode/types';
import { ToolpathType } from '../../core/kinematics/types';

describe('Tier 3: Pairwise Cross-Feature Combinations Test Suite', () => {
  let harness: TestSimulatorHarness;

  beforeEach(() => {
    harness = new TestSimulatorHarness();
  });

  // =========================================================================
  // 1. Heatbed Thermal State + Y-Axis Toolpath Parenting
  // =========================================================================
  describe('Pairwise 1: Heatbed Thermal State & Y-Axis Toolpath Parenting', () => {
    it('P1-1: heated bed translates along Y while maintaining thermal state and parenting toolpath group', () => {
      const bedMesh = new HeatedBedMesh();
      const filamentContainer = bedMesh.getFilamentContainer();
      filamentContainer.add(harness.toolpaths.rootGroup);

      // Heat bed to 60°C
      harness.setBedTarget(60);
      harness.advanceTime(10.0);
      const bedTemp = harness.getBedTemp();
      expect(bedTemp.actual).toBeGreaterThan(20.0);
      expect(bedTemp.target).toBe(60);

      // Translate Y axis to 110mm (center of 220mm bed)
      harness.sendCommand('G1 Y110 F3000');
      const pos = harness.getNominalPosition();
      expect(pos.y).toBeCloseTo(110, 1);

      // Update 3D bed mesh position (translates along Y: [0, -Y_rel])
      bedMesh.updatePosition(pos.y);
      bedMesh.updateTemperature(bedTemp.actual, bedTemp.target);
      expect(bedMesh.getPosition()).toBeCloseTo(110, 1);
      expect(bedMesh.group.position.y).toBeCloseTo(-110, 1);

      // Filament container is child of bed mesh group, so its world matrix inherits the bed translation
      bedMesh.group.updateMatrixWorld(true);
      expect(filamentContainer.parent).toBe(bedMesh.group);

      bedMesh.dispose();
    });

    it('P1-2: toolpath deposition during heated bed motion records synchronized coordinates', async () => {
      // Heat hotend & bed
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);

      const gcode = [
        'G90',
        'G92 X0 Y0 Z0.2 E0',
        'G1 X50 Y50 E2.0 F1200',
        'G1 X50 Y150 E5.0 F1200',
      ].join('\n');

      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.advanceTime(15.0);

      expect(harness.getNominalPosition().y).toBeCloseTo(150, 1);
      expect(harness.getToolpathCount()).toBe(2);
      expect(Math.abs(harness.getBedTemp().actual - 60)).toBeLessThan(2.0);
    });

    it('P1-3: bed cooling (M140 S0) while homing Y axis (G28 Y) resets coordinate without telemetry corruption', () => {
      harness.setBedTarget(60);
      harness.advanceTime(5.0);
      expect(harness.getBedTemp().target).toBe(60);

      harness.sendCommand('G1 Y120 F3000');
      expect(harness.getNominalPosition().y).toBeCloseTo(120, 1);

      // Turn off bed and home Y
      harness.sendCommand('M140 S0');
      harness.sendCommand('G28 Y');

      expect(harness.getBedTemp().target).toBe(0);
      expect(harness.getNominalPosition().y).toBe(0);
      expect(harness.isHomed().y).toBe(true);
    });

    it('P1-4: bed reaching setpoint tolerance triggers ready status while Y carriage maintains coordinate', () => {
      harness.thermal.setActualTemperatureDirect('bed', 59.5);
      harness.setBedTarget(60);
      harness.sendCommand('G1 Y80 F3000');
      harness.advanceTime(0.5);

      expect(harness.thermal.isTargetReached('bed', 1.0)).toBe(true);
      expect(harness.getNominalPosition().y).toBeCloseTo(80, 1);
    });
  });

  // =========================================================================
  // 2. Part Cooling Fan + Hotend PID Response Curve
  // =========================================================================
  describe('Pairwise 2: Part Cooling Fan & Hotend PID Response Curve', () => {
    it('P2-1: part cooling fan increases convective heat loss and cools hotend faster', () => {
      // Warm hotend to 200°C
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(0); // Cut heating power
      harness.setFanSpeed(0.0);
      harness.advanceTime(10.0);
      const tempNoFan = harness.getHotendTemp().actual;

      // Reset and cool with 100% fan
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(0);
      harness.setFanSpeed(1.0);
      harness.advanceTime(10.0);
      const tempWithFan = harness.getHotendTemp().actual;

      // The part fan blows across the print, not the heater block, so it is a
      // trim on hotend cooling rather than a governor over it: a measurable
      // couple of degrees over 10s, not enough to pull the block off setpoint.
      expect(tempWithFan).toBeLessThan(tempNoFan - 1.5);
    });

    it('P2-2: turning part cooling fan off (M107) reduces cooling rate and sets fan duty to 0', () => {
      harness.setFanSpeed(0.8);
      expect(harness.thermal.getFanSpeed()).toBeCloseTo(0.8, 1);

      // M107 disables fan
      harness.sendCommand('M107');
      expect(harness.thermal.getFanSpeed()).toBe(0.0);
      expect(harness.getState().partCoolingFanSpeed).toBe(0.0);
    });

    it('P2-3: fan step at 150°C maintains thermal stability without triggering false thermal runaway', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 150);
      harness.setHotendTarget(150);
      harness.advanceTime(2.0);

      // Moderate fan step to 50%
      harness.setFanSpeed(0.5);
      harness.advanceTime(15.0);

      expect(harness.thermal.isThermalRunaway()).toBe(false);
      expect(harness.getState().status).not.toBe('HALTED');
      expect(Math.abs(harness.getHotendTemp().actual - 150)).toBeLessThan(10.0);
    });

    it('P2-4: cold extrusion interlock (<170°C) remains strictly enforced regardless of fan speed', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 150);
      harness.setFanSpeed(0.0);
      expect(harness.extrude(5)).toBe(false);

      harness.setFanSpeed(1.0);
      expect(harness.extrude(5)).toBe(false);

      expect(harness.getLastTerminalLine()).toContain('cold extrusion prevented');
    });
  });

  // =========================================================================
  // 3. M220 Speed Factor + Extrusion Modes (M82/M83)
  // =========================================================================
  describe('Pairwise 3: M220 Speed Multiplier & Extrusion Modes', () => {
    it('P3-1: M220 S200 (200% speed) halves move duration for relative extrusion (M83)', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = ['M83', 'G1 X100 E5.0 F1200'].join('\n');
      await harness.loadGCode(gcode);

      // Set speed factor to 200%
      harness.setSpeedMultiplier(2.0);
      harness.startPrint();

      // At F1200 = 20mm/s, 100mm move takes 5s at 1x. At 2x speed, takes 2.5s.
      harness.advanceTime(2.6);
      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
      expect(harness.getNominalPosition().x).toBeCloseTo(100, 1);
      expect(harness.getNominalPosition().e).toBeCloseTo(5.0, 1);
    });

    it('P3-2: M220 S50 (50% speed) doubles move duration for absolute extrusion (M82)', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = ['M82', 'G92 E0', 'G1 X40 E4.0 F1200'].join('\n');
      await harness.loadGCode(gcode);

      // At F1200 = 20mm/s, 40mm takes 2s at 1x. At 0.5x speed, takes 4s.
      harness.setSpeedMultiplier(0.5);
      harness.startPrint();

      harness.advanceTime(2.2);
      // Not yet completed at 2.2s under 0.5x speed
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);

      harness.advanceTime(2.2);
      // Completed after 4.4s total
      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
      expect(harness.getNominalPosition().e).toBeCloseTo(4.0, 1);
    });

    it('P3-3: combined M220 speed override (150%) and M221 flow override (125%) scale motion and extrusion', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = ['M83', 'G1 X60 E4.0 F1200'].join('\n');
      await harness.loadGCode(gcode);

      harness.sendCommand('M220 S150'); // 150% speed
      harness.sendCommand('M221 S125'); // 125% flow
      harness.startPrint();
      harness.advanceTime(5.0);

      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
      const segment = harness.getActiveSegment();
      expect(segment).not.toBeNull();
      // Flow override of 125% on 4.0mm extrusion gives 5.0mm
      expect(segment!.extrusionLength).toBeCloseTo(5.0, 1);
    });

    it('P3-4: dynamic speed multiplier update mid-print adapts subsequent move velocity', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = [
        'G1 X50 F1200',
        'M220 S500', // 5x speed
        'G1 X100 F1200',
      ].join('\n');

      await harness.loadGCode(gcode);
      harness.startPrint();

      // At 1x speed, 50mm @ 20mm/s takes 2.5s. Advancing 2.4s is just before completion of move 1.
      harness.advanceTime(2.4);
      expect(harness.getNominalPosition().x).toBeCloseTo(48, 1);

      // Now next move runs at 500% (100mm/s): 50mm move takes only 0.5s
      harness.advanceTime(0.8);
      expect(harness.getNominalPosition().x).toBeCloseTo(100, 1);
      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    });
  });

  // =========================================================================
  // 4. Active Print Execution + Hardware Failure Mode Injection
  // =========================================================================
  describe('Pairwise 4: Active Print Execution & Hardware Failure Mode Injection', () => {
    it('P4-1: mid-print nozzle clog (FULL) causes subsequent extrusion moves to generate zero filament', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = [
        'M83',
        'G1 X20 E2.0 F1200',
      ].join('\n');

      await harness.loadGCode(gcode);
      harness.setNozzleClog('FULL');
      harness.startPrint();
      harness.advanceTime(2.0);

      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
      // FULL clog causes zero toolpaths to be deposited (air printing) while motion still completes
      expect(harness.getToolpathCount()).toBe(0);
      expect(harness.getNominalPosition().x).toBeCloseTo(20, 1);
    });

    it('P4-2: mid-print spaghetti mode injection spawns brownian noodles for extrusion segments', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = ['M83', 'G1 X30 E3.0 F1200'].join('\n');
      await harness.loadGCode(gcode);

      // Enable spaghetti failure mode before move completes
      harness.setSpaghettiMode(true);
      harness.startPrint();
      harness.advanceTime(2.0);

      expect(harness.toolpaths.isSpaghettiActive()).toBe(true);
      // Toolpath count has 8 procedural spaghetti noodle segments generated
      expect(harness.getToolpathCount()).toBe(8);
    });

    it('P4-3: mid-print layer shift applies coordinate transformation to physical kinematics', () => {
      harness.sendCommand('G1 X30 Y30 F1200');
      expect(harness.getNominalPosition().x).toBeCloseTo(30, 1);
      expect(harness.getNominalPosition().y).toBeCloseTo(30, 1);

      // Inject layer shift of +15mm X, -10mm Y
      harness.triggerLayerShift(15, -10);

      // Advance second move
      harness.sendCommand('G1 X60 Y60 F1200');
      expect(harness.getNominalPosition().x).toBeCloseTo(60, 1);
      expect(harness.getNominalPosition().y).toBeCloseTo(60, 1);
      expect(harness.getPhysicalPosition().x).toBeCloseTo(75, 1);
      expect(harness.getPhysicalPosition().y).toBeCloseTo(50, 1);
    });

    it('P4-4: mid-print filament runout auto-pauses execution and parks toolhead at (10, 10, Z+5)', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = [
        'G1 X50 Y50 Z2.0 F1200',
        'G1 X100 Y100 Z2.0 F1200',
      ].join('\n');

      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.advanceTime(1.0);
      const preRunoutZ = harness.getNominalPosition().z;

      // Trip filament runout sensor
      harness.setFilamentRunout(true);
      harness.advanceTime(0.1);

      // Must be paused and parked
      expect(harness.executor.getState()).toBe(ExecutionState.PAUSED);
      expect(harness.getState().status).toBe('PAUSED');
      expect(harness.getNominalPosition().x).toBe(10);
      expect(harness.getNominalPosition().y).toBe(10);
      expect(harness.getNominalPosition().z).toBeCloseTo(preRunoutZ + 5.0, 1);
      expect(harness.getLastTerminalLine()).toContain('Filament runout sensor triggered');
    });

    it('P4-5: simultaneous nozzle clog (PARTIAL) and layer shift correctly combines both failure effects', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = ['M83', 'G1 X40 Y40 E4.0 F1200'].join('\n');
      await harness.loadGCode(gcode);

      harness.setNozzleClog('PARTIAL');
      harness.triggerLayerShift(20, 20);

      harness.startPrint();
      harness.advanceTime(3.0);

      expect(harness.getNominalPosition().x).toBeCloseTo(40, 1);
      expect(harness.getPhysicalPosition().x).toBeCloseTo(60, 1);
      const seg = harness.getActiveSegment();
      expect(seg).not.toBeNull();
      // Partial clog delivers 25% flow: 4.0 * 0.25 = 1.0mm
      expect(seg!.extrusionLength).toBeCloseTo(1.0, 1);
    });
  });

  // =========================================================================
  // 5. Cold Extrusion Interlock + Manual Jog Controls
  // =========================================================================
  describe('Pairwise 5: Cold Extrusion Interlock & Manual Jog Controls', () => {
    it('P5-1: manual jog extrude rejected at ambient temperature (25°C) without altering E register', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 25);
      const initialE = harness.getNominalPosition().e;

      const success = harness.extrude(10);
      expect(success).toBe(false);
      expect(harness.getNominalPosition().e).toBe(initialE);
      expect(harness.getLastTerminalLine()).toContain('cold extrusion prevented');
    });

    it('P5-2: manual XYZ jog succeeds at ambient temperature while extrude remains locked', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 25);

      harness.jog('X', 10);
      harness.jog('Y', 20);
      harness.jog('Z', 5);

      expect(harness.getNominalPosition().x).toBeCloseTo(10, 1);
      expect(harness.getNominalPosition().y).toBeCloseTo(20, 1);
      expect(harness.getNominalPosition().z).toBeCloseTo(5, 1);

      // Extrude still locked
      expect(harness.extrude(5)).toBe(false);
    });

    it('P5-3: heating hotend to 200°C unlocks manual extrude jog and updates filament consumption', () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const success = harness.extrude(10);
      expect(success).toBe(true);
      expect(harness.getNominalPosition().e).toBeCloseTo(10, 1);
    });
  });

  // =========================================================================
  // 6. Emergency Stop (M112) During Active Print Execution
  // =========================================================================
  describe('Pairwise 6: M112 Emergency Stop During Active Print Execution', () => {
    it('P6-1: M112 halts active print, zeros heater targets, sets fan to 100%, and disables steppers', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(200);
      harness.setBedTarget(60);

      const gcode = ['G1 X100 Y100 F600'].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.advanceTime(1.0);
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);

      // Send Emergency Stop
      harness.sendCommand('M112');

      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);
      expect(harness.getState().status).toBe('HALTED');
      expect(harness.getHotendTemp().target).toBe(0);
      expect(harness.getBedTemp().target).toBe(0);
      expect(harness.thermal.getFanSpeed()).toBe(1.0);
      expect(harness.executor.getKinematics().getState().steppersEnabled).toBe(false);
    });

    it('P6-2: motion and jog commands are rejected while halted after M112', () => {
      harness.emergencyStop('Emergency Test');
      expect(harness.getState().status).toBe('HALTED');

      // Attempt jog
      harness.jog('X', 10);
      // Target remains unchanged because system is halted
      expect(harness.getNominalPosition().x).toBe(0);
    });

    it('P6-3: resetFaults clears emergency halt, permits homing, and restores IDLE state', () => {
      harness.emergencyStop('Emergency Test');
      expect(harness.getState().status).toBe('HALTED');

      harness.resetFaults();
      expect(harness.getState().status).toBe('IDLE');
      expect(harness.executor.getState()).toBe(ExecutionState.IDLE);

      // Can now home axes
      harness.home();
      expect(harness.isHomed()).toEqual({ x: true, y: true, z: true });
    });
  });

  // =========================================================================
  // 7. GCodeTerminal Commands Sent During Active Print
  // =========================================================================
  describe('Pairwise 7: GCodeTerminal Command Injection During Active Print', () => {
    it('P7-1: terminal M104/M140 commands adjust temperature setpoints on-the-fly without pausing print', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = ['G1 X100 F600'].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.advanceTime(1.0);

      // On-the-fly temperature change
      harness.sendCommand('M104 S215');
      harness.sendCommand('M140 S65');

      expect(harness.getHotendTemp().target).toBe(215);
      expect(harness.getBedTemp().target).toBe(65);
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
    });

    it('P7-2: terminal M106 adjusts part cooling fan dynamically during print moves', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = ['G1 X100 F600'].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.advanceTime(1.0);

      harness.sendCommand('M106 S128'); // ~50% fan
      expect(harness.thermal.getFanSpeed()).toBeCloseTo(0.5, 1);
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
    });

    it('P7-3: terminal M220 dynamically adjusts speed override factor during active print', async () => {
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);

      const gcode = ['G1 X100 F600'].join('\n');
      await harness.loadGCode(gcode);
      harness.startPrint();
      harness.advanceTime(1.0);

      harness.sendCommand('M220 S200'); // 200% speed override
      expect(harness.executor.getKinematics().getState().speedOverride).toBe(200);
      expect(harness.getLastTerminalLine()).toBe('ok');
    });
  });

  // =========================================================================
  // 8. Layer Scrubber Filtering & Viewport State During Print
  // =========================================================================
  describe('Pairwise 8: Layer Scrubber Filtering & Viewport State', () => {
    it('P8-1: layer scrubber restricts visible draw range without altering active layer tracking', () => {
      // Simulate adding segments across 3 layers
      harness.toolpaths.appendSegment({
        startX: 0, startY: 0, startZ: 0.2,
        endX: 10, endY: 10, endZ: 0.2,
        extrusionLength: 1.0, feedrate: 1200,
        type: ToolpathType.WALL_OUTER, layerIndex: 0, commandIndex: 1,
      });
      harness.toolpaths.appendSegment({
        startX: 10, startY: 10, startZ: 0.4,
        endX: 20, endY: 20, endZ: 0.4,
        extrusionLength: 1.0, feedrate: 1200,
        type: ToolpathType.WALL_OUTER, layerIndex: 1, commandIndex: 2,
      });
      harness.toolpaths.appendSegment({
        startX: 20, startY: 20, startZ: 0.6,
        endX: 30, endY: 30, endZ: 0.6,
        extrusionLength: 1.0, feedrate: 1200,
        type: ToolpathType.WALL_OUTER, layerIndex: 2, commandIndex: 3,
      });

      expect(harness.getToolpathCount()).toBe(3);

      // Filter to only layer 0: 1 segment * 2 vertices = 2 draw count
      harness.setLayerFilter(0, 0);
      expect(harness.toolpaths.getActiveDrawCount()).toBe(2);

      // Filter to layers 0 through 1: 2 segments * 2 vertices = 4 draw count
      harness.setLayerFilter(0, 1);
      expect(harness.toolpaths.getActiveDrawCount()).toBe(4);

      // Restore all layers: 3 segments * 2 vertices = 6 draw count
      harness.setLayerFilter(0, 100);
      expect(harness.toolpaths.getActiveDrawCount()).toBe(6);
    });

    it('P8-2: layer scrubbing does not delete underlying segment geometry buffer', () => {
      harness.toolpaths.appendSegment({
        startX: 0, startY: 0, startZ: 0.2,
        endX: 10, endY: 10, endZ: 0.2,
        extrusionLength: 1.0, feedrate: 1200,
        type: ToolpathType.WALL_OUTER, layerIndex: 0, commandIndex: 1,
      });

      harness.setLayerFilter(5, 10); // Hidden range
      expect(harness.toolpaths.getActiveDrawCount()).toBe(0);
      expect(harness.getToolpathCount()).toBe(1); // Geometry preserved

      harness.setLayerFilter(0, 1);
      expect(harness.toolpaths.getActiveDrawCount()).toBe(2);
    });

    it('P8-3: layer scrubber bounds clamp properly with volumetric render mode', () => {
      harness.setRenderMode('volumetric');
      harness.toolpaths.appendSegment({
        startX: 0, startY: 0, startZ: 0.2,
        endX: 10, endY: 10, endZ: 0.2,
        extrusionLength: 1.0, feedrate: 1200,
        type: ToolpathType.WALL_OUTER, layerIndex: 0, commandIndex: 1,
      });

      expect(harness.getVolumetricInstanceCount()).toBe(1);
      harness.setLayerFilter(0, 0);
      expect(harness.getVolumetricInstanceCount()).toBe(1);
    });
  });
});
