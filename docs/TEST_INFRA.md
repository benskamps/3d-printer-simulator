# E2E Test Infra: 3D Printer Simulator

## Test Philosophy
- **Opaque-box & Requirement-driven**: Derived directly from `ORIGINAL_REQUEST.md` (R1, R2, R3, R4) and the user-facing acceptance criteria, independent of internal module implementation.
- **Methodology**: Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial Testing, and Real-World Workload Testing.
- **Progressive Testability**: Verification mechanisms do not require features more complex than what is being tested. Earliest tiers verify core numerical outputs, exit codes, and coordinate assertions.
- **Robustness & Negative Testing**: Comprehensive coverage of boundary extremes, invalid commands, thermal runaway faults, and emergency halt recovery.

---

## Feature Inventory & Test Coverage Mapping
| # | Feature | Requirement Source | Tier 1 (>=5) | Tier 2 (>=5) | Tier 3 (Pairwise) | Tier 4 (Workloads) |
|---|---------|-------------------|:------------:|:------------:|:-----------------:|:------------------:|
| F1 | G-Code Parsing (G0/G1/G28/G90/G91/G92) | R2 (lines 15-17) | 6 | 6 | ✓ | ✓ |
| F2 | Extrusion Modes (M82/M83, G92 E0) | R2 (lines 15-17) | 5 | 5 | ✓ | ✓ |
| F3 | Playback Controls (Play/Pause/Step/Abort/1x-100x) | R2 (lines 16-17) | 5 | 5 | ✓ | ✓ |
| F4 | Pre-sliced Models & Ingestion (Cube/Benchy/Pad/Upload) | R2 (lines 16-17) | 5 | 5 | ✓ | ✓ |
| F5 | Thermal Dynamics Math (Newton/Joule ODE & PID) | R3 (line 18) | 6 | 5 | ✓ | ✓ |
| F6 | Temperature G-Codes (M104/M109/M140/M190/M105) | R2, R3 (lines 15, 18) | 5 | 5 | ✓ | ✓ |
| F7 | Cold Extrusion Prevention (< 170°C) | R3, AC (lines 19, 40) | 5 | 5 | ✓ | ✓ |
| F8 | Thermal Runaway Safety Watchdogs & M112 | R3, AC (lines 19, 41) | 6 | 5 | ✓ | ✓ |
| F9 | Hardware Failure Modes (Clog/Spaghetti/Shift/Runout) | R3, AC (lines 19, 41) | 6 | 5 | ✓ | ✓ |
| F10 | Kinematics & 3D Viewport Motion (Cartesian XYZ) | R1, AC (lines 12-13, 39) | 5 | 5 | ✓ | ✓ |
| F11 | Filament Toolpath Deposition (BufferGeometry/Instancing) | R1, AC (lines 13, 39) | 5 | 5 | ✓ | ✓ |
| F12 | Layer Slicing Preview & Scrubbing | R1 (line 13) | 5 | 5 | ✓ | ✓ |
| F13 | Fluidd/Mainsail Dashboard & Live Temp Charts | R4 (lines 21-27) | 5 | 5 | ✓ | ✓ |
| F14 | Manual Jog Controls & Homing Interface | R4, AC (lines 24, 42) | 5 | 5 | ✓ | ✓ |
| F15 | Interactive Firmware Terminal & Telemetry Stream | R4, AC (lines 25, 42) | 5 | 5 | ✓ | ✓ |
| F16 | Single-Command Runnable & Build Verification | AC (line 43) | 5 | 5 | ✓ | ✓ |

---

## Test Architecture
- **Test Runner**: Vitest (`npm test` / `npx vitest run`) + Node.js smoke runner (`node src/test/smoke-test.mjs`).
- **Pass/Fail Semantics**: All tests must complete with exit code 0, 0 unhandled promise rejections, and zero console errors.
- **Test File Locations**:
  - `src/test/e2e/tier1_features.test.ts`: Equivalence class happy-path tests for each inventoried feature in isolation (>=80 tests).
  - `src/test/e2e/tier2_boundaries.test.ts`: Extreme values, 100x playback, cold lockout, buffer boundaries, malformed syntax (>=80 tests).
  - `src/test/e2e/tier3_pairwise.test.ts`: Cross-feature combinatorial interactions (jog during heatup, pause during layer shift, speed multiplier with thermal waits, clog with extrusion reset).
  - `src/test/e2e/tier4_scenarios.test.ts`: Real-world end-to-end user workflows (Full Calibration Cube print, 3DBenchy execution, Thermal Runaway Emergency Halt & recovery, Filament Runout M600 reload cycle).
  - `src/test/e2e/tier5_adversarial.test.ts`: White-box adversarial edge fuzzing, memory leaks, and stress resilience.

---

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|-------------------|------------------|
| S1 | Complete Calibration Cube Print | F1, F2, F3, F4, F5, F6, F10, F11, F12, F13, F15 | Loads 20mm cube, heats bed/nozzle, homes axes, executes 100 layers, deposits toolpath buffer, updates ETA and layer counter, reaches print complete. |
| S2 | Thermal Runaway Trigger & Emergency Halt | F5, F6, F8, F13, F15 | Heater commanded to 220°C with disconnected thermistor/failed heater; runaway watchdog detects stalled rise after tau_watch, trips M112, kills heaters, logs error, and locks state. |
| S3 | Mid-Print Filament Runout & M600 Reload | F1, F2, F3, F9, F14, F15 | Runout sensor tripped; execution automatically pauses, parks head at (10, 10, Z+5), emits M600 prompt, reloads filament, and resumes print seamlessly. |
| S4 | Open-Loop Layer Shift & Visual Offset | F1, F9, F10, F11, F15 | Injects X+10mm step loss at Layer 10; terminal continues reporting nominal coordinates while 3D viewport applies physical coordinate transformation. |
| S5 | Cold Extrusion Rejection & Warm Recovery | F1, F2, F7, F14, F15 | User attempts manual jog extrude or G1 E10 at 25°C; command blocked with warning; user heats to 200°C; extrusion succeeds. |
| S6 | 100x High-Speed Playback Stress Run | F1, F2, F3, F7, F10, F11, F12 | Executes multi-thousand segment file at 100x; accumulator time budget loop drains segments without floating point drift or UI lockup. |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: 16 features × 5 = 80 test cases minimum.
- **Tier 2 (Boundary & Corner)**: 16 features × 5 = 80 test cases minimum.
- **Tier 3 (Cross-Feature Pairwise)**: 20 combinatorial interaction test cases minimum.
- **Tier 4 (Real-World Scenarios)**: 6 comprehensive end-to-end workload test cases.
- **Tier 5 (Adversarial Coverage Hardening)**: White-box stress and invariant assertions.
- **Total Minimum**: >= 186 automated test cases.
