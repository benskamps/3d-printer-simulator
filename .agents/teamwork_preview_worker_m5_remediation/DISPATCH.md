# Dispatch: Milestone 5 Remediation Worker

## Identity
- **Agent**: `teamwork_preview_worker_m5_remediation`
- **Role**: Remediation Worker
- **Working Directory**: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m5_remediation`

## References
- Authoritative user request: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md`
- Project specification: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md`
- Challenger defect handoff: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_challenger_m5\handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Defect to Resolve
**Defect: Disconnected Live Layer Tracking during Print Execution**
- Slicers format layer boundaries as standalone comment lines (`;LAYER:0`, `;LAYER:1`, etc.).
- In `src/core/gcode/GCodeParser.ts`, `parseLine()` strips comments before command tokenization. When a line contains only a comment, `line.length === 0`, and `parseLine()` returns `null`, so standalone `;LAYER:` lines are excluded from `parsedLines`.
- In `src/core/gcode/GCodeExecutor.ts`, `executeParsedLine()` only checks `line.comment.match(/LAYER[:\s]+(\d+)/)` to update `this.activeLayerIndex`. Because `parsedLines` contains no such lines, `this.activeLayerIndex` is never updated during printing and remains permanently `0`.
- This causes `telemetry.job.currentLayer` on the Fluidd dashboard to remain permanently stuck at `0` (`L0/100`, `L0/60`, `L0/5`) from start to finish.

## Required Actions
1. In `src/core/gcode/types.ts` and `src/core/gcode/GCodeParser.ts`:
   - Extend `ParsedGCodeLine` with `layerIndex?: number`.
   - In `parseDocument()`, track the current `layerIndex` (incremented or set on `;LAYER:X` or Z increases) and assign `parsed.layerIndex = currentLayer` to each `ParsedGCodeLine`.
2. In `src/core/gcode/GCodeExecutor.ts`:
   - In `executeParsedLine()`, check if `line.layerIndex !== undefined && line.layerIndex !== this.activeLayerIndex`. If so, update `this.activeLayerIndex = line.layerIndex; this.kinematics.setActiveLayer(line.layerIndex, this.totalLayers); if (this.callbacks.onLayerChange) this.callbacks.onLayerChange(line.layerIndex, this.totalLayers);`.
   - Also preserve the existing comment-based check as a fallback.
3. In `src/test/e2e/tier4_scenarios.test.ts` (e.g. line 288) and `src/test/e2e/tier5_adversarial.test.ts`:
   - Update layer assertions to verify that `harness.getState().job.currentLayer` actually increments during/after printing to match the sliced layer count (`>= summary.totalLayers - 2` or `=== summary.totalLayers - 1`).
4. Run:
   - `npm test` (all 17 test files must pass, 419+ tests).
   - `npm run build` (`tsc && vite build` must compile cleanly with exit code 0).
   - `npm run smoke` (13/13 checks must pass with exit code 0).
5. Document changes and verification in `handoff.md` and notify parent via `send_message`.

## 2026-09-20T08:39:28Z
Your identity is teamwork_preview_worker_m5_remediation.
Your working directory is:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m5_remediation

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please read your assignment in:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m5_remediation\DISPATCH.md
and read:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_challenger_m5\handoff.md

Your task is to fix the disconnected live layer tracking defect:
1. Add `layerIndex?: number` to `ParsedGCodeLine` in `src/core/gcode/types.ts`.
2. In `src/core/gcode/GCodeParser.ts` `parseDocument()`, attach `parsed.layerIndex = currentLayer` for each parsed move.
3. In `src/core/gcode/GCodeExecutor.ts` `executeParsedLine()`, update `activeLayerIndex` when `line.layerIndex !== undefined` (and notify `onLayerChange`).
4. Update layer assertions in `src/test/e2e/tier4_scenarios.test.ts` and `src/test/e2e/tier5_adversarial.test.ts` to assert that `currentLayer` actually advances during and after prints.
5. Verify `npm test`, `npm run build`, and `npm run smoke` pass cleanly with exit code 0.
6. Maintain progress.md in your working directory.
7. Write handoff.md and notify parent via send_message.

