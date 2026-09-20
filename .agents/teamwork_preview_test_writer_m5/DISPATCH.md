# Test Writer Dispatch: Milestone 5 — E2E Test Suite (Tiers 1-4), Smoke Test, & TEST_READY.md

## Objective
Implement Phase 1 of the Final Milestone according to `TEST_INFRA.md` and `ORIGINAL_REQUEST.md`:
1. Build the Opaque-Box E2E Test Suite in `src/test/e2e/`:
   - `src/test/e2e/harness.ts`:
     - Test fixture and simulator harness that instantiates the simulator, advances virtual time, dispatches simulated user interactions (jogging, temperature commands, file uploads, play/pause/step/abort, failure toggles), and verifies outputs.
   - `src/test/e2e/tier1_features.test.ts`:
     - Tier 1: Feature Coverage (>=5 test cases per feature for all 16 inventoried features in `TEST_INFRA.md`, totaling >=80 test cases).
     - Tests each feature in isolation (F1 to F16).
   - `src/test/e2e/tier2_boundaries.test.ts`:
     - Tier 2: Boundary & Corner Cases (>=5 test cases per feature, totaling >=80 test cases).
     - Tests extreme coordinates, negative values, zero feedrates, cold lockout boundaries (169.9°C vs 170.0°C), thermal limits (MINTEMP, MAXTEMP), buffer chunk boundaries, and 100x speed micro-segments.
   - `src/test/e2e/tier3_pairwise.test.ts`:
     - Tier 3: Cross-Feature Combinations (>=20 test cases).
     - Tests pairwise feature interactions (e.g. speed multiplier + thermal wait; jog during pause + resume; clog + layer shift; extrusion mode switch + flow override; homing + coordinate reset).
   - `src/test/e2e/tier4_scenarios.test.ts`:
     - Tier 4: Real-World Workload Scenarios (>=6 full scenarios).
     - Scenario S1: Complete Calibration Cube print from load to completion.
     - Scenario S2: Thermal Runaway trigger, watchdog trip, and emergency halt recovery.
     - Scenario S3: Mid-print filament runout, M600 pause, head park at (10, 10, Z+5), reload and seamless resume.
     - Scenario S4: Open-loop layer shift (+10mm X) and visual coordinate offset.
     - Scenario S5: Cold extrusion lockout at 25°C, heating to 200°C, and successful extrusion recovery.
     - Scenario S6: 100x high-speed playback stress run of multi-thousand move model without drift or memory leaks.
2. Implement Standalone Smoke Test in `src/test/smoke-test.mjs`:
   - Automated script runnable via `node src/test/smoke-test.mjs` or `npm run smoke`.
   - Verifies that production build exists (`dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`).
   - Starts a lightweight local HTTP server (using Node's `http` module), fetches `index.html` and the bundled JS/CSS assets, verifies 200 OK responses and non-empty content.
   - Parses and validates that the bundled JavaScript evaluates cleanly without syntax errors.
   - Exits with code 0 on success.
3. Update `package.json`:
   - Add `"smoke": "node src/test/smoke-test.mjs"` and ensure `"test": "vitest run"` runs all unit and E2E test suites.
4. Publish `TEST_READY.md` at project root `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\TEST_READY.md`:
   - Follow the template in `TEST_INFRA.md` summarizing the runner command, test counts across Tiers 1-4, and the full feature checklist.
5. Run:
   - `npm test` (all unit and E2E test suites must pass 100% cleanly).
   - `npm run build` (production build succeeds).
   - `node src/test/smoke-test.mjs` (smoke test succeeds with exit code 0).

## Mandatory Files to Read Before Starting
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\TEST_INFRA.md`

## File Ownership
You exclusively own:
- `src/test/e2e/*`
- `src/test/smoke-test.mjs`
- `TEST_READY.md`
- Adding script to `package.json`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Output
Write your handoff report to:
`c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_test_writer_m5\handoff.md`

## 2026-09-20T04:16:19Z
<USER_REQUEST>
Your identity is teamwork_preview_test_writer_m5.
Your working directory is:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_test_writer_m5

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please read your assignment in:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_test_writer_m5\DISPATCH.md
and read:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\TEST_INFRA.md

Your task is to implement the complete 4-tier E2E test suite and smoke test:
1. Implement opaque-box test harness in src/test/e2e/harness.ts.
2. Implement Tier 1 (Feature Coverage >=80 tests) in src/test/e2e/tier1_features.test.ts.
3. Implement Tier 2 (Boundary & Corner Cases >=80 tests) in src/test/e2e/tier2_boundaries.test.ts.
4. Implement Tier 3 (Cross-Feature Combinations >=20 tests) in src/test/e2e/tier3_pairwise.test.ts.
5. Implement Tier 4 (Real-World Workload Scenarios >=6 scenarios) in src/test/e2e/tier4_scenarios.test.ts.
6. Implement standalone smoke test in src/test/smoke-test.mjs.
7. Publish TEST_READY.md at project root.
8. Run `npm test`, `npm run build`, and `node src/test/smoke-test.mjs`.

Maintain progress.md in your working directory.
When done, write handoff.md in your working directory and notify the parent via send_message.
</USER_REQUEST>
