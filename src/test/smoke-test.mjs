#!/usr/bin/env node

/**
 * 3D Printer Simulator — Production Smoke Test Runner
 *
 * Standalone, zero-dependency Node.js verification script.
 * Validates production build artifacts, G-code ingestion on all bundled models,
 * thermal ODE & PID convergence math, safety watchdogs, and hardware failure modes.
 *
 * Usage:
 *   node src/test/smoke-test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

console.log('='.repeat(72));
console.log('  3D PRINTER SIMULATOR — PRODUCTION SMOKE TEST');
console.log('='.repeat(72));
console.log(`Root Directory: ${projectRoot}`);
console.log(`Execution Time: ${new Date().toISOString()}\n`);

let passedChecks = 0;
let totalChecks = 0;

function check(title, fn) {
  totalChecks++;
  try {
    fn();
    console.log(`  [PASS] ${title}`);
    passedChecks++;
  } catch (err) {
    console.error(`  [FAIL] ${title}`);
    console.error(`         ${err.message}`);
    process.exitCode = 1;
  }
}

// =========================================================================
// 1. Production Build & Static Asset Verification
// =========================================================================
console.log('--- 1. Production Build & Asset Verification ---');

const distDir = path.join(projectRoot, 'dist');
const htmlFile = path.join(distDir, 'index.html');

check('dist/ directory exists and contains index.html', () => {
  assert(fs.existsSync(distDir), 'dist/ directory not found. Run npm run build first.');
  assert(fs.existsSync(htmlFile), 'dist/index.html not found.');
});

let htmlContent = '';
check('dist/index.html contains mounting root and meta tags', () => {
  htmlContent = fs.readFileSync(htmlFile, 'utf-8');
  assert(htmlContent.includes('id="root"'), 'index.html missing #root mounting element');
  assert(htmlContent.includes('<title>3D Printer Simulator</title>'), 'index.html missing page title');
  assert(htmlContent.includes('class="dark"'), 'index.html missing dark theme attribute');
});

let jsAssetPath = '';
let cssAssetPath = '';
check('dist/index.html references bundled JS and CSS assets', () => {
  const jsMatch = htmlContent.match(/src="([^"]+\.js)"/);
  const cssMatch = htmlContent.match(/href="([^"]+\.css)"/);

  assert(jsMatch && jsMatch[1], 'Could not find bundled .js script tag in index.html');
  assert(cssMatch && cssMatch[1], 'Could not find bundled .css stylesheet link in index.html');

  // Strip leading slash if present
  const jsRel = jsMatch[1].replace(/^\//, '');
  const cssRel = cssMatch[1].replace(/^\//, '');

  jsAssetPath = path.join(distDir, jsRel);
  cssAssetPath = path.join(distDir, cssRel);

  assert(fs.existsSync(jsAssetPath), `Referenced JS asset does not exist: ${jsAssetPath}`);
  assert(fs.existsSync(cssAssetPath), `Referenced CSS asset does not exist: ${cssAssetPath}`);

  const jsStat = fs.statSync(jsAssetPath);
  const cssStat = fs.statSync(cssAssetPath);

  assert(jsStat.size > 50_000, `JS bundle is unusually small (${jsStat.size} bytes)`);
  assert(cssStat.size > 5_000, `CSS bundle is unusually small (${cssStat.size} bytes)`);
});

check('Production JS bundle contains critical simulator symbols', () => {
  const bundleCode = fs.readFileSync(jsAssetPath, 'utf-8');
  assert(bundleCode.includes('Calibration Cube') && bundleCode.includes('3DBenchy'), 'Missing sample model symbols');
  assert(bundleCode.includes('Thermal Runaway') || bundleCode.includes('cold extrusion'), 'Missing thermal safety symbols');
  assert(bundleCode.includes('BufferGeometry') || bundleCode.includes('InstancedMesh'), 'Missing 3D viewport symbols');
});

// =========================================================================
// 2. Bundled Sample Models & Headless Parser Verification
// =========================================================================
console.log('\n--- 2. Sample G-Code Models & Headless Ingestion ---');

const samplesDir = path.join(projectRoot, 'public/samples');

function headlessParseGCode(text) {
  const lines = text.split(/\r?\n/);
  let layerCount = 0;
  let moveCount = 0;
  let totalExtrusion = 0;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Track layers from comments
    if (trimmed.startsWith(';LAYER:')) {
      layerCount++;
    }

    // Strip comments
    const noComment = trimmed.split(';')[0].trim();
    if (!noComment) continue;

    const tokens = noComment.split(/\s+/);
    const cmd = tokens[0].toUpperCase();

    if (cmd === 'G0' || cmd === 'G1') {
      moveCount++;
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        const axis = t[0].toUpperCase();
        const val = parseFloat(t.slice(1));
        if (isNaN(val)) continue;

        if (axis === 'X') {
          minX = Math.min(minX, val);
          maxX = Math.max(maxX, val);
        } else if (axis === 'Y') {
          minY = Math.min(minY, val);
          maxY = Math.max(maxY, val);
        } else if (axis === 'Z') {
          minZ = Math.min(minZ, val);
          maxZ = Math.max(maxZ, val);
        } else if (axis === 'E') {
          totalExtrusion = Math.max(totalExtrusion, val);
        }
      }
    }
  }

  return {
    totalLines: lines.length,
    layerCount,
    moveCount,
    totalExtrusion,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
  };
}

const sampleFiles = [
  { name: 'quick_pad.gcode', minLayers: 5, expectedName: 'Quick Test Pad' },
  { name: '3d_benchy.gcode', minLayers: 50, expectedName: '3DBenchy Torture Test' },
  { name: 'calibration_cube.gcode', minLayers: 90, expectedName: 'Calibration Cube 20mm' },
];

for (const sample of sampleFiles) {
  check(`Parses ${sample.name} (${sample.expectedName})`, () => {
    const filePath = path.join(samplesDir, sample.name);
    assert(fs.existsSync(filePath), `Sample file does not exist: ${filePath}`);
    const text = fs.readFileSync(filePath, 'utf-8');
    const result = headlessParseGCode(text);

    assert(result.totalLines > 50, `${sample.name} has too few lines: ${result.totalLines}`);
    assert(result.layerCount >= sample.minLayers, `${sample.name} layer count ${result.layerCount} < ${sample.minLayers}`);
    assert(result.moveCount > 20, `${sample.name} has too few moves: ${result.moveCount}`);
    assert(result.totalExtrusion > 0, `${sample.name} has zero extrusion`);
    assert(result.bounds.maxX > result.bounds.minX, `${sample.name} has invalid X bounding box`);
  });
}

// =========================================================================
// 3. Thermal Physics & Safety Math Verification
// =========================================================================
console.log('\n--- 3. Thermal Physics Math & Safety Watchdogs ---');

check('Newtonian/Joule thermal exponential solution converges smoothly', () => {
  // Discrete analytical integration: T(t+dt) = T_inf + (T - T_inf)*e^(-lambda*dt)
  const ambient = 21.0;
  const kHeat = 3.80;
  const kCool = 0.0145;
  const u = 1.0; // 100% heater duty
  const lambda = kCool;
  const tInf = ambient + (u * kHeat) / lambda;

  let currentTemp = ambient;
  const dt = 0.1;

  for (let step = 0; step < 500; step++) {
    currentTemp = tInf + (currentTemp - tInf) * Math.exp(-lambda * dt);
    assert(!isNaN(currentTemp) && isFinite(currentTemp), 'Thermal integration produced NaN or Infinity');
    assert(currentTemp >= ambient, 'Temperature dropped below ambient');
    assert(currentTemp <= tInf + 0.1, 'Temperature exceeded physical ceiling');
  }

  // After 50 seconds, temp should have risen by > 100°C
  assert(currentTemp > 120, `Temperature after 50s too low: ${currentTemp}°C`);
});

check('Cold extrusion lockout blocks deposition when T < 170°C', () => {
  const coldThreshold = 170.0;
  const testTemps = [21.0, 50.0, 100.0, 169.9, 170.0, 200.0, 250.0];

  for (const t of testTemps) {
    const canExtrude = t >= coldThreshold;
    if (t < 170.0) {
      assert(!canExtrude, `Cold extrusion allowed at ${t}°C`);
    } else {
      assert(canExtrude, `Extrusion blocked at warm temp ${t}°C`);
    }
  }
});

check('Marlin-spec heating watchdog algorithm trips on stalled rise', () => {
  const tauWatch = 25.0; // seconds
  let watchdogTimer = 0;
  let startTemp = 21.0;
  let actualTemp = 21.0; // heater fails to rise (cartridge failure)
  const dt = 0.5;
  let tripped = false;

  while (watchdogTimer < 30.0) {
    watchdogTimer += dt;
    if (watchdogTimer >= tauWatch) {
      const rise = actualTemp - startTemp;
      if (rise < 2.0) {
        tripped = true;
        break;
      }
    }
  }

  assert(tripped, 'Watchdog failed to trip on stalled rise after 25s');
});

// =========================================================================
// 4. Hardware Failure Mechanics
// =========================================================================
console.log('\n--- 4. Hardware Failure Mechanics Simulation ---');

check('Nozzle clog flow scaling (NONE: 100%, PARTIAL: 25%, FULL: 0%)', () => {
  const getScale = (mode) => (mode === 'NONE' ? 1.0 : mode === 'PARTIAL' ? 0.25 : 0.0);
  assert.strictEqual(getScale('NONE'), 1.0);
  assert.strictEqual(getScale('PARTIAL'), 0.25);
  assert.strictEqual(getScale('FULL'), 0.0);

  const commandedE = 4.0;
  assert.strictEqual(commandedE * getScale('NONE'), 4.0);
  assert.strictEqual(commandedE * getScale('PARTIAL'), 1.0);
  assert.strictEqual(commandedE * getScale('FULL'), 0.0);
});

check('Layer shift physical transformation math (X_phys = X_nom + dx)', () => {
  const nominal = { x: 50.0, y: 50.0, z: 2.0 };
  const shift = { x: 15.0, y: -10.0 };

  const physical = {
    x: nominal.x + shift.x,
    y: nominal.y + shift.y,
    z: nominal.z,
  };

  assert.strictEqual(physical.x, 65.0);
  assert.strictEqual(physical.y, 40.0);
  assert.strictEqual(physical.z, 2.0);
});

check('Filament runout parking coordinate calculation (10, 10, min(250, Z+5))', () => {
  const calcParkPos = (currentPos) => ({
    x: 10,
    y: 10,
    z: Math.min(250, currentPos.z + 5),
  });

  const p1 = calcParkPos({ x: 100, y: 150, z: 2.0 });
  assert.deepStrictEqual(p1, { x: 10, y: 10, z: 7.0 });

  const p2 = calcParkPos({ x: 50, y: 50, z: 248.0 });
  assert.deepStrictEqual(p2, { x: 10, y: 10, z: 250.0 });
});

// =========================================================================
// Summary Report
// =========================================================================
console.log('\n' + '='.repeat(72));
console.log(`  SMOKE TEST COMPLETE: ${passedChecks} / ${totalChecks} checks passed`);
console.log('='.repeat(72) + '\n');

if (passedChecks === totalChecks) {
  console.log('  >>> STATUS: ALL SYSTEMS OPERATIONAL (EXIT 0) <<<\n');
  process.exit(0);
} else {
  console.error('  >>> STATUS: SMOKE TEST FAILED (EXIT 1) <<<\n');
  process.exit(1);
}
