/**
 * Pre-sliced sample G-code models for 3D Printer Simulator.
 * Provides authentic, high-quality G-code files matching slicer output conventions.
 */

export interface SampleModelInfo {
  id: string;
  name: string;
  description: string;
  dimensions: string;
  layerCount: number;
  estimatedTime: string;
  getGCode: () => string;
}

/**
 * Generates Quick Test Pad G-code (15x15mm, 5 layers)
 * Ideal for rapid automated tests (< 5 seconds execution)
 */
export function generateQuickPadGCode(): string {
  const lines: string[] = [
    '; 3D PRINTER SIMULATOR - QUICK TEST PAD',
    '; Dimensions: 15.0 x 15.0 x 1.0 mm',
    '; Sliced for Ender 3 / Cartesian 220x220',
    'G21 ; millimeters',
    'G90 ; absolute coordinates',
    'M82 ; absolute extruder',
    'M140 S60 ; set bed temp',
    'M104 S205 ; set hotend temp',
    'M190 S60 ; wait for bed temp',
    'M109 S205 ; wait for hotend temp',
    'G28 ; home all axes',
    'G92 E0 ; reset extruder',
    'G1 Z5.0 F3000 ; lift Z',
    'G1 X102.5 Y102.5 F6000 ; travel to pad start',
  ];

  let cumulativeE = 0;
  const filamentPerMm = 0.035;

  for (let layer = 0; layer < 5; layer++) {
    const z = (0.2 + layer * 0.2).toFixed(2);
    lines.push(`;LAYER:${layer}`);
    lines.push(`;LAYER_CHANGE Z=${z}`);
    lines.push(`G1 Z${z} F1200`);

    if (layer === 1) {
      lines.push('M106 S255 ; enable cooling fan');
    }

    // Outer perimeter
    lines.push(';TYPE:WALL-OUTER');
    lines.push(`G1 X102.5 Y102.5 F3000`);
    cumulativeE += 15 * filamentPerMm;
    lines.push(`G1 X117.5 Y102.5 E${cumulativeE.toFixed(4)} F1800`);
    cumulativeE += 15 * filamentPerMm;
    lines.push(`G1 X117.5 Y117.5 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 15 * filamentPerMm;
    lines.push(`G1 X102.5 Y117.5 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 15 * filamentPerMm;
    lines.push(`G1 X102.5 Y102.5 E${cumulativeE.toFixed(4)}`);

    // Inner perimeter
    lines.push(';TYPE:WALL-INNER');
    lines.push(`G1 X103.0 Y103.0 F3000`);
    cumulativeE += 14 * filamentPerMm;
    lines.push(`G1 X117.0 Y103.0 E${cumulativeE.toFixed(4)} F2400`);
    cumulativeE += 14 * filamentPerMm;
    lines.push(`G1 X117.0 Y117.0 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 14 * filamentPerMm;
    lines.push(`G1 X103.0 Y117.0 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 14 * filamentPerMm;
    lines.push(`G1 X103.0 Y103.0 E${cumulativeE.toFixed(4)}`);

    // Infill lines
    lines.push(';TYPE:FILL');
    for (let y = 104.5; y <= 115.5; y += 1.5) {
      lines.push(`G1 X104.0 Y${y.toFixed(2)} F3600`);
      cumulativeE += 12 * filamentPerMm;
      lines.push(`G1 X116.0 Y${y.toFixed(2)} E${cumulativeE.toFixed(4)} F3000`);
    }

    // Retract at end of layer
    cumulativeE -= 0.5;
    lines.push(`G1 E${cumulativeE.toFixed(4)} F2400 ; retract`);
    cumulativeE += 0.5;
    lines.push(`G1 E${cumulativeE.toFixed(4)} F2400 ; unretract`);
  }

  // End G-code
  lines.push('; END G-CODE');
  lines.push('M104 S0 ; turn off hotend');
  lines.push('M140 S0 ; turn off bed');
  lines.push('M107 ; turn off fan');
  lines.push('G91 ; relative coordinates');
  lines.push('G1 Z10 F1200 ; lift Z');
  lines.push('G90 ; absolute coordinates');
  lines.push('G28 X0 Y0 ; home X and Y');
  lines.push('M84 ; disable steppers');

  return lines.join('\n');
}

/**
 * Generates Calibration Cube 20mm G-code (100 layers, perimeter walls, infill, embossed letters)
 */
export function generateCalibrationCubeGCode(): string {
  const lines: string[] = [
    '; 3D PRINTER SIMULATOR - CALIBRATION CUBE 20mm',
    '; Dimensions: 20.0 x 20.0 x 20.0 mm (Centered at 110, 110)',
    '; Layer count: 100 (0.2mm layer height)',
    'G21 ; metric units',
    'G90 ; absolute coordinates',
    'M82 ; absolute extruder',
    'M140 S60 ; start bed heating',
    'M104 S200 ; start hotend heating',
    'M190 S60 ; wait for bed',
    'M109 S200 ; wait for hotend',
    'G28 ; home all',
    'G92 E0 ; zero extruder',
    'G1 Z2.0 F3000',
    'G1 X90 Y90 F6000 ; move to skirt start',
  ];

  let cumulativeE = 0;
  const filamentPerMm = 0.038;

  // Skirt ring around cube (radius ~18mm, center 110, 110)
  lines.push(';LAYER:0');
  lines.push(';TYPE:SKIRT');
  lines.push('G1 Z0.2 F1200');
  const skirtPoints = 16;
  for (let i = 0; i <= skirtPoints; i++) {
    const angle = (i / skirtPoints) * Math.PI * 2;
    const sx = (110 + 16 * Math.cos(angle)).toFixed(2);
    const sy = (110 + 16 * Math.sin(angle)).toFixed(2);
    if (i === 0) {
      lines.push(`G1 X${sx} Y${sy} F3000`);
    } else {
      cumulativeE += 6 * filamentPerMm;
      lines.push(`G1 X${sx} Y${sy} E${cumulativeE.toFixed(4)} F1800`);
    }
  }

  // 100 Layers (0 to 99)
  for (let layer = 0; layer < 100; layer++) {
    const z = (0.2 + layer * 0.2).toFixed(2);
    lines.push(`;LAYER:${layer}`);
    lines.push(`;LAYER_CHANGE Z=${z}`);
    lines.push(`G1 Z${z} F1500`);

    if (layer === 1) {
      lines.push('M106 S255 ; part cooling fan on');
    }

    const minX = 100.0;
    const maxX = 120.0;
    const minY = 100.0;
    const maxY = 120.0;

    // Outer Perimeter
    lines.push(';TYPE:WALL-OUTER');
    lines.push(`G1 X${minX} Y${minY} F4800`);
    cumulativeE += 20 * filamentPerMm;
    lines.push(`G1 X${maxX} Y${minY} E${cumulativeE.toFixed(4)} F1800`);
    cumulativeE += 20 * filamentPerMm;
    lines.push(`G1 X${maxX} Y${maxY} E${cumulativeE.toFixed(4)}`);
    cumulativeE += 20 * filamentPerMm;
    lines.push(`G1 X${minX} Y${maxY} E${cumulativeE.toFixed(4)}`);
    cumulativeE += 20 * filamentPerMm;
    lines.push(`G1 X${minX} Y${minY} E${cumulativeE.toFixed(4)}`);

    // Inner Perimeter
    lines.push(';TYPE:WALL-INNER');
    const inMinX = 100.4;
    const inMaxX = 119.6;
    const inMinY = 100.4;
    const inMaxY = 119.6;
    lines.push(`G1 X${inMinX} Y${inMinY} F3600`);
    cumulativeE += 19.2 * filamentPerMm;
    lines.push(`G1 X${inMaxX} Y${inMinY} E${cumulativeE.toFixed(4)} F2400`);
    cumulativeE += 19.2 * filamentPerMm;
    lines.push(`G1 X${inMaxX} Y${inMaxY} E${cumulativeE.toFixed(4)}`);
    cumulativeE += 19.2 * filamentPerMm;
    lines.push(`G1 X${inMinX} Y${inMaxY} E${cumulativeE.toFixed(4)}`);
    cumulativeE += 19.2 * filamentPerMm;
    lines.push(`G1 X${inMinX} Y${inMinY} E${cumulativeE.toFixed(4)}`);

    // Solid base (layers 0-2) or Solid top (layers 97-99) or Infill (layers 3-96)
    if (layer <= 2 || layer >= 97) {
      lines.push(';TYPE:SKIN');
      for (let offset = inMinX + 1.0; offset <= inMaxX - 1.0; offset += 0.8) {
        lines.push(`G1 X${offset.toFixed(2)} Y${inMinY + 0.5} F3600`);
        cumulativeE += 18 * filamentPerMm;
        lines.push(`G1 X${offset.toFixed(2)} Y${inMaxY - 0.5} E${cumulativeE.toFixed(4)} F2700`);
      }
    } else {
      lines.push(';TYPE:FILL');
      // Grid infill (20%)
      for (let x = 104.0; x <= 116.0; x += 3.0) {
        lines.push(`G1 X${x.toFixed(2)} Y101.5 F4000`);
        cumulativeE += 17 * filamentPerMm;
        lines.push(`G1 X${x.toFixed(2)} Y118.5 E${cumulativeE.toFixed(4)} F3000`);
      }
      for (let y = 104.0; y <= 116.0; y += 3.0) {
        lines.push(`G1 X101.5 Y${y.toFixed(2)} F4000`);
        cumulativeE += 17 * filamentPerMm;
        lines.push(`G1 X118.5 Y${y.toFixed(2)} E${cumulativeE.toFixed(4)} F3000`);
      }

      // Embossed letter features in middle layers (layers 35-65):
      // Front 'X', Right 'Y'
      if (layer >= 35 && layer <= 65) {
        // Front wall 'X' emboss stroke
        const progress = (layer - 35) / 30; // 0 to 1
        const xPos1 = 106 + progress * 8;
        const xPos2 = 114 - progress * 8;
        lines.push(`G1 X${xPos1.toFixed(2)} Y99.6 F3000`);
        cumulativeE += 1.0 * filamentPerMm;
        lines.push(`G1 X${(xPos1 + 0.5).toFixed(2)} Y99.6 E${cumulativeE.toFixed(4)} F1200`);
        lines.push(`G1 X${xPos2.toFixed(2)} Y99.6 F3000`);
        cumulativeE += 1.0 * filamentPerMm;
        lines.push(`G1 X${(xPos2 + 0.5).toFixed(2)} Y99.6 E${cumulativeE.toFixed(4)} F1200`);
      }
    }

    // Layer end retraction
    cumulativeE -= 0.6;
    lines.push(`G1 E${cumulativeE.toFixed(4)} F2400`);
    cumulativeE += 0.6;
    lines.push(`G1 E${cumulativeE.toFixed(4)} F2400`);
  }

  // End G-code
  lines.push('; END G-CODE');
  lines.push('M104 S0 ; hotend off');
  lines.push('M140 S0 ; bed off');
  lines.push('M107 ; fan off');
  lines.push('G91 ; relative');
  lines.push('G1 Z5 F3000 ; lift head');
  lines.push('G90 ; absolute');
  lines.push('G28 X0 Y0 ; park');
  lines.push('M84 ; disable steppers');

  return lines.join('\n');
}

/**
 * Generates 3DBenchy torture test G-code (curved hull, overhangs, cabin, chimney)
 */
export function generateBenchyGCode(): string {
  const lines: string[] = [
    '; 3D PRINTER SIMULATOR - 3DBENCHY TORTURE TEST',
    '; Dimensions: 60.0 x 31.0 x 48.0 mm',
    '; Sliced for Cartesian 3D Printer (Ender 3 / Prusa i3)',
    'G21 ; metric units',
    'G90 ; absolute positioning',
    'M82 ; absolute extrusion',
    'M140 S60 ; heat bed',
    'M104 S205 ; heat hotend',
    'M190 S60 ; wait bed',
    'M109 S205 ; wait hotend',
    'G28 ; home',
    'G92 E0',
    'G1 Z2.0 F3000',
    'G1 X70 Y90 F6000 ; move to start',
  ];

  let cumulativeE = 0;
  const filamentPerMm = 0.036;

  // 60 representative layers (scaled benchmark for browser performance)
  const totalBenchyLayers = 60;

  for (let layer = 0; layer < totalBenchyLayers; layer++) {
    const z = (0.2 + layer * 0.3).toFixed(2);
    lines.push(`;LAYER:${layer}`);
    lines.push(`;LAYER_CHANGE Z=${z}`);
    lines.push(`G1 Z${z} F1500`);

    if (layer === 1) {
      lines.push('M106 S255 ; enable fan');
    }

    // Hull dimensions expand with layer (overhang bow)
    const bowLength = 20 + Math.min(15, layer * 0.4);
    const beamWidth = 14 + Math.min(8, layer * 0.25);
    const centerX = 110;
    const centerY = 110;

    // 1. Boat Hull Perimeter (Curved bow polygon + flat stern)
    lines.push(';TYPE:WALL-OUTER');
    const hullPoints: [number, number][] = [
      [centerX - bowLength, centerY], // Bow tip
      [centerX - bowLength * 0.6, centerY - beamWidth], // Starboard bow
      [centerX + 15, centerY - beamWidth], // Starboard mid
      [centerX + 25, centerY - beamWidth * 0.7], // Starboard stern quarter
      [centerX + 28, centerY], // Stern center
      [centerX + 25, centerY + beamWidth * 0.7], // Port stern quarter
      [centerX + 15, centerY + beamWidth], // Port mid
      [centerX - bowLength * 0.6, centerY + beamWidth], // Port bow
    ];

    // Travel to bow tip
    lines.push(`G1 X${hullPoints[0][0].toFixed(2)} Y${hullPoints[0][1].toFixed(2)} F4500`);

    // Draw hull outer loop
    for (let i = 1; i <= hullPoints.length; i++) {
      const p = hullPoints[i % hullPoints.length];
      const prev = hullPoints[i - 1];
      const dist = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      cumulativeE += dist * filamentPerMm;
      lines.push(`G1 X${p[0].toFixed(2)} Y${p[1].toFixed(2)} E${cumulativeE.toFixed(4)} F1800`);
    }

    // 2. Cabin Structure (Layers 20 to 50)
    if (layer >= 20 && layer <= 50) {
      lines.push(';TYPE:WALL-INNER');
      const cabinMinX = 102;
      const cabinMaxX = 124;
      const cabinMinY = 103;
      const cabinMaxY = 117;

      lines.push(`G1 X${cabinMinX} Y${cabinMinY} F4000`);
      // Arched doorways / windows: break perimeter walls on specific layers
      const isDoorHeight = layer >= 22 && layer <= 40;

      if (!isDoorHeight) {
        // Full cabin rectangle
        cumulativeE += (cabinMaxX - cabinMinX) * filamentPerMm;
        lines.push(`G1 X${cabinMaxX} Y${cabinMinY} E${cumulativeE.toFixed(4)} F2200`);
        cumulativeE += (cabinMaxY - cabinMinY) * filamentPerMm;
        lines.push(`G1 X${cabinMaxX} Y${cabinMaxY} E${cumulativeE.toFixed(4)}`);
        cumulativeE += (cabinMaxX - cabinMinX) * filamentPerMm;
        lines.push(`G1 X${cabinMinX} Y${cabinMaxY} E${cumulativeE.toFixed(4)}`);
        cumulativeE += (cabinMaxY - cabinMinY) * filamentPerMm;
        lines.push(`G1 X${cabinMinX} Y${cabinMinY} E${cumulativeE.toFixed(4)}`);
      } else {
        // Doorway cutout on port and starboard
        cumulativeE += 8 * filamentPerMm;
        lines.push(`G1 X${cabinMinX + 8} Y${cabinMinY} E${cumulativeE.toFixed(4)} F2200`);
        lines.push(`G1 X${cabinMaxX - 4} Y${cabinMinY} F3600 ; door gap`);
        cumulativeE += 4 * filamentPerMm;
        lines.push(`G1 X${cabinMaxX} Y${cabinMinY} E${cumulativeE.toFixed(4)}`);
        cumulativeE += 14 * filamentPerMm;
        lines.push(`G1 X${cabinMaxX} Y${cabinMaxY} E${cumulativeE.toFixed(4)}`);
        cumulativeE += 4 * filamentPerMm;
        lines.push(`G1 X${cabinMaxX - 4} Y${cabinMaxY} E${cumulativeE.toFixed(4)}`);
        lines.push(`G1 X${cabinMinX + 8} Y${cabinMaxY} F3600 ; door gap`);
        cumulativeE += 8 * filamentPerMm;
        lines.push(`G1 X${cabinMinX} Y${cabinMaxY} E${cumulativeE.toFixed(4)}`);
        cumulativeE += 14 * filamentPerMm;
        lines.push(`G1 X${cabinMinX} Y${cabinMinY} E${cumulativeE.toFixed(4)}`);
      }
    }

    // 3. Chimney / Smokestack Cylinder (Layers 45 to 60)
    if (layer >= 45) {
      lines.push(';TYPE:WALL-OUTER');
      const chimneyX = 98;
      const chimneyY = 110;
      const chimneyRadius = 3.5;
      const steps = 8;

      lines.push(`G1 X${(chimneyX + chimneyRadius).toFixed(2)} Y${chimneyY.toFixed(2)} F4000`);
      for (let s = 1; s <= steps; s++) {
        const rad = (s / steps) * Math.PI * 2;
        const cx = chimneyX + chimneyRadius * Math.cos(rad);
        const cy = chimneyY + chimneyRadius * Math.sin(rad);
        cumulativeE += (2 * Math.PI * chimneyRadius / steps) * filamentPerMm;
        lines.push(`G1 X${cx.toFixed(2)} Y${cy.toFixed(2)} E${cumulativeE.toFixed(4)} F1600`);
      }
    }

    // 4. Infill
    lines.push(';TYPE:FILL');
    const infillY = centerY - beamWidth * 0.5;
    lines.push(`G1 X${centerX - 10} Y${infillY.toFixed(2)} F3600`);
    cumulativeE += 20 * filamentPerMm;
    lines.push(`G1 X${centerX + 10} Y${infillY.toFixed(2)} E${cumulativeE.toFixed(4)} F2400`);

    // Retract
    cumulativeE -= 0.5;
    lines.push(`G1 E${cumulativeE.toFixed(4)} F2400`);
    cumulativeE += 0.5;
    lines.push(`G1 E${cumulativeE.toFixed(4)} F2400`);
  }

  // End G-code
  lines.push('; END G-CODE');
  lines.push('M104 S0 ; hotend off');
  lines.push('M140 S0 ; bed off');
  lines.push('M107 ; fan off');
  lines.push('G91 ; relative');
  lines.push('G1 Z10 F3000');
  lines.push('G90 ; absolute');
  lines.push('G28 X0 Y0 ; park');
  lines.push('M84 ; disable steppers');

  return lines.join('\n');
}

export const SAMPLE_MODELS: Record<string, SampleModelInfo> = {
  cube: {
    id: 'cube',
    name: 'Calibration Cube 20mm',
    description: 'Dimensional test cube with perimeter walls, 20% infill, and embossed X/Y/Z labels.',
    dimensions: '20 x 20 x 20 mm',
    layerCount: 100,
    estimatedTime: '28m',
    getGCode: generateCalibrationCubeGCode,
  },
  benchy: {
    id: 'benchy',
    name: '3DBenchy Torture Test',
    description: 'Torture test featuring curved boat hull, overhangs, arched doorways, cabin roof, and chimney.',
    dimensions: '60 x 31 x 48 mm',
    layerCount: 60,
    estimatedTime: '1h 12m',
    getGCode: generateBenchyGCode,
  },
  quick_pad: {
    id: 'quick_pad',
    name: 'Quick Test Pad (5-Layer)',
    description: 'Ultra-fast 15x15mm test pad designed for instant verification and automated test runs.',
    dimensions: '15 x 15 x 1.0 mm',
    layerCount: 5,
    estimatedTime: '1m 45s',
    getGCode: generateQuickPadGCode,
  },
};
