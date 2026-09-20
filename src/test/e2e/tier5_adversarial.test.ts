import { describe, it, expect, beforeEach } from 'vitest';
import { TestSimulatorHarness } from './harness';
import { ExecutionState } from '../../core/gcode/types';

describe('Tier 5: Adversarial Stress & Robustness Hardening (Adversarial Challenger Suite)', () => {
  let harness: TestSimulatorHarness;

  beforeEach(() => {
    harness = new TestSimulatorHarness({
      thermal: {
        hotendParams: { kHeat: 5.2, kFan: 0.003 },
      },
    });
  });

  // =========================================================================
  // Dimension 1: Extreme Playback Speed Multipliers (100x Sustained)
  // =========================================================================
  describe('Dimension 1: Extreme Playback Speed Multipliers (100x Sustained)', () => {
    it('1.1: sustained 100x speed execution on Quick Pad runs to completion without coordinate drift or NaN', async () => {
      await harness.loadSampleModel('quick_pad');
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);
      harness.home();

      harness.setSpeedMultiplier(100);
      expect(harness.executor.getSpeedMultiplier()).toBe(100);

      harness.startPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);

      // Run until completion with deterministic sub-steps
      const finished = harness.runUntilComplete(120, 0.05);
      expect(finished).toBe(true);
      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);

      // Verify no NaN or Infinity in coordinates
      const finalPos = harness.getNominalPosition();
      expect(Number.isFinite(finalPos.x)).toBe(true);
      expect(Number.isFinite(finalPos.y)).toBe(true);
      expect(Number.isFinite(finalPos.z)).toBe(true);
      expect(Number.isFinite(finalPos.e)).toBe(true);
      expect(finalPos.z).toBeGreaterThan(0);
      expect(finalPos.e).toBeGreaterThan(0);

      // Verify toolpaths were generated and filament was consumed
      expect(harness.getToolpathCount()).toBeGreaterThan(50);
      expect(harness.getState().job.filamentUsedMm).toBeGreaterThan(0);
      expect(harness.getState().job.progressPercent).toBe(100);
      expect(harness.getState().job.currentLayer).toBe(4);
    });

    it('1.2: sustained 100x speed execution on Calibration Cube completes with valid bounded coordinates', async () => {
      const summary = await harness.loadSampleModel('cube');
      expect(summary.totalLayers).toBe(100);
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(200);
      harness.setBedTarget(60);
      harness.home();

      harness.setSpeedMultiplier(100);
      harness.startPrint();

      // Advance through print in simulated chunks (each chunk advances virtual print time)
      let chunks = 0;
      while (harness.executor.getState() === ExecutionState.RUNNING && chunks < 50) {
        harness.advanceTime(2.0, 0.04);
        chunks++;
        const p = harness.getNominalPosition();
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(220);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(220);
        expect(p.z).toBeGreaterThanOrEqual(0);
        expect(p.z).toBeLessThanOrEqual(250);
      }

      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
      expect(harness.getState().job.filamentUsedMm).toBeGreaterThan(100);

      // Verify active layer tracking advanced to completion
      const currentLayer = harness.getState().job.currentLayer;
      expect(currentLayer).toBeGreaterThanOrEqual(summary.totalLayers - 2);
    });

    it('1.3: dynamic speed multiplier shifts (1x -> 100x -> 5x -> 100x -> 20x) mid-print preserve state integrity', async () => {
      await harness.loadSampleModel('quick_pad');
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);
      harness.home();

      harness.startPrint();

      // Step at 1x
      harness.setSpeedMultiplier(1);
      harness.advanceTime(0.5);
      const e1 = harness.getNominalPosition().e;

      // Jump to 100x
      harness.setSpeedMultiplier(100);
      harness.advanceTime(0.5);
      const e2 = harness.getNominalPosition().e;
      expect(e2).toBeGreaterThanOrEqual(e1);

      // Drop to 5x
      harness.setSpeedMultiplier(5);
      harness.advanceTime(0.5);
      const e3 = harness.getNominalPosition().e;
      expect(e3).toBeGreaterThanOrEqual(e2);

      // Jump back to 100x
      harness.setSpeedMultiplier(100);
      harness.advanceTime(0.5);
      const e4 = harness.getNominalPosition().e;
      expect(e4).toBeGreaterThanOrEqual(e3);

      expect([ExecutionState.RUNNING, ExecutionState.COMPLETED]).toContain(harness.executor.getState());
    });

    it('1.4: extreme speed multiplier values are safely clamped between [0.1, 100]', () => {
      harness.setSpeedMultiplier(0.01);
      expect(harness.executor.getSpeedMultiplier()).toBe(0.1);

      harness.setSpeedMultiplier(-50);
      expect(harness.executor.getSpeedMultiplier()).toBe(0.1);

      harness.setSpeedMultiplier(500);
      expect(harness.executor.getSpeedMultiplier()).toBe(100);

      harness.setSpeedMultiplier(1e6);
      expect(harness.executor.getSpeedMultiplier()).toBe(100);

      harness.setSpeedMultiplier(50);
      expect(harness.executor.getSpeedMultiplier()).toBe(50);
    });

    it('1.5: large delta-time lag spikes at 100x do not cause unbounded time budget explosion', async () => {
      await harness.loadSampleModel('quick_pad');
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);
      harness.home();

      harness.setSpeedMultiplier(100);
      harness.startPrint();

      // Inject a massive lag spike of 10 seconds in a single step call
      // The MotionInterpolator clamps timeBudget to 2.0s max to prevent unbounded jump
      harness.advanceTime(10.0, 10.0);

      const pos = harness.getNominalPosition();
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
      expect(pos.x).toBeLessThanOrEqual(220);
      expect(pos.y).toBeLessThanOrEqual(220);
    });
  });

  // =========================================================================
  // Dimension 2: High-Frequency Command Injection into G-Code Terminal
  // =========================================================================
  describe('Dimension 2: High-Frequency Command Injection into G-Code Terminal', () => {
    it('2.1: burst injection of 150 immediate commands does not crash or corrupt terminal log', () => {
      const commands = [
        'M105',
        'M114',
        'G90',
        'G91',
        'M82',
        'M83',
        'M106 S128',
        'M107',
        'M220 S120',
        'M221 S95',
      ];

      for (let i = 0; i < 150; i++) {
        const cmd = commands[i % commands.length];
        const res = harness.sendCommand(cmd);
        expect(res).toBe('ok');
      }

      const lines = harness.getTerminalLines();
      expect(lines.length).toBeGreaterThan(100);
      expect(lines.some((l) => l.includes('M105'))).toBe(true);
      expect(lines.some((l) => l.includes('M114'))).toBe(true);
    });

    it('2.2: terminal buffer enforces circular retention up to MAX_TERMINAL_LOG (500 entries)', () => {
      // Inject 600 commands into terminal
      for (let i = 0; i < 600; i++) {
        harness.sendCommand(`M117 Message ${i}`);
      }

      const log = harness.getState().terminalLog;
      expect(log.length).toBe(500); // capped at MAX_TERMINAL_LOG

      // The earliest messages (0..99) should have been shifted out
      expect(log.some((e) => e.message.includes('Message 0'))).toBe(false);
      // The latest messages should be present
      expect(log.some((e) => e.message.includes('Message 599'))).toBe(true);
    });

    it('2.3: adversarial malformed commands are gracefully handled without unhandled exceptions', () => {
      const malformedInputs = [
        '', // empty
        '   ', // whitespace
        '; comment only',
        '// C++ comment',
        '(bracket comment)',
        'UNKNOWN_COMMAND_XYZ',
        'M99999 S99999',
        'G1 XNaN YInfinity Zundefined',
        'G1 X@#!$ Y%^&*',
        'N12345 G1 X10 Y10 *78', // checksum format
        'G1 X999999 Y-999999 Z999999', // extreme coordinates
      ];

      for (const input of malformedInputs) {
        expect(() => harness.sendCommand(input)).not.toThrow();
      }

      // Coordinates should remain within physical machine limits (0..220, 0..220, 0..250)
      const p = harness.getNominalPosition();
      expect(p.x).toBeLessThanOrEqual(220);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(220);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.z).toBeLessThanOrEqual(250);
      expect(p.z).toBeGreaterThanOrEqual(0);
    });

    it('2.4: concurrent command injection during active print execution does not corrupt job', async () => {
      await harness.loadSampleModel('cube');
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(200);
      harness.setBedTarget(60);
      harness.home();

      harness.setSpeedMultiplier(10);
      harness.startPrint();

      // Interleave command injections while advancing time
      for (let step = 0; step < 10; step++) {
        harness.advanceTime(0.1, 0.02);
        harness.sendCommand('M105');
        harness.sendCommand('M114');
        harness.sendCommand('M220 S110');
        harness.sendCommand('M106 S200');
      }

      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
      expect(harness.getState().partCoolingFanSpeed).toBeCloseTo(200 / 255, 2);
    });

    it('2.5: immediate jog injection while paused updates position without corrupting resumption', async () => {
      await harness.loadSampleModel('quick_pad');
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);
      harness.home();

      harness.startPrint();
      harness.advanceTime(0.5);

      harness.pausePrint();
      expect(harness.executor.getState()).toBe(ExecutionState.PAUSED);

      const beforeJog = harness.getNominalPosition();
      harness.jog('X', 10);
      const afterJog = harness.getNominalPosition();
      expect(afterJog.x).toBeCloseTo(beforeJog.x + 10, 1);

      // Resume print
      harness.resumePrint();
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);
      harness.advanceTime(0.5);
      expect([ExecutionState.RUNNING, ExecutionState.COMPLETED]).toContain(harness.executor.getState());
    });
  });

  // =========================================================================
  // Dimension 3: Multiple Concurrent Failure Modes
  // =========================================================================
  describe('Dimension 3: Multiple Concurrent Failure Modes', () => {
    it('3.1: simultaneous quad-failure injection (Clog + Layer Shift + Filament Runout + Spaghetti) is fully tracked', () => {
      harness.setNozzleClog('FULL');
      harness.triggerLayerShift(15, -10);
      harness.setFilamentRunout(true);
      harness.setSpaghettiMode(true);

      const cfg = harness.failures.getConfig();
      expect(cfg.nozzleClog).toBe('FULL');
      expect(cfg.layerShift).toEqual({ x: 15, y: -10 });
      expect(cfg.filamentRunout).toBe(true);
      expect(cfg.spaghettiMode).toBe(true);

      // Verify telemetry store reflects all 4 failures simultaneously
      const state = harness.getState();
      expect(state.failures.nozzleClog).toBe('FULL');
      expect(state.failures.layerShift).toEqual({ x: 15, y: -10 });
      expect(state.failures.filamentRunout).toBe(true);
      expect(state.failures.spaghettiMode).toBe(true);
    });

    it('3.2: safety priority: Thermal Runaway Watchdog trips HALTED and overrides print pause', async () => {
      await harness.loadSampleModel('quick_pad');
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);
      harness.home();

      harness.startPrint();
      harness.advanceTime(0.2);

      // Trigger open-loop heater failure where heater is full power but temp does not rise
      harness.simulateThermalRunaway('hotend');

      // Advance virtual time past hotendTauWatch (25s) for watchdog to trip
      harness.advanceTime(26.0, 0.05);

      // Thermal Runaway must trip HALTED/ERROR state, cut heater powers to 0, fan 100%
      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);
      expect(harness.getState().status).toBe('HALTED');
      expect(harness.getHotendTemp().power).toBe(0);
      expect(harness.getHotendTemp().target).toBe(0);
      expect(harness.thermal.getFanSpeed()).toBe(1.0);
    });

    it('3.3: partial clog (25% flow) combined with layer shift (+12mm X, +8mm Y) scales extrusion and transforms coordinates', async () => {
      await harness.loadSampleModel('quick_pad');
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);
      harness.home();

      // Inject partial clog + layer shift
      harness.setNozzleClog('PARTIAL');
      harness.triggerLayerShift(12, 8);

      harness.startPrint();
      harness.advanceTime(1.0);

      // Check physical position applies exact offset (+12, +8)
      const nominal = harness.getNominalPosition();
      const physical = harness.getPhysicalPosition();
      expect(physical.x).toBeCloseTo(nominal.x + 12, 1);
      expect(physical.y).toBeCloseTo(nominal.y + 8, 1);

      // Failure bridge extrusion scale is 0.25
      expect(harness.failures.getExtrusionScale()).toBe(0.25);
    });

    it('3.4: single resetFaults() cleanly clears all 5 concurrent failure modes back to IDLE baseline', () => {
      harness.setNozzleClog('FULL');
      harness.triggerLayerShift(20, 20);
      harness.setFilamentRunout(true);
      harness.setSpaghettiMode(true);
      harness.simulateThermalRunaway('hotend');

      expect(harness.failures.getConfig().spaghettiMode).toBe(true);
      expect(harness.failures.getConfig().filamentRunout).toBe(true);

      // Clear all faults
      harness.resetFaults();

      const cfg = harness.failures.getConfig();
      expect(cfg.nozzleClog).toBe('NONE');
      expect(cfg.spaghettiMode).toBe(false);
      expect(cfg.layerShift).toEqual({ x: 0, y: 0 });
      expect(cfg.filamentRunout).toBe(false);
      expect(cfg.thermalRunawaySimulated).toBe(false);
      expect(harness.thermal.isThermalRunaway()).toBe(false);
      expect(harness.getState().status).toBe('IDLE');
    });

    it('3.5: cascading failure sequence executes correctly through lifecycle', async () => {
      await harness.loadSampleModel('quick_pad');
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);
      harness.home();
      harness.startPrint();

      // Phase 1: Clog occurs
      harness.setNozzleClog('FULL');
      harness.advanceTime(0.5);

      // Phase 2: Stepper skip causes layer shift
      harness.triggerLayerShift(10, 5);
      harness.advanceTime(0.5);

      // Phase 3: Filament runout trips -> pauses print
      harness.setFilamentRunout(true);
      harness.advanceTime(0.1);
      expect(harness.executor.getState()).toBe(ExecutionState.PAUSED);

      // Phase 4: Operator reloads filament and resumes
      harness.setFilamentRunout(false);
      harness.setNozzleClog('NONE');
      harness.resumePrint();
      expect(harness.executor.getState()).toBe(ExecutionState.RUNNING);

      // Phase 5: Thermal runaway trips -> emergency halt after watchdog window
      harness.simulateThermalRunaway('hotend');
      harness.advanceTime(26.0, 0.05);
      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);
      expect(harness.getState().status).toBe('HALTED');
    });
  });

  // =========================================================================
  // Dimension 4: Rapid Emergency Stop / Reset / Restart Cycles
  // =========================================================================
  describe('Dimension 4: Rapid Emergency Stop / Reset / Restart Cycles', () => {
    it('4.1: rapid 15-cycle E-Stop and Reset pulses do not deadlock or desynchronize state machine', () => {
      for (let i = 0; i < 15; i++) {
        harness.emergencyStop(`Pulse E-Stop #${i}`);
        expect(harness.executor.getState()).toBe(ExecutionState.ERROR);
        expect(harness.getState().status).toBe('HALTED');
        expect(harness.getHotendTemp().power).toBe(0);

        harness.resetFaults();
        expect(harness.executor.getState()).toBe(ExecutionState.IDLE);
        expect(harness.getState().status).toBe('IDLE');
      }

      // Verify system is fully responsive after pulse loop
      harness.home();
      expect(harness.isHomed()).toEqual({ x: true, y: true, z: true });
    });

    it('4.2: emergency stop during active 100x print instantly cuts power, enables 100% fan, and purges queue', async () => {
      await harness.loadSampleModel('quick_pad');
      harness.thermal.setActualTemperatureDirect('hotend', 210);
      harness.thermal.setActualTemperatureDirect('bed', 65);
      harness.setHotendTarget(210);
      harness.setBedTarget(65);
      harness.home();

      harness.setSpeedMultiplier(100);
      harness.startPrint();
      harness.advanceTime(0.5);

      // Dispatched M112
      harness.sendCommand('M112');

      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);
      expect(harness.getState().status).toBe('HALTED');
      expect(harness.getHotendTemp().target).toBe(0);
      expect(harness.getBedTemp().target).toBe(0);
      expect(harness.getHotendTemp().power).toBe(0);
      expect(harness.getBedTemp().power).toBe(0);
      expect(harness.thermal.getFanSpeed()).toBe(1.0);
      expect(harness.executor.getInterpolator().getQueueLength()).toBe(0);
    });

    it('4.3: motion commands and print start are strictly rejected while halted in ERROR state', () => {
      harness.emergencyStop('Halt test');
      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);

      const posBefore = harness.getNominalPosition();

      // Attempt jog
      harness.jog('X', 20);
      expect(harness.getNominalPosition().x).toBe(posBefore.x);

      // Attempt manual command
      harness.sendCommand('G1 X100 Y100 F3000');
      expect(harness.getNominalPosition().x).toBe(posBefore.x);

      // Attempt print start
      harness.startPrint();
      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);
    });

    it('4.4: clean recovery and full print completion after emergency stop reset', async () => {
      await harness.loadSampleModel('quick_pad');
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);
      harness.home();
      harness.startPrint();
      harness.advanceTime(0.2);

      // E-stop mid-print
      harness.emergencyStop('Operator safety abort');
      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);

      // Reset faults
      harness.resetFaults();
      expect(harness.executor.getState()).toBe(ExecutionState.IDLE);

      // Reheat, home, and reload print
      harness.thermal.setActualTemperatureDirect('hotend', 205);
      harness.thermal.setActualTemperatureDirect('bed', 60);
      harness.setHotendTarget(205);
      harness.setBedTarget(60);
      harness.home();
      await harness.loadSampleModel('quick_pad');
      harness.setSpeedMultiplier(100);
      harness.startPrint();

      const finished = harness.runUntilComplete(60, 0.05);
      expect(finished).toBe(true);
      expect(harness.executor.getState()).toBe(ExecutionState.COMPLETED);
    });

    it('4.5: multiple consecutive emergency stop calls are idempotent and stable', () => {
      harness.emergencyStop('First abort');
      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);

      harness.emergencyStop('Second abort');
      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);

      harness.sendCommand('M112');
      expect(harness.executor.getState()).toBe(ExecutionState.ERROR);

      expect(() => harness.resetFaults()).not.toThrow();
      expect(harness.executor.getState()).toBe(ExecutionState.IDLE);
    });
  });

  // =========================================================================
  // Dimension 5: Cold Extrusion Interlock Enforcement Across All Modalities
  // =========================================================================
  describe('Dimension 5: Cold Extrusion Interlock Enforcement Across All Modalities', () => {
    it('5.1: Modality A (Manual extrude via API): harness.extrude() returns false and logs warning when cold', () => {
      // Hotend starts at ambient (21°C)
      expect(harness.getHotendTemp().actual).toBeLessThan(170);
      expect(harness.canExtrude()).toBe(false);

      const posBefore = harness.getNominalPosition();
      const success = harness.extrude(10);
      expect(success).toBe(false);

      const posAfter = harness.getNominalPosition();
      expect(posAfter.e).toBe(posBefore.e);

      // Warning logged to terminal
      const lastLine = harness.getLastTerminalLine();
      expect(lastLine).toContain('cold extrusion prevented');
    });

    it('5.2: Modality B (Manual jog / terminal injection): G1 E10 command via terminal is blocked when cold', () => {
      expect(harness.getHotendTemp().actual).toBeLessThan(170);

      const posBefore = harness.getNominalPosition();
      harness.sendCommand('G1 E15.0 F300');

      const posAfter = harness.getNominalPosition();
      expect(posAfter.e).toBe(posBefore.e);

      const lines = harness.getTerminalLines();
      expect(lines.some((l) => l.includes('cold extrusion prevented'))).toBe(true);
    });

    it('5.3: Modality C (G-Code file execution without preheat): cold print executes motions but blocks all extrusion and toolpaths', async () => {
      // Custom G-code containing extrusion moves without M104/M109 heating commands
      const coldGCode = [
        'G90',
        'M82',
        'G28',
        'G92 E0',
        'G1 Z0.20 F1500',
        'G1 X100 Y100 F3000',
        'G1 X120 Y100 E2.0 F1200',
        'G1 X120 Y120 E4.0 F1200',
        'G1 X100 Y120 E6.0 F1200',
        'G1 X100 Y100 E8.0 F1200',
      ].join('\n');

      await harness.loadGCode(coldGCode, 'cold_box.gcode');

      // Keep hotend strictly at 21°C (cold)
      harness.thermal.setActualTemperatureDirect('hotend', 21);
      harness.setHotendTarget(0);
      expect(harness.canExtrude()).toBe(false);

      harness.setSpeedMultiplier(10);
      harness.startPrint();

      // Run until completion
      harness.runUntilComplete(20, 0.05);

      // Filament consumed must remain strictly 0
      expect(harness.getState().job.filamentUsedMm).toBe(0);

      // No deposition toolpaths generated
      expect(harness.getToolpathCount()).toBe(0);

      // Terminal logs cold extrusion warnings
      const lines = harness.getTerminalLines();
      expect(lines.some((l) => l.includes('cold extrusion prevented'))).toBe(true);
    });

    it('5.4: boundary precision test at threshold: 169.9°C (blocked) vs 170.0°C (allowed)', () => {
      // Test at 169.9°C
      harness.thermal.setActualTemperatureDirect('hotend', 169.9);
      expect(harness.canExtrude()).toBe(false);
      expect(harness.extrude(5)).toBe(false);

      // Test at 170.0°C
      harness.thermal.setActualTemperatureDirect('hotend', 170.0);
      expect(harness.canExtrude()).toBe(true);
      expect(harness.extrude(5)).toBe(true);
      expect(harness.getNominalPosition().e).toBe(5);
    });

    it('5.5: mid-print temperature collapse blocks subsequent lines from extruding while carriage motions continue', async () => {
      // 120 sequential extrusion moves (exceeding the 50-block lookahead queue)
      const lines = [
        'G90',
        'M83',
        'G28',
        'G92 E0',
        'G1 Z0.20 F1500',
      ];
      for (let i = 0; i < 120; i++) {
        const x = 10 + (i % 20) * 5;
        const y = 10 + Math.floor(i / 20) * 5;
        lines.push(`G1 X${x} Y${y} E1.0 F600`);
      }

      await harness.loadGCode(lines.join('\n'), 'collapse_long.gcode');

      // Start at 200°C (valid printing temperature)
      harness.thermal.setActualTemperatureDirect('hotend', 200);
      harness.setHotendTarget(200);
      harness.home();

      harness.setSpeedMultiplier(1);
      harness.startPrint();

      // Run initial moves while hot: queue fills with 50 blocks
      harness.advanceTime(3.0, 0.05);
      const filamentAtDrop = harness.getState().job.filamentUsedMm;
      expect(filamentAtDrop).toBeGreaterThan(0);

      // Simulate abrupt cooling below 170°C (e.g. 140°C) and cut target to 0
      harness.thermal.setActualTemperatureDirect('hotend', 140);
      harness.setHotendTarget(0);
      expect(harness.canExtrude()).toBe(false);

      // Run to completion
      harness.setSpeedMultiplier(10);
      harness.runUntilComplete(60, 0.05);

      const finalFilament = harness.getState().job.filamentUsedMm;
      const finalToolpaths = harness.getToolpathCount();

      // Out of 120 potential 1mm extrusions:
      // The 50 pre-queued blocks executed, but all subsequent blocks (>50) were blocked by cold lockout
      expect(finalFilament).toBeLessThan(70);
      expect(finalToolpaths).toBeLessThan(70);

      // Warning logged
      const terminalLines = harness.getTerminalLines();
      expect(terminalLines.some((l) => l.includes('cold extrusion prevented'))).toBe(true);
    });

    it('5.6: cold retraction (E < 0) is permitted to allow filament unload/swapping', () => {
      // Hotend cold at 21°C
      expect(harness.getHotendTemp().actual).toBeLessThan(170);

      // First establish E coordinate at 10 via G92 offset
      harness.sendCommand('G92 E10.0');
      expect(harness.getNominalPosition().e).toBe(10);

      // Retract 5mm when cold
      harness.retract(5);
      expect(harness.getNominalPosition().e).toBe(5);
    });
  });
});
