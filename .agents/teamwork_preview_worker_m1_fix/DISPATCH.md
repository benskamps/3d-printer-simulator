# Worker Dispatch: Milestone 1 Remediation & Adversarial Fixes

## Objective
Remediate the 12 empirical defects and root causes identified by Reviewer 2, Challenger 1, and Challenger 2:

### Defects to Fix:
1. **Lookahead Queue Coordinate Collapse (`GCodeExecutor.ts`)**:
   - In `GCodeExecutor.ts`, maintain a `plannerPosition` (or `plannerKinematics`) initialized to the starting position.
   - When enqueuing lookahead blocks, compute the move start and end coordinates from `plannerPosition`, and update `plannerPosition` to the move's endpoint.
   - This ensures each queued block chains from the previous block's endpoint rather than collapsing to `(0, 0, 0)`.
   - Toolpath segments emitted for 3D visualization must have continuous start-to-end coordinates.
2. **Preserve Toolpath Type on Parsed Line (`GCodeParser.ts` / `types.ts`)**:
   - Store the classified `toolpathType` on `ParsedGCodeLine` during parsing so lookahead parsing does not mutate a shared variable and clobber earlier perimeter moves.
3. **Fix M82 Flow Override in `CartesianKinematics.ts`**:
   - In absolute extrusion mode (`M82`), do NOT set `curr.e = curr.e + deltaE * (flow / 100)`.
   - Instead, keep the logical G-code extruder position `curr.e = targetE`, and apply `flowOverride` only to the emitted `extrusionLength` / `deltaE`.
   - This prevents subsequent forward moves from calculating negative $\Delta E$ and causing false retractions.
4. **Fix Cumulative Filament Metric in `GCodeParser.parseDocument`**:
   - Accumulate `totalFilamentMm += deltaE` for each positive extrusion move across the entire file, rather than reading `modalE` at EOF.
   - This prevents `G92 E0` layer resets from erasing earlier layers' filament counts.
5. **Fix Print Time Estimation in `GCodeParser.parseDocument`**:
   - Track previous coordinates `(prevX, prevY, prevZ)` and compute delta displacement `Math.hypot(x - prevX, y - prevY, z - prevZ)`.
   - Do NOT use raw absolute coordinates as move distances.
6. **Fix Immediate Jog Command During Pause in `GCodeExecutor.ts`**:
   - When printing is `PAUSED`, an immediate jog command must NOT pop or step the in-flight print queue.
   - Either execute the jog move directly on `this.kinematics` and emit position update, or maintain a separate manual motion channel.
7. **Fix `abortPrint()` and `clearQueue()` in `MotionInterpolator.ts`**:
   - In `MotionInterpolator.clearQueue()`, also set `this.activeBlock = null` and reset the interpolator state so aborted in-flight moves do not linger.
8. **Fix Single-Step Completion in `GCodeExecutor.ts`**:
   - In `stepForward()` or the stepping block of `update()`, check if `this.currentLineIndex >= this.parsedLines.length` and the queue is empty. If so, transition to `COMPLETED` rather than remaining stuck in `PAUSED`.
9. **Enforce Boundary Soft Limits in `CartesianKinematics.ts`**:
   - Ensure `clampCoordinates()` is called during `calculateMove()` or position updates so moves outside 220x220x250mm are properly clamped.

## Mandatory Files to Read Before Starting
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_reviewer_m1_2\handoff.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_challenger_m1_1\handoff.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_challenger_m1_2\handoff.md`

## Verification Target
Run:
```powershell
npm test
npm run build
```
ALL test suites must pass 100% cleanly (including `src/test/unit/stress-challenge.test.ts` and `src/test/unit/m1-adversarial-stress.test.ts`), and `npm run build` must complete with zero errors.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Output
Write your handoff report to:
`c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m1_fix\handoff.md`

## 2026-09-20T03:44:38Z
User request received to remediate the 9 root causes and defects across GCodeExecutor, CartesianKinematics, GCodeParser, and MotionInterpolator so that `npm test` passes 100% and `npm run build` succeeds cleanly.

