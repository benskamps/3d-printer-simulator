# TEST READY: 3D Printer Simulator

**Certification Date**: 2026-09-20  
**Sign-off**: `teamwork_preview_test_writer_m5_2` (E2E Test Writer / QA)  
**Status**: VERIFIED & PASSING (393/393 automated tests, 100% pass rate)

---

## 1. Test Runner Commands

The test suites and validation scripts are fully integrated and executable via standard npm scripts:

| Command | Suite / Target | Description | Expected Output |
|---------|----------------|-------------|-----------------|
| `npm test` | All Unit & E2E Suites | Runs Vitest across all 16 test files (Tiers 1–4 + Unit Suites) | 393 tests passed (exit code 0) |
| `npx vitest run src/test/e2e/` | E2E Integration Suite | Runs only the 4 E2E test tiers (Feature, Boundary, Pairwise, Scenarios) | 201 tests passed (exit code 0) |
| `npm run smoke` | Production Smoke Runner | Runs `node src/test/smoke-test.mjs` verifying build assets, headless parsing, math, and safety | 13/13 checks passed (exit code 0) |
| `npm run build` | TypeScript + Vite Build | Validates production TypeScript compilation and asset bundling | Clean build in `dist/` (exit code 0) |

---

## 2. Test Architecture & Coverage Summary

