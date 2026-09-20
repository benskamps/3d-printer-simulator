# Milestone 5 Challenger Re-Verification Report: Bug #1 (Live Layer Tracking)

**Agent**: `teamwork_preview_challenger_m5_verif`  
**Role**: Empirical Challenger / Critic / Specialist  
**Date**: 2026-09-20  
**Target System**: Interactive 3D Printer Simulator (Vite + React + Three.js + TypeScript)  
**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Test Suite & Build Verification
The entire test suite, TypeScript compiler, production bundler, and standalone smoke runner were executed:
- `npm test`: **18 test files passed, 426 passed tests** in 1.74s (exit code 0).
- `npm run build`: `tsc && vite build` succeeded in 3.39s with 0 errors (exit code 0). Emitted assets:
  - `dist/index.html` (0.53 kB)
  - `dist/assets/index-CONWyaEq.css` (26.31 kB)
  - `dist/assets/index-BCjpj9HE.js` (800.85 kB)
- `npm run smoke`: `node src/test/smoke-test.mjs` completed with **13/13 checks passed** (exit code 0).
- `npx vitest run src/test/e2e/tier5_adversarial.test.ts`: **26/26 tests passed** (exit code 0).
- `npx vitest run src/test/e2e/tier4_scenarios.test.ts`: **6/6 tests passed** (exit code 0).
- `npx vitest run src/test/unit/gcode-parser.test.ts`: **15/15 tests passed** (exit code 0).

### 1.2 Remediation Implementation Verification
Direct inspection of modified files confirmed:
1. `src/core/gcode/types.ts`:
   - `ParsedGCodeLine` defines optional property `layerIndex?: number;`.
2. `src/core/gcode/GCodeParser.ts` (lines 270–308):
   - Standalone comment lines matching `/;\s*LAYER[:\s]+(\d+)/i` set `currentLayer = pendingLayerIndex`.
   - Every parsed line receives `parsed.layerIndex = currentLayer;`.
   - In fallback mode (unannotated G-code), when `parsed.isExtruding && this.modalZ > 0`, new Z heights append to `layerHeights` and set `currentLayer = layerHeights.length - 1`.
3. `src/core/gcode/GCodeExecutor.ts` (lines 166–169, 373–395):
   - In `startPrint()`, `this.activeLayerIndex = 0;` and `this.kinematics.setActiveLayer(0, this.totalLayers);` are explicitly initialized.
   - In `executeParsedLine()`, `if (line.layerIndex !== undefined && line.layerIndex !== this.activeLayerIndex)` triggers `this.activeLayerIndex = line.layerIndex;`, `this.kinematics.setActiveLayer()`, and `this.callbacks.onLayerChange()`.
4. `src/test/e2e/tier4_scenarios.test.ts` (line 264, line 289):
   - Asserts `expect(harness.getState().job.currentLayer).toBe(4)` upon Quick Pad completion.
   - Asserts `expect(harness.getState().job.currentLayer).toBeGreaterThan(0)` during active Benchy printing.
5. `src/test/e2e/tier5_adversarial.test.ts` (line 52, lines 85–86):
   - Asserts `expect(harness.getState().job.currentLayer).toBe(4)` on Quick Pad completion.
   - Asserts `expect(currentLayer).toBeGreaterThanOrEqual(summary.totalLayers - 2)` on Calibration Cube completion.

### 1.3 Empirical Adversarial Re-Verification (`src/test/e2e/empirical_layer_verification.test.ts`)
A dedicated empirical verification test suite was authored and executed across 5 test scenarios:
1. **Quick Pad (5 layers, 0-indexed)**:
   - Initial state: `currentLayer = 0`, `totalLayers = 5`.
   - Traversed layers: observed `[0, 1, 2, 3, 4]` sequentially.
   - Completion state: `harness.executor.getState() === ExecutionState.COMPLETED`, `job.currentLayer === 4`, `job.totalLayers === 5`.
2. **Calibration Cube (100 layers, 0-indexed)**:
   - Initial state: `currentLayer = 0`, `totalLayers = 100`.
   - Traversed layers: 100 distinct layer transitions observed strictly from 0 to 99 in monotonic order.
   - Completion state: `harness.executor.getState() === ExecutionState.COMPLETED`, `job.currentLayer === 99`, `job.totalLayers === 100`.
3. **3DBenchy (60 layers, 0-indexed)**:
   - Initial state: `currentLayer = 0`, `totalLayers = 60`.
   - Traversed layers: strictly monotonic progression from 0 to 59.
   - Completion state: `harness.executor.getState() === ExecutionState.COMPLETED`, `job.currentLayer === 59`, `job.totalLayers === 60`.
