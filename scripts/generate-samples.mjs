import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicSamplesDir = path.resolve(__dirname, '../public/samples');

if (!fs.existsSync(publicSamplesDir)) {
  fs.mkdirSync(publicSamplesDir, { recursive: true });
}

// Quick pad
function generateQuickPad() {
  const lines = [
    '; 3D PRINTER SIMULATOR - QUICK TEST PAD',
    '; Dimensions: 15.0 x 15.0 x 1.0 mm',
    'G21', 'G90', 'M82',
    'M140 S60', 'M104 S205', 'M190 S60', 'M109 S205',
    'G28', 'G92 E0', 'G1 Z5.0 F3000', 'G1 X102.5 Y102.5 F6000'
  ];
  let cumulativeE = 0;
  for (let l = 0; l < 5; l++) {
    const z = (0.2 + l * 0.2).toFixed(2);
    lines.push(`;LAYER:${l}`, `;LAYER_CHANGE Z=${z}`, `G1 Z${z} F1200`);
    if (l === 1) lines.push('M106 S255');
    lines.push(';TYPE:WALL-OUTER');
    lines.push('G1 X102.5 Y102.5 F3000');
    cumulativeE += 0.525; lines.push(`G1 X117.5 Y102.5 E${cumulativeE.toFixed(4)} F1800`);
    cumulativeE += 0.525; lines.push(`G1 X117.5 Y117.5 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 0.525; lines.push(`G1 X102.5 Y117.5 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 0.525; lines.push(`G1 X102.5 Y102.5 E${cumulativeE.toFixed(4)}`);
    lines.push(';TYPE:WALL-INNER');
    lines.push('G1 X103.0 Y103.0 F3000');
    cumulativeE += 0.49; lines.push(`G1 X117.0 Y103.0 E${cumulativeE.toFixed(4)} F2400`);
    cumulativeE += 0.49; lines.push(`G1 X117.0 Y117.0 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 0.49; lines.push(`G1 X103.0 Y117.0 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 0.49; lines.push(`G1 X103.0 Y103.0 E${cumulativeE.toFixed(4)}`);
    lines.push(';TYPE:FILL');
    for (let y = 104.5; y <= 115.5; y += 1.5) {
      lines.push(`G1 X104.0 Y${y.toFixed(2)} F3600`);
      cumulativeE += 0.42;
      lines.push(`G1 X116.0 Y${y.toFixed(2)} E${cumulativeE.toFixed(4)} F3000`);
    }
  }
  lines.push('M104 S0', 'M140 S0', 'M107', 'G91', 'G1 Z10 F1200', 'G90', 'G28 X0 Y0', 'M84');
  return lines.join('\n');
}

// Cube
function generateCalibrationCube() {
  const lines = [
    '; 3D PRINTER SIMULATOR - CALIBRATION CUBE 20mm',
    '; Dimensions: 20.0 x 20.0 x 20.0 mm',
    'G21', 'G90', 'M82',
    'M140 S60', 'M104 S200', 'M190 S60', 'M109 S200',
    'G28', 'G92 E0', 'G1 Z2.0 F3000', 'G1 X90 Y90 F6000'
  ];
  let cumulativeE = 0;
  for (let l = 0; l < 100; l++) {
    const z = (0.2 + l * 0.2).toFixed(2);
    lines.push(`;LAYER:${l}`, `;LAYER_CHANGE Z=${z}`, `G1 Z${z} F1500`);
    if (l === 1) lines.push('M106 S255');
    lines.push(';TYPE:WALL-OUTER');
    lines.push('G1 X100.0 Y100.0 F4800');
    cumulativeE += 0.76; lines.push(`G1 X120.0 Y100.0 E${cumulativeE.toFixed(4)} F1800`);
    cumulativeE += 0.76; lines.push(`G1 X120.0 Y120.0 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 0.76; lines.push(`G1 X100.0 Y120.0 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 0.76; lines.push(`G1 X100.0 Y100.0 E${cumulativeE.toFixed(4)}`);
    lines.push(';TYPE:WALL-INNER');
    lines.push('G1 X100.4 Y100.4 F3600');
    cumulativeE += 0.73; lines.push(`G1 X119.6 Y100.4 E${cumulativeE.toFixed(4)} F2400`);
    cumulativeE += 0.73; lines.push(`G1 X119.6 Y119.6 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 0.73; lines.push(`G1 X100.4 Y119.6 E${cumulativeE.toFixed(4)}`);
    cumulativeE += 0.73; lines.push(`G1 X100.4 Y100.4 E${cumulativeE.toFixed(4)}`);
    if (l <= 2 || l >= 97) {
      lines.push(';TYPE:SKIN');
      for (let x = 101.5; x <= 118.5; x += 0.8) {
        lines.push(`G1 X${x.toFixed(2)} Y101.0 F3600`);
        cumulativeE += 0.68;
        lines.push(`G1 X${x.toFixed(2)} Y119.0 E${cumulativeE.toFixed(4)} F2700`);
      }
    } else {
      lines.push(';TYPE:FILL');
      for (let x = 104.0; x <= 116.0; x += 3.0) {
        lines.push(`G1 X${x.toFixed(2)} Y101.5 F4000`);
        cumulativeE += 0.65;
        lines.push(`G1 X${x.toFixed(2)} Y118.5 E${cumulativeE.toFixed(4)} F3000`);
      }
    }
  }
  lines.push('M104 S0', 'M140 S0', 'M107', 'G91', 'G1 Z5 F3000', 'G90', 'G28 X0 Y0', 'M84');
  return lines.join('\n');
}

// Benchy
function generateBenchy() {
  const lines = [
    '; 3D PRINTER SIMULATOR - 3DBENCHY TORTURE TEST',
    '; Dimensions: 60.0 x 31.0 x 48.0 mm',
    'G21', 'G90', 'M82',
    'M140 S60', 'M104 S205', 'M190 S60', 'M109 S205',
    'G28', 'G92 E0', 'G1 Z2.0 F3000', 'G1 X70 Y90 F6000'
  ];
  let cumulativeE = 0;
  for (let l = 0; l < 60; l++) {
    const z = (0.2 + l * 0.3).toFixed(2);
    lines.push(`;LAYER:${l}`, `;LAYER_CHANGE Z=${z}`, `G1 Z${z} F1500`);
    if (l === 1) lines.push('M106 S255');
    const bowLength = 20 + Math.min(15, l * 0.4);
    const beamWidth = 14 + Math.min(8, l * 0.25);
    const cx = 110;
    const cy = 110;
    const pts = [
      [cx - bowLength, cy],
      [cx - bowLength * 0.6, cy - beamWidth],
      [cx + 15, cy - beamWidth],
      [cx + 25, cy - beamWidth * 0.7],
      [cx + 28, cy],
      [cx + 25, cy + beamWidth * 0.7],
      [cx + 15, cy + beamWidth],
      [cx - bowLength * 0.6, cy + beamWidth],
    ];
    lines.push(';TYPE:WALL-OUTER');
    lines.push(`G1 X${pts[0][0].toFixed(2)} Y${pts[0][1].toFixed(2)} F4500`);
    for (let i = 1; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      const prev = pts[i - 1];
      const dist = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      cumulativeE += dist * 0.036;
      lines.push(`G1 X${p[0].toFixed(2)} Y${p[1].toFixed(2)} E${cumulativeE.toFixed(4)} F1800`);
    }
    if (l >= 20 && l <= 50) {
      lines.push(';TYPE:WALL-INNER');
      lines.push('G1 X102.0 Y103.0 F4000');
      cumulativeE += 0.8; lines.push(`G1 X124.0 Y103.0 E${cumulativeE.toFixed(4)} F2200`);
      cumulativeE += 0.5; lines.push(`G1 X124.0 Y117.0 E${cumulativeE.toFixed(4)}`);
      cumulativeE += 0.8; lines.push(`G1 X102.0 Y117.0 E${cumulativeE.toFixed(4)}`);
      cumulativeE += 0.5; lines.push(`G1 X102.0 Y103.0 E${cumulativeE.toFixed(4)}`);
    }
  }
  lines.push('M104 S0', 'M140 S0', 'M107', 'G91', 'G1 Z10 F3000', 'G90', 'G28 X0 Y0', 'M84');
  return lines.join('\n');
}

fs.writeFileSync(path.join(publicSamplesDir, 'quick_pad.gcode'), generateQuickPad());
fs.writeFileSync(path.join(publicSamplesDir, 'calibration_cube.gcode'), generateCalibrationCube());
fs.writeFileSync(path.join(publicSamplesDir, '3d_benchy.gcode'), generateBenchy());
console.log('Sample G-code files generated successfully in public/samples/');