The simulator test suite follows a 4-tier opaque-box methodology derived from `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `TEST_INFRA.md`.

| Tier | Test Suite File | Focus / Methodology | Target | Implemented | Status |
|:----:|-----------------|---------------------|:------:|:-----------:|:------:|
| **Tier 1** | `src/test/e2e/tier1_features.test.ts` | Equivalence Class Happy-Path Feature Coverage | >= 80 | 85 | **PASS** |
| **Tier 2** | `src/test/e2e/tier2_boundaries.test.ts` | Boundary Value Analysis (BVA), Malformed Inputs, Extreme Multipliers | >= 80 | 81 | **PASS** |
| **Tier 3** | `src/test/e2e/tier3_pairwise.test.ts` | Cross-Feature Combinations & Pairwise Interactions | >= 20 | 29 | **PASS** |
| **Tier 4** | `src/test/e2e/tier4_scenarios.test.ts` | Real-World Workload Scenarios (Lifecycle, E-Stop, Runout, Shift, Runaway, Multi-Model) | >= 6 | 6 | **PASS** |
| **Smoke** | `src/test/smoke-test.mjs` | Standalone Node.js Runner for Production Artifacts & Core Physics Math | >= 10 | 13 | **PASS** |
| **Unit** | `src/test/unit/*.test.ts` (11 suites) | Isolated Component & Subsystem Mechanics | — | 192 | **PASS** |
| **TOTAL**| **All Suites** | **Complete Full-Stack Verification** | **>= 186** | **393** | **100% PASS** |

---

## 3. Feature Inventory & Coverage Mapping (F1 – F16)

Every feature inventoried in `TEST_INFRA.md` is verified across all applicable test tiers:

| # | Feature | Requirement Source | Tier 1 (Isolated) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workloads) | Verified Status |
|:---:|---------|-------------------|:-----------------:|:-----------------:|:-----------------:|:------------------:|:---------------:|
| **F1** | G-Code Parsing (`G0`/`G1`/`G28`/`G90`/`G91`/`G92`) | R2 (lines 15–17) | 6 tests | 6 tests | Tested with motion & thermals | S1, S2, S3, S4, S6 | **PASS** |
| **F2** | Extrusion Modes (`M82`/`M83`, `G92 E0`) | R2 (lines 15–17) | 5 tests | 5 tests | Tested with M220 speed factor | S1, S3, S4, S6 | **PASS** |
| **F3** | Playback Controls (`Play`/`Pause`/`Step`/`Abort`/1x–100x) | R2 (lines 16–17) | 5 tests | 5 tests | Tested with failure toggles | S1, S2, S3, S6 | **PASS** |
| **F4** | Pre-sliced Models & Ingestion (Cube, Benchy, Pad, Upload) | R2 (lines 16–17) | 5 tests | 5 tests | Tested with full print lifecycles | S1, S2, S3, S4, S6 | **PASS** |
| **F5** | Thermal Dynamics Math (Newton/Joule ODE & PID) | R3 (line 18) | 6 tests | 5 tests | Tested with part cooling fan | S1, S2, S5 | **PASS** |
| **F6** | Temperature G-Codes (`M104`/`M109`/`M140`/`M190`/`M105`) | R2, R3 (lines 15, 18)| 5 tests | 5 tests | Tested with dynamic terminal commands | S1, S2, S5 | **PASS** |
| **F7** | Cold Extrusion Prevention (< 170°C) | R3, AC (lines 19, 40) | 5 tests | 5 tests | Tested with fan & jog controls | S1, S3 | **PASS** |
| **F8** | Thermal Runaway Safety Watchdogs & `M112` | R3, AC (lines 19, 41) | 6 tests | 5 tests | Tested with emergency stop recovery | S2, S5 | **PASS** |
| **F9** | Hardware Failure Modes (Clog, Spaghetti, Shift, Runout) | R3, AC (lines 19, 41) | 6 tests | 5 tests | Tested with concurrent failures | S3, S4 | **PASS** |
| **F10**| Kinematics & 3D Viewport Motion (Cartesian XYZ) | R1, AC (lines 12–13, 39)| 5 tests | 5 tests | Tested with bed Y-axis parenting | S1, S2, S4, S6 | **PASS** |
| **F11**| Filament Toolpath Deposition (BufferGeometry/Instancing) | R1, AC (lines 13, 39) | 5 tests | 5 tests | Tested with layer filtering & spaghetti | S1, S4, S6 | **PASS** |
| **F12**| Layer Slicing Preview & Scrubbing | R1 (line 13) | 5 tests | 5 tests | Tested with active print bounds | S1, S6 | **PASS** |
| **F13**| Fluidd/Mainsail Dashboard & Live Temp Charts | R4 (lines 21–27) | 5 tests | 5 tests | Tested with telemetry synchronization | S1, S2, S5 | **PASS** |
| **F14**| Manual Jog Controls & Homing Interface | R4, AC (lines 24, 42) | 5 tests | 5 tests | Tested with cold lockout & M112 | S2, S3 | **PASS** |
| **F15**| Interactive Firmware Terminal & Telemetry Stream | R4, AC (lines 25, 42) | 5 tests | 5 tests | Tested with live terminal injection | S1, S2, S3, S4, S5, S6 | **PASS** |
| **F16**| Single-Command Runnable & Build Verification | AC (line 43) | 5 tests | 5 tests | Tested in standalone smoke runner | S1, S2, S3, S4, S5, S6 | **PASS** |

---

## 4. Real-World Workload Scenarios (Tier 4) Verification

All 6 required end-to-end user scenarios are implemented in `src/test/e2e/tier4_scenarios.test.ts` and pass deterministically:

1. **Scenario 1: Complete Calibration Cube Print Lifecycle (`S1`)**
   - Ingests 20mm cube G-code (skirt diameter ~32mm, height 19.8mm, 100 layers).
   - Preheats bed (60°C) and hotend (200°C), homes all Cartesian axes (`G28`).
   - Executes full print at 100x speed, deposits >50 toolpaths, reaches `COMPLETED`.
   - Executes post-print cooldown (`M104 S0`, `M140 S0`, `M84`), steppers disabled.

2. **Scenario 2: Emergency Stop & Firmware Recovery Workflow (`S2`)**
   - Active print running at operating temperatures.
   - `M112` Emergency Stop dispatched via console.
   - Firmware state transitions to `HALTED` / `ERROR`, heater targets cut to 0, cooling fan set to 100%, steppers disabled.
   - Jog and print commands rejected while halted.
   - Firmware reset (`resetFaults()`) clears fault condition, restores `IDLE`, permits homing (`G28`).

3. **Scenario 3: Mid-Print Filament Runout & Resume Workflow (`S3`)**
   - Print executing actively on build plate.
   - Filament runout sensor trips mid-print.
   - Automatic pause engages, toolhead auto-parks at `(10, 10, Z+5)`, terminal logs `Filament runout sensor triggered`.
   - Operator clears sensor, resumes print (`resumePrint()`).
   - Print resumes and runs cleanly to `COMPLETED`.

4. **Scenario 4: Layer Shift Mid-Print & Toolpath Compensation (`S4`)**
   - Print executing actively.
   - Mechanical step loss injected (+15mm X, +8mm Y).
   - Telemetry nominal position continues reporting programmed G-code coordinates while physical position applies exact offset transform.
   - Viewport layer shift visual flag active; print completes with permanent offset preserved.

5. **Scenario 5: Thermal Runaway Detection During Preheat (`S5`)**
   - Hotend commanded to 215°C with disconnected heater cartridge.
   - Watchdog monitors rise over `tau_watch` (25s); stalled rise trips thermal runaway.
   - Heaters cut to 0, fan forced to 100%, status set to `HALTED` with message `failed to rise by 2°C`.
   - Faults cleared via `resetFaults()`; subsequent normal heating completes safely.

6. **Scenario 6: Multi-Model Sequential Print Workflow (`S6`)**
   - Loads and runs Quick Test Pad to `COMPLETED`.
   - Clears bed and resets toolpath buffers via `abortPrint()`.
   - Loads 3DBenchy (60 layers), preheats heaters, and starts print at 100x speed.
   - Layers advance sequentially, new toolpaths accumulate cleanly without artifact bleed from previous job.

---

## 5. Standalone Smoke Test Verification (`src/test/smoke-test.mjs`)

The standalone smoke test verifies:
- `dist/index.html` structure (valid HTML5, dark theme, `#root` element, asset links).
- Production bundle integrity (bundled JS and CSS exist, non-empty, and contain core symbols).
- Headless lexical parsing of all 3 sample models (`quick_pad.gcode`, `3d_benchy.gcode`, `calibration_cube.gcode`).
- Analytical exponential thermal ODE stability ($T(t+\Delta t) = T_\infty + (T - T_\infty)e^{-\lambda \Delta t}$).
- Cold extrusion lockout at $< 170^\circ\text{C}$.
- Marlin-spec heating rise watchdog ($< 2^\circ\text{C}$ rise after 25s trips halt).
- Hardware failure mode mechanics (nozzle clog flow scaling, layer shift vector addition, filament runout park coordinate math).

**Smoke Test Result**: `13 / 13 checks passed` (exit code 0).