4. **Sequential Multi-Model Prints & Reset**:
   - Model 1 (Quick Pad) finishes at layer 4.
   - `abortPrint()` and `loadSampleModel('benchy')` reset `job.currentLayer` immediately to 0.
   - Model 2 (Benchy) prints from layer 0 to completion at layer 59.
5. **Fallback Tracking (No `;LAYER:` comments)**:
   - 3-layer G-code without comments executes to completion.
   - Correctly updates `currentLayer` from 0 to 2 as extrusion moves occur at new Z levels.

---

## 2. Logic Chain

1. Prior Defect Observation (Milestone 5): Standalone `;LAYER:X` comment lines were stripped by `parseLine()` resulting in `null` parsed lines. Consequently, `parsedLines` contained no layer annotations and `GCodeExecutor` never updated `activeLayerIndex`, permanently trapping `currentLayer` at 0.
2. Remediation Verification: The remediation worker introduced `parsed.layerIndex` during document parsing and updated `GCodeExecutor.executeParsedLine()` to synchronize `activeLayerIndex` whenever `line.layerIndex` changes.
3. Real-Time Telemetry Flow: When `executeParsedLine()` updates `activeLayerIndex`, it invokes `this.kinematics.setActiveLayer(line.layerIndex, this.totalLayers)` and `this.callbacks.onLayerChange(line.layerIndex, this.totalLayers)`.
4. Store Propagation: In `harness.wireCallbacks()`, `onLayerChange` updates `TelemetryStore.updateJobMetrics({ currentLayer, totalLayers })`. In production, the same callback updates `telemetryStore`, which reacts into `FluiddDashboard` (`L{currentLayer}/{totalLayers}`) and `PrintStatusPanel`.
5. Empirical Evidence: In our empirical tests, `job.currentLayer` dynamically progressed through each layer (0 to 4 for Quick Pad, 0 to 99 for Cube, 0 to 59 for Benchy, 0 to 2 for Fallback G-code), and upon print completion accurately reflected the final layer index (`totalLayers - 1`).
6. Zero Regressions: All existing test tiers (unit, boundary, pairwise, scenario, and adversarial), production build, and smoke test continue to pass cleanly without failures.

---

## 3. Caveats

- **0-Indexed Slicer Convention**: Layers are represented 0-indexed across standard slicer annotations (`0` to `totalLayers - 1`), matching both internal kinematics and slicer output conventions. The final layer index upon completion is `totalLayers - 1` (e.g. layer 4 of 5, layer 99 of 100, layer 59 of 60).
- **Physical Thermal Headroom under 100% Cooling Fan**: In standalone unit/E2E test environments, when simulating full prints with part cooling fans active at 100% (`M106 S255`), using the calibrated thermal options (`hotendParams: { kHeat: 5.2, kFan: 0.003 }`) as specified in `tier4_scenarios` and `tier5_adversarial` prevents convective cooling from overwhelming the default 40W heater model and tripping in-range stability watchdogs.
- No further caveats.

---

## 4. Conclusion

**Verdict: APPROVE**

Bug #1 (Disconnected Live Layer Tracking) is completely and cleanly resolved. Live layer tracking functions correctly throughout active printing across all sample models, user G-code uploads, and fallback non-annotated files. All test suites (`426/426 tests passed`), type-checking, production build (`tsc && vite build`), and smoke tests pass without errors. Milestone 5 acceptance criteria are fully met.

---

## 5. Verification Method

To independently reproduce and verify the resolution:

1. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *Expected: 18 test files passed, 426 passed tests.*

2. **Run Dedicated Empirical Layer Verification Suite**:
   ```bash
   npx vitest run src/test/e2e/empirical_layer_verification.test.ts
   ```
   *Expected: 5/5 tests passed, verifying all layer transitions across Quick Pad, Cube, Benchy, and Fallback mode.*

3. **Run Targeted Tier 4 and Tier 5 E2E Tests**:
   ```bash
   npx vitest run src/test/e2e/tier5_adversarial.test.ts
   npx vitest run src/test/e2e/tier4_scenarios.test.ts
   ```
   *Expected: All tests pass.*

4. **Run Production Build and Smoke Runner**:
   ```bash
   npm run build
   npm run smoke
   ```
   *Expected: Build exits 0, smoke runner passes 13/13 checks.*

5. **Invalidation Condition**:
   Any test run producing `currentLayer === 0` at print completion, skipping layers, or failing to advance monotonically invalidates this approval.
