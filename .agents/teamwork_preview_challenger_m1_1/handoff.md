# Milestone 1 Empirical Challenger Report: Kinematics & G-Code Engine

**Agent**: `teamwork_preview_challenger_m1_1`  
**Date**: 2026-09-20T03:44:00Z  
**Verdict**: `REQUEST_CHANGES`  
**Parent Conversation ID**: `0473a626-21aa-464d-b2a7-b8a83fbdb25f`  
**Working Directory**: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_challenger_m1_1`  

---

## 1. Observation

### 1.1 Test Suite & Build Status
- Running `npm run build` succeeds cleanly with exit code 0 (`vite v5.4.21 built in 1.15s`, 0 TypeScript compilation errors).
- Running baseline tests (`src/test/unit/kinematics.test.ts`, `motion-interpolator.test.ts`, `gcode-parser.test.ts`) passes 33 tests because they only test single moves or manual mock parameters.
- Executing our empirical challenge suite (`src/test/unit/stress-challenge.test.ts`) reveals **12 failed tests out of 12** during `npm test`:
  ```
  Test Files  1 failed | 4 passed (5)
       Tests  12 failed | 60 passed (72)
  ```

---

### 1.2 The Lookahead Planning Defect (Critical Root Cause)
**Files**:
- `src/core/gcode/GCodeExecutor.ts` (lines 278–289, 360–423)
- `src/core/kinematics/CartesianKinematics.ts` (lines 181–269)
- `src/core/kinematics/MotionInterpolator.ts` (lines 111–181)

**Direct Observations**:
1. In `GCodeExecutor.ts` lines 278–288:
   ```typescript
   while (this.interpolator.getQueueLength() < 50 && this.currentLineIndex < this.parsedLines.length) {
     const line = this.parsedLines[this.currentLineIndex++];
     this.executeParsedLine(line);
   ...
   ```
2. In `GCodeExecutor.ts` line 360:
   ```typescript
   case 'G0':
   case 'G1': {
     const startPos = this.kinematics.getState().currentPosition;
     const move = this.kinematics.calculateMove(
       { x: parameters.X, y: parameters.Y, z: parameters.Z, e: parameters.E, f: parameters.F },
       1
     );
   ```
3. In `CartesianKinematics.ts` lines 199–215:
   ```typescript
   const curr = this.state.currentPosition;
   ...
   if (this.state.isRelativePositioning) {
     targetX = curr.x + (params.x ?? 0);
   } else {
     targetX = params.x !== undefined ? params.x : curr.x;
   }
   ```
4. In `GCodeExecutor.ts` lines 404–423:
   ```typescript
   this.interpolator.enqueue({
     startPosition: startPos,
     targetPosition: move.target,
   ...
   this.kinematics.setTargetPosition(move.target);
   ```
5. `this.kinematics.state.currentPosition` is **never updated during the enqueuing loop**. It is only updated on line 299 *after* `interpolator.step()` has physically stepped.
6. **Result**: Up to 50 moves are calculated against the stale, un-advanced `currentPosition` = `(0, 0, 0, 0)`.

---

### 1.3 Concrete Failure Modes Observed Verbatim

#### Defect 1: All Toolpath Segments Start from (0, 0, 0) (Starburst Pattern)
- **Test**: `TC-STRESS-01: should produce continuous toolpath segments chained end-to-end`
- **G-Code**: 10x10 square: `G1 X10 Y0`, `G1 X10 Y10`, `G1 X0 Y10`, `G1 X0 Y0`.
- **Observed Emitted Segments**:
  ```
  Segment 0: (0, 0) to (10, 0)
  Segment 1: (0, 0) to (10, 10)
  Segment 2: (0, 0) to (0, 10)
  Segment 3: (0, 0) to (0, 0)
  ```
- **Error**: `AssertionError: expected +0 to be close to 10, received difference is 10` at `expect(segments[1].startX).toBeCloseTo(10)`.
- **Sample Model Impact**: In `quick_pad.gcode`, all 90 segments start at `(0, 0)` rather than forming a 15x15mm square at (102.5, 102.5).

#### Defect 2: Relative Positioning Mode (G91) Moves Collapse to a Single Move
- **Test**: `TC-STRESS-02: should accumulate relative coordinates correctly across multiple queued moves (G91)`
- **G-Code**: `G91`, `G1 X10`, `G1 X10`, `G1 X10`.
- **Observed Position**: `X: 10` instead of `X: 30`.
- **Error**: `AssertionError: expected 10 to be close to 30, received difference is 20`.

#### Defect 3: Relative Extrusion Mode (M83) Extrusions Collapse
- **Test**: `TC-STRESS-03: should accumulate relative extrusion correctly across multiple queued moves (M83)`
- **G-Code**: `M83`, `G1 E5`, `G1 E5`, `G1 E5`.
- **Observed Extruder**: `E: 5` instead of `E: 15`.
- **Error**: `AssertionError: expected 5 to be close to 15, received difference is 10`.

#### Defect 4: Coordinate Soft Limit Clamping is Bypassed During Execution
- **Test**: `TC-STRESS-04: should clamp commanded coordinates to printer build volume (220x220x250) during execution`
- **G-Code**: `G1 X300 Y-50 Z400 F3000`.
- **Observed Position**: `{ x: 300, y: -50, z: 400, e: 0 }`.
- **Error**: `AssertionError: expected 300 to be less than or equal to 220`.
- **Code Observation**: `CartesianKinematics.clampCoordinates()` exists but is never invoked by `calculateMove()` or `executeParsedLine()`.

#### Defect 5: `G92 E0` Layer Resets Erase Cumulative Filament in `parseDocument()`
- **Test**: `TC-STRESS-05: should preserve cumulative filament across G92 E0 layer resets in parseDocument`
- **G-Code**: 3 layers of 100mm, 100mm, 50mm extrusion separated by `G92 E0`.
- **Code Observation**: `GCodeParser.ts` line 183 resets `this.modalE = 0`. Line 345 assigns `totalFilamentMm = Math.max(0, this.modalE)`.
- **Observed Summary**: `totalFilamentMm: 50` instead of `250`.
- **Error**: `AssertionError: expected 50 to be close to 250, received difference is 200`.

#### Defect 6: Print Time Estimation Calculates Distance from Origin
- **Test**: `TC-STRESS-06: should calculate motion time based on displacement delta, not absolute coordinate magnitude`
- **Code Observation**: `GCodeParser.ts` lines 323–326 calculates:
  `const dx = parsed.parameters.X !== undefined ? parsed.parameters.X : 0;`
  `const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);`
  For a 1mm move at (100, 100), `dist` is evaluated as $\sqrt{101^2 + 100^2} \approx 142\text{mm}$.
- **Error**: `AssertionError: expected 5 to be less than 5` (computed 5 seconds for a 1mm move).

#### Defect 7: Carriage Position Yoyos Back to Origin on Block Transitions
- **Test**: `TC-STRESS-07: should maintain continuous position progress without dropping back to origin between moves`
- **G-Code**: Consecutive moves `G1 X10`, `G1 X20`, `G1 X30`.
- **Observed Positions**: `[ 2.5, 5, 7.5, 0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 2.5, 5, 7.5, ... ]`.
- **Error**: `AssertionError: expected 0.9999999999999986 to be greater than or equal to 4.5`. The printhead drops back to 0 at the start of every block.

#### Defect 8: Micro-Segment Extrusion Explodes at 100x Playback Speed
- **Test**: `TC-STRESS-08: should accurately track filament consumption across micro-segments at 100x speed`
- **G-Code**: 100 micro-segments commanding a total of 10.0mm of extrusion.
- **Observed Filament Consumed**: `filamentConsumedMm: 446.43` instead of `10.0`.
- **Error**: `AssertionError: expected 446.43 to be close to 10, received difference is 436.43`.

#### Defect 9: Immediate Jog Command During PAUSED Print Pops Print Move
- **Test**: `TC-STRESS-09: should execute jog target directly without executing pending paused print move`
- **G-Code**: Print paused at (0, 0), jog `G1 X100 Y100` sent.
- **Observed Position**: `pos.x: 10` (popped the queued print block instead of executing jog).
- **Error**: `AssertionError: expected 10 to be close to 100, received difference is 90`.

#### Defect 10: `abortPrint()` Leaves `activeBlock` Intact in `MotionInterpolator`
- **Test**: `TC-STRESS-10: should purge activeBlock upon abortPrint() so aborted moves do not linger`
- **Code Observation**: `MotionInterpolator.clearQueue()` only clears `this.queue = []`, leaving `this.activeBlock` non-null.
- **Error**: `AssertionError: expected { commandIndex: 1, ... } to be null`.

#### Defect 11: Single-Step Mode Never Transitions to `COMPLETED`
- **Test**: `TC-STRESS-11: should transition to COMPLETED when stepped forward to the end of the file`
- **Code Observation**: `GCodeExecutor.ts` line 318 returns early and forces state to `PAUSED` when `isStepMode` is true, bypassing the completion check.
- **Error**: `AssertionError: expected 'PAUSED' to be 'COMPLETED'`.

#### Defect 12: M82 Flow Override Converts Forward Extrusions into Retractions
- **Test**: `TC-STRESS-12: should not convert forward extrusion into retractions when flow override > 100% in M82 mode`
- **Observation**: When flow is 150%, `move1` commands `E10` (yielding $E_{target}=15$). When `move2` commands `E12`, $\Delta E = 12 - 15 = -3\text{mm}$.
- **Error**: `AssertionError: expected -3 to be greater than 0`.

---

## 2. Logic Chain

1. **Planner vs. Execution Separation**:
   - In any motion controller (LinuxCNC, Marlin, Klipper), the motion planner maintains a *planned target position* $P_{planned}$ distinct from the real-time interpolated carriage position $P_{actual}(t)$.
   - In `CartesianKinematics.ts`, `calculateMove()` reads `this.state.currentPosition`, which is the real-time position $P_{actual}(t)$.
   - When `GCodeExecutor.update()` fills its lookahead buffer up to 50 blocks in a synchronous loop, $P_{actual}$ does not advance.
   - Therefore, all 50 queued blocks are planned with `startPosition = P_actual` (Observation 1.2).
   - This directly causes Defect 1 (all toolpath segments start at 0), Defect 2 (relative moves calculate $0 + \Delta$ repeatedly), Defect 3 (relative extrusions calculate $0 + \Delta$ repeatedly), Defect 7 (interpolator resets to 0 on every block), and Defect 8 (extrusion delta calculated against stale base).

2. **Soft Limits Enforcement**:
   - `CartesianKinematics.clampCoordinates()` is implemented and unit-tested in isolation, but `CartesianKinematics.calculateMove()` calculates target positions directly without calling `clampCoordinates()` (Observation 1.3 Defect 4).
   - Consequently, any out-of-bounds move is queued and executed without clamping, violating the soft limits requirement.

3. **G92 Extrusion State Tracking**:
   - Slicers emit `G92 E0` at every layer change to prevent 32-bit floating point precision loss on cumulative $E$.
   - `GCodeParser.ts` sets `this.modalE = 0` on `G92 E0`, and calculates `totalFilamentMm = this.modalE` at EOF (Observation 1.3 Defect 5).
   - Any multi-layer file using `G92 E0` discards all preceding layer filament counts.

4. **Terminal Jog Protocol**:
   - `executeImmediateCommand()` calls `executeParsedLine()` which appends the jog block to the back of `interpolator.queue`, then calls `interpolator.step(10, 1, true)` which pops the *front* of `interpolator.queue`.
   - When a print is paused, the front of the queue is the next paused print block, which gets executed instead of the jog command (Observation 1.3 Defect 9).

---

## 3. Caveats

1. **3D Viewport & WebGL**: Not tested because Three.js rendering and buffer allocation are scheduled for Milestone 3. However, if Defect 1 is not fixed, Milestone 3 will render all filament lines radiating from the origin.
2. **Thermal Dynamics & PID**: Mock thermal bridges were used; full analytical ODE verification is scheduled for Milestone 2.
3. **No Implementation Code Modified**: As an empirical challenger operating under review-only constraints, zero changes were made to `src/core/`. All 12 test assertions in `src/test/unit/stress-challenge.test.ts` serve as an independent, reproducible verification harness.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

Milestone 1 **fails empirical verification**. While basic isolated commands and build scripts pass, the motion planning queue and state machine contain critical architectural defects that break toolpath generation, relative motion, boundary safety, and state transitions.

### Required Actions for Worker M1:
1. **Fix Motion Lookahead Planning Reference in `CartesianKinematics.ts` & `GCodeExecutor.ts`**:
   - Track a `plannedPosition: AxisCoordinates` in `CartesianKinematics` representing the end of the last planned move.
   - `calculateMove()` must calculate deltas, durations, and targets relative to `plannedPosition` (NOT `currentPosition`).
   - `calculateMove()` must update `plannedPosition = move.target`.
   - In `GCodeExecutor.ts`, enqueued blocks must use `startPosition = lastPlannedPosition` and `targetPosition = move.target`.
2. **Enforce Boundary Clamping in `CartesianKinematics.calculateMove()`**:
   - Invoke `clampCoordinates()` on target coordinates before computing distance, duration, and motion blocks.
3. **Fix G92 E0 Accumulation in `GCodeParser.ts`**:
   - Accumulate total filament by summing `deltaE` across moves, or add pre-reset $E$ to a cumulative accumulator upon `G92 E0`.
4. **Fix Distance Math in `GCodeParser.parseDocument()`**:
   - Track previous coordinates `(prevX, prevY, prevZ)` and compute $\Delta = target - prev$, not absolute parameter values. Include travel moves in motion time estimates.
5. **Fix Jog Execution in `GCodeExecutor.ts`**:
   - Execute jog moves without disturbing or popping the paused print queue in `MotionInterpolator`.
6. **Fix `abortPrint()` and `clearQueue()` in `MotionInterpolator.ts`**:
   - Set `this.activeBlock = null` inside `clearQueue()` or `reset()`.
7. **Fix Step Mode Completion in `GCodeExecutor.ts`**:
   - Check if queue is empty and lines are exhausted before setting `PAUSED` in step mode.
8. **Fix M82 Flow Override in `CartesianKinematics.ts`**:
   - Do not mutate the reference coordinate register for subsequent absolute G-code moves when applying flow percentage.

---

## 5. Verification Method

To independently reproduce all 12 defects and verify the future fixes:

1. **Run Full Test Suite**:
   ```powershell
   npm test
   ```
   *Expected result currently*: 12 failing tests in `src/test/unit/stress-challenge.test.ts` detailing exact assertion failures.  
   *Expected result after worker remediation*: 100% passing across all 72 tests.

2. **Run Production Build**:
   ```powershell
   npm run build
   ```
   *Expected result*: `tsc && vite build` completes with 0 errors.

3. **Direct Test File Inspection**:
   - Inspect `src/test/unit/stress-challenge.test.ts` for standalone, self-contained test cases corresponding to TC-STRESS-01 through TC-STRESS-12.
