import { describe, it, expect, beforeEach } from 'vitest';
import { GCodeParser } from '../../core/gcode/GCodeParser';
import { ToolpathType } from '../../core/kinematics/types';
import { generateQuickPadGCode, generateCalibrationCubeGCode, generateBenchyGCode } from '../../core/gcode/sampleModels';

describe('GCodeParser Unit Tests', () => {
  let parser: GCodeParser;

  beforeEach(() => {
    parser = new GCodeParser();
  });

  // TC-01: Parameter Extraction
  it('TC-01: should parse standard G1 line and extract all numeric parameters', () => {
    const line = 'G1 X10.5 Y-20.25 Z0.2 E0.045 F3000';
    const parsed = parser.parseLine(line);

    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('G1');
    expect(parsed?.parameters.X).toBeCloseTo(10.5);
    expect(parsed?.parameters.Y).toBeCloseTo(-20.25);
    expect(parsed?.parameters.Z).toBeCloseTo(0.2);
    expect(parsed?.parameters.E).toBeCloseTo(0.045);
    expect(parsed?.parameters.F).toBe(3000);
    expect(parsed?.isExtruding).toBe(true);
    expect(parsed?.isTravel).toBe(false);
  });

  // TC-02: Whitespace & Cases & Comments
  it('TC-02: should handle lowercase, spaces between parameters, and strip comments', () => {
    const line = 'g1 x 12.0 y 5.5 f 1500 ; inline comment';
    const parsed = parser.parseLine(line);

    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('G1');
    expect(parsed?.parameters.X).toBe(12.0);
    expect(parsed?.parameters.Y).toBe(5.5);
    expect(parsed?.parameters.F).toBe(1500);
    expect(parsed?.comment).toBe('inline comment');
  });

  // TC-03: Line Numbers & Checksum Stripping
  it('TC-03: should strip line numbers N<int> and checksums *<int>', () => {
    const line = 'N42 G28 X0*99';
    const parsed = parser.parseLine(line);

    expect(parsed).not.toBeNull();
    expect(parsed?.lineNumber).toBe(42);
    expect(parsed?.command).toBe('G28');
    expect(parsed?.parameters.X).toBe(0);
  });

  // TC-04: Modal Coordinates Tracking
  it('TC-04: should maintain modal coordinates and feedrate across sequential moves', () => {
    const line1 = parser.parseLine('G1 X10 Y10 F3000');
    expect(line1?.parameters.X).toBe(10);
    expect(line1?.parameters.Y).toBe(10);

    const line2 = parser.parseLine('G1 X20');
    expect(line2?.parameters.X).toBe(20);
    expect(line2?.parameters.Y).toBeUndefined(); // modal Y retained internally
    expect(line2?.parameters.F).toBeUndefined(); // modal F retained internally
  });

  // TC-05: Absolute Extruder Reset (G92 E0)
  it('TC-05: should correctly handle G92 E0 resets in absolute extrusion mode', () => {
    // Start absolute mode
    parser.parseLine('M82');
    parser.parseLine('G1 E100 F1800');

    // Reset extruder position
    const g92 = parser.parseLine('G92 E0');
    expect(g92?.command).toBe('G92');
    expect(g92?.parameters.E).toBe(0);

    // Subsequent move from 0 to 1.0
    const moveAfterReset = parser.parseLine('G1 E1.0 F1800');
    expect(moveAfterReset?.isExtruding).toBe(true);
    expect(moveAfterReset?.isRetracting).toBe(false);
  });

  // TC-06: Relative Extruder Mode (M83)
  it('TC-06: should treat E as relative displacement in M83 mode', () => {
    parser.parseLine('M83');
    const move1 = parser.parseLine('G1 E1.0 F1800');
    expect(move1?.isExtruding).toBe(true);

    const move2 = parser.parseLine('G1 E1.0 F1800');
    expect(move2?.isExtruding).toBe(true);

    const retract = parser.parseLine('G1 E-0.5 F2400');
    expect(retract?.isRetracting).toBe(true);
    expect(retract?.isExtruding).toBe(false);
  });

  it('should parse parenthetical comments (RS274/NGC style)', () => {
    const line = '(Initial Height) G1 Z0.2 (Clearance)';
    const parsed = parser.parseLine(line);

    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('G1');
    expect(parsed?.parameters.Z).toBe(0.2);
    expect(parsed?.comment).toContain('Initial Height');
    expect(parsed?.comment).toContain('Clearance');
  });

  it('should return null for empty, whitespace, or comment-only lines', () => {
    expect(parser.parseLine('')).toBeNull();
    expect(parser.parseLine('   ')).toBeNull();
    expect(parser.parseLine('; only a comment')).toBeNull();
    expect(parser.parseLine('// double slash comment')).toBeNull();
  });

  it('should parse M117 LCD messages with text payloads', () => {
    const line = 'M117 Printing Layer 1 of 100';
    const parsed = parser.parseLine(line);

    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe('M117');
    expect(parsed?.stringParameter).toBe('Printing Layer 1 of 100');
  });

  it('should classify toolpath types based on slicer comments', () => {
    parser.parseLine(';TYPE:WALL-OUTER');
    expect(parser.getCurrentToolpathType()).toBe(ToolpathType.WALL_OUTER);

    parser.parseLine(';TYPE:WALL-INNER');
    expect(parser.getCurrentToolpathType()).toBe(ToolpathType.WALL_INNER);

    parser.parseLine(';TYPE:FILL');
    expect(parser.getCurrentToolpathType()).toBe(ToolpathType.INFILL);

    parser.parseLine(';TYPE:SKIN');
    expect(parser.getCurrentToolpathType()).toBe(ToolpathType.SOLID_SURFACE);

    parser.parseLine(';TYPE:SUPPORT');
    expect(parser.getCurrentToolpathType()).toBe(ToolpathType.SUPPORT);

    parser.parseLine(';TYPE:SKIRT');
    expect(parser.getCurrentToolpathType()).toBe(ToolpathType.SKIRT_BRIM);
  });

  it('should parse full Quick Test Pad document and generate accurate summary metrics', () => {
    const gcode = generateQuickPadGCode();
    const { parsedLines, summary } = parser.parseDocument(gcode, 'quick_pad.gcode');

    expect(parsedLines.length).toBeGreaterThan(40);
    expect(summary.totalLayers).toBe(5);
    expect(summary.totalFilamentMm).toBeGreaterThan(5);
    expect(summary.totalFilamentGrams).toBeGreaterThan(0.01);
    expect(summary.boundingBox.minX).toBeCloseTo(102.5, 0);
    expect(summary.boundingBox.maxX).toBeCloseTo(117.5, 0);
    expect(summary.boundingBox.minY).toBeCloseTo(102.5, 0);
    expect(summary.boundingBox.maxY).toBeCloseTo(117.5, 0);
    expect(summary.boundingBox.minZ).toBeGreaterThanOrEqual(0.2);
    expect(summary.estimatedPrintTimeSeconds).toBeGreaterThan(0);
  });

  it('should parse Calibration Cube document with 100 layers and 20x20mm bounds', () => {
    const gcode = generateCalibrationCubeGCode();
    const { parsedLines, summary } = parser.parseDocument(gcode, 'calibration_cube.gcode');

    expect(parsedLines.length).toBeGreaterThan(1000);
    expect(summary.totalLayers).toBe(100);
    expect(summary.boundingBox.minX).toBeLessThanOrEqual(100);
    expect(summary.boundingBox.maxX).toBeGreaterThanOrEqual(120);
    expect(summary.boundingBox.minY).toBeLessThanOrEqual(100);
    expect(summary.boundingBox.maxY).toBeGreaterThanOrEqual(120);
    expect(summary.totalFilamentMm).toBeGreaterThan(100);
  });

  it('should parse 3DBenchy document with multiple layers and hull dimensions', () => {
    const gcode = generateBenchyGCode();
    const { parsedLines, summary } = parser.parseDocument(gcode, '3d_benchy.gcode');

    expect(parsedLines.length).toBeGreaterThan(500);
    expect(summary.totalLayers).toBe(60);
    expect(summary.totalFilamentMm).toBeGreaterThan(50);
  });

  it('should attach layerIndex to parsed lines advancing from 0 to totalLayers - 1', () => {
    const gcode = generateQuickPadGCode();
    const { parsedLines, summary } = parser.parseDocument(gcode, 'quick_pad.gcode');

    expect(summary.totalLayers).toBe(5);
    const layersPresent = new Set<number>();
    for (const line of parsedLines) {
      expect(line.layerIndex).toBeDefined();
      expect(typeof line.layerIndex).toBe('number');
      layersPresent.add(line.layerIndex!);
    }

    // Verify all layers 0, 1, 2, 3, 4 are represented
    expect(layersPresent.size).toBe(5);
    for (let l = 0; l < 5; l++) {
      expect(layersPresent.has(l)).toBe(true);
    }
  });

  it('should track layerIndex in fallback mode without explicit ;LAYER comments', () => {
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
    ].join('\n');

    const { parsedLines, summary } = parser.parseDocument(rawGCode, 'fallback.gcode');
    expect(summary.totalLayers).toBe(3);

    const layer0Moves = parsedLines.filter((l) => l.layerIndex === 0);
    const layer1Moves = parsedLines.filter((l) => l.layerIndex === 1);
    const layer2Moves = parsedLines.filter((l) => l.layerIndex === 2);

    expect(layer0Moves.length).toBeGreaterThan(0);
    expect(layer1Moves.length).toBeGreaterThan(0);
    expect(layer2Moves.length).toBeGreaterThan(0);
  });
});
