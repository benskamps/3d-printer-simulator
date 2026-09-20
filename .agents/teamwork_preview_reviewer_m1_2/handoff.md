# Milestone 1 Independent Review & Adversarial Stress Report

**Agent**: `teamwork_preview_reviewer_m1_2`  
**Date**: 2026-09-20T03:43:30Z  
**Target Milestone**: Milestone 1 (Foundation, Kinematics, & G-Code Parser Engine)  
**Parent Conversation ID**: `0473a626-21aa-464d-b2a7-b8a83fbdb25f`  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### 1.1 Build & Baseline Test Execution
- Independent run of `npm test`:
  ```
  RUN  v2.1.9 C:/Users/beschipp/Documents/antigravity/zealous-brahmagupta
  ✓ src/test/unit/kinematics.test.ts (11 tests) 6ms
  ✓ src/test/unit/motion-interpolator.test.ts (9 tests) 16ms
  ✓ src/test/unit/gcode-parser.test.ts (13 tests) 41ms
  ✓ src/test/unit/m1-adversarial-stress.test.ts (27 tests) 96ms
  Test Files  4 passed (4)
       Tests  60 passed (60)
    Duration  977ms
  ```
  Exit code: 0.
- Independent run of `npm run build`:
  ```
  > tsc && vite build
  vite v5.4.21 building for production...
  ✓ 31 modules transformed.
  dist/index.html                   0.53 kB
  dist/assets/index-DudCaaiy.css    6.22 kB
  dist/assets/index-CWO9fVRC.js   142.93 kB
  ✓ built in 1.20s
  ```
  Exit code: 0.

### 1.2 Observation of Critical Code Defects

#### Finding 1: Lookahead Replenishment Uses Stale Physical Position, Collapsing All Queued Moves to `(0, 0, 0, 0)`
- **Where**: `src/core/gcode/GCodeExecutor.ts` lines 278–288, 360–423; `src/core/kinematics/CartesianKinematics.ts` lines 198–242.
- **Direct Code Inspection**:
  In `GCodeExecutor.ts`:
  ```typescript
  // Lines 278-280:
  while (this.interpolator.getQueueLength() < 50 && this.currentLineIndex < this.parsedLines.length) {
    const line = this.parsedLines[this.currentLineIndex++];
    this.executeParsedLine(line);
  ```
  And in `executeParsedLine`:
  ```typescript
  // Line 360:
  const startPos = this.kinematics.getState().currentPosition;
  const move = this.kinematics.calculateMove(
    { x: parameters.X, y: parameters.Y, z: parameters.Z, e: parameters.E, f: parameters.F },
    1
  );
  ...
  // Lines 404-422:
  this.interpolator.enqueue({
    commandIndex: this.currentLineIndex,
    layerIndex: this.activeLayerIndex,
    startPosition: startPos,
    targetPosition: move.target,
    ...
  });
  this.kinematics.setTargetPosition(move.target);
  ```
  And in `CartesianKinematics.ts`:
  ```typescript
  // Line 199:
  const curr = this.state.currentPosition;
  let targetX = curr.x;
  ...
  if (params.x !== undefined) targetX = params.x;
  if (params.y !== undefined) targetY = params.y;
  if (params.z !== undefined) targetZ = params.z;
  ```
- **Empirical Execution Result**:
  Running `GCodeExecutor` on `generateQuickPadGCode()` and inspecting the generated `ToolpathSegment`s:
  ```json
  [
    {"startX":0,"startY":0,"startZ":0,"endX":117.5,"endY":102.5,"endZ":0,"extrusionLength":0.525},
    {"startX":0,"startY":0,"startZ":0,"endX":117.5,"endY":117.5,"endZ":0,"extrusionLength":1.05},
    {"startX":0,"startY":0,"startZ":0,"endX":102.5,"endY":117.5,"endZ":0,"extrusionLength":1.575},
    {"startX":0,"startY":0,"startZ":0,"endX":102.5,"endY":102.5,"endZ":0,"extrusionLength":2.1},
    {"startX":0,"startY":0,"startZ":0,"endX":117,"endY":103,"endZ":0,"extrusionLength":2.59}
  ]
  ```
  And inspecting the queued `MotionBlock` items in `interpolator.queue`:
  ```json
  Block 0: start: { x: 0, y: 0, z: 0, e: 0 }, target: { x: 0, y: 0, z: 5, e: 0 }
  Block 1: start: { x: 0, y: 0, z: 0, e: 0 }, target: { x: 102.5, y: 102.5, z: 0, e: 0 }
  Block 2: start: { x: 0, y: 0, z: 0, e: 0 }, target: { x: 0, y: 0, z: 0.2, e: 0 }
  Block 3: start: { x: 0, y: 0, z: 0, e: 0 }, target: { x: 102.5, y: 102.5, z: 0, e: 0 }
  ```

#### Finding 2: Slicer Feature Type State Mutation in Lookahead Window
- **Where**: `src/core/gcode/GCodeExecutor.ts` line 384; `src/core/gcode/GCodeParser.ts` lines 208–229.
- **Direct Code Inspection**:
  In `GCodeExecutor.ts`:
  ```typescript
  type = this.parser.getCurrentToolpathType();
  ```
  In `GCodeParser.ts`:
  ```typescript
  if (comment) {
    this.detectFeatureTypeFromComment(comment);
  }
  ```
- **Empirical Execution Result**:
  When `update()` parses 50 lines ahead in the while loop, line 29 of `quick_pad.gcode` (`";TYPE:FILL"`) mutates `this.parser.currentToolpathType` to `ToolpathType.INFILL`.
  Because `ParsedGCodeLine` does not preserve the feature type at parse time, all earlier perimeter lines (lines 17–28, which were `;TYPE:WALL-OUTER` and `;TYPE:WALL-INNER`) are stamped with `type: "infill"`.

#### Finding 3: Flow Override (`M221`) Inverts Forward Extrusions into Retractions in `M82` Mode
- **Where**: `src/core/kinematics/CartesianKinematics.ts` lines 231–235.
- **Direct Code Inspection**:
  ```typescript
  // Lines 231-235:
  if (deltaE > 0 && this.state.flowOverride !== 100) {
    deltaE *= this.state.flowOverride / 100;
    targetE = curr.e + deltaE;
  }
  ```
- **Empirical Execution Result**:
  In M82 mode with 150% flow:
  Move 1: commands E10 -> `deltaE = 15.0`, `curr.e` becomes 15.
  Move 2: commands E12 (slicer commanded 2mm extrusion from 10 to 12).
  In move 2: `deltaE = targetE - curr.e = 12 - 15 = -3.0 mm`!
  `isRetracting = true`. Setting flow override to 150% turns printing moves into massive retractions!

#### Finding 4: Jog Command During `PAUSED` Print Pops Paused Print Move Instead of Jog Move
- **Where**: `src/core/gcode/GCodeExecutor.ts` lines 653–676.
- **Direct Code Inspection**:
  ```typescript
  this.executeParsedLine(parsed);
  if (parsed.command === 'G0' || parsed.command === 'G1' || parsed.command === 'G28') {
    const res = this.interpolator.step(10.0, 1, true);
    this.kinematics.setCurrentPosition(res.currentPosition);
  ```
- **Empirical Execution Result**:
  `executeParsedLine` pushes the jog move to the back of `interpolator.queue`.
  `interpolator.step(10.0, 1, true)` pops `this.queue.shift()`, which is the paused print block at index 0, NOT the jog move!
  `currentPosition` is updated to the paused print move, corrupting paused print state and failing to execute the jog move.

#### Finding 5: `abortPrint()` Leaves `activeBlock` Intact
- **Where**: `src/core/gcode/GCodeExecutor.ts` line 196; `src/core/kinematics/MotionInterpolator.ts` lines 96–98.
- **Direct Code Inspection**:
  In `GCodeExecutor.ts`:
  ```typescript
  this.interpolator.clearQueue();
  ```
  In `MotionInterpolator.ts`:
  ```typescript
  public clearQueue(): void {
    this.queue = [];
  }
  ```
- **Empirical Execution Result**:
  `this.activeBlock` is not cleared. When a print is aborted mid-motion, `interpolator.getActiveBlock()` remains non-null, causing the residual move to execute or leak into the next print job.

#### Finding 6: Single-Stepping Cannot Reach `COMPLETED`
- **Where**: `src/core/gcode/GCodeExecutor.ts` lines 317–320.
- **Direct Code Inspection**:
  ```typescript
  if (this.state === ExecutionState.STEPPING || isStepMode) {
    this.setState(ExecutionState.PAUSED);
    return;
  }
  // Line 323: Check for print completion is unreachable when isStepMode is true
  if (this.currentLineIndex >= this.parsedLines.length && ...) {
    this.setState(ExecutionState.COMPLETED);
  }
  ```
- **Empirical Execution Result**:
  Stepping through a file to the end permanently leaves the state in `PAUSED`.

#### Finding 7: Print Time Estimation Treats Absolute Bed Coordinates as Delta Vectors
- **Where**: `src/core/gcode/GCodeParser.ts` lines 322–326.
- **Direct Code Inspection**:
  ```typescript
  const dx = parsed.parameters.X !== undefined ? parsed.parameters.X : 0;
  const dy = parsed.parameters.Y !== undefined ? parsed.parameters.Y : 0;
  const dz = parsed.parameters.Z !== undefined ? parsed.parameters.Z : 0;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  ```
- **Empirical Execution Result**:
  In G90 mode, for a move `G1 X101 Y100` following `G1 X100 Y100`, `dx` is treated as 101 and `dy` as 100 (`dist = 142.1mm` instead of `1.0mm`). All segment durations are calculated from the origin (0, 0, 0).

---

## 2. Logic Chain

1. **Premise**: In 3D printing, toolpaths are connected sequences of 3D line segments where segment $i+1$ starts at the end position of segment $i$: $\mathbf{P}_{start}^{(i+1)} = \mathbf{P}_{end}^{(i)}$.
2. **Observation 1.2 (Finding 1)**: `GCodeExecutor.executeParsedLine` uses `this.kinematics.getState().currentPosition` for `startPos` and calculates target coordinates against `currentPosition`. Because `update()` replenishes up to 50 blocks into `interpolator.queue` before the interpolator advances `currentPosition`, all 50 blocks are computed against the unadvanced physical position `(0, 0, 0, 0)`.
3. **Deduction 1**: When coordinates are omitted (e.g., standard G-code omitting unchanged Z or Y), `calculateMove` defaults the missing coordinate to `curr`, which is `(0, 0, 0)`. Thus, Z drops from 5.0 to 0.0 or 0.2 to 0.0 on subsequent moves.
4. **Deduction 2**: In `M82` mode, `deltaE = targetE - curr.e`. Because `curr.e` remains 0 while queuing the 50 blocks, `deltaE` equals the entire cumulative extrusion `targetE`, creating quadratic $O(N^2)$ filament inflation.
5. **Deduction 3**: All toolpath segments output `startX: 0, startY: 0, startZ: 0`. When passed to Milestone 3's Three.js viewport, the toolpath renderer will draw radial spikes radiating from the origin rather than the actual model geometry.
6. **Integrity Violation Assessment**: Worker M1 wrote tests in `src/test/unit/` that selectively checked trivial bounds (`expect(progress.filamentConsumedMm).toBeGreaterThan(10)`) rather than validating toolpath continuity, segment coordinates, or exact filament totals. This self-certified a broken motion pipeline as "100% complete with 33 passed tests".
7. **Conclusion**: The codebase does not meet the Milestone 1 requirements for coordinate kinematics, modal state preservation, and toolpath segment generation. A verdict of `REQUEST_CHANGES` is required.

---

## 3. Caveats

- The TypeScript type definitions (`AxisCoordinates`, `IKinematicState`, `ToolpathSegment`, `ToolpathType`) in `src/core/kinematics/types.ts` are cleanly defined and match `PROJECT.md` contracts.
- The sample G-code generators in `sampleModels.ts` (`quick_pad`, `calibration_cube`, `3d_benchy`) are well-crafted and produce valid G-code text.
- The lexical parsing in `GCodeParser.parseLine` (comment stripping, checksum handling, parameter extraction) is mostly solid; the bugs reside in lookahead state tracking, feature type mutation, and document distance summation.

---

## 4. Conclusion & Required Changes

**Verdict**: **REQUEST_CHANGES**

### Required Fixes:

1. **Fix Lookahead Position Tracking in `GCodeExecutor` (CRITICAL)**:
   - Introduce a `plannerPosition: AxisCoordinates` in `GCodeExecutor` (initialized to `(0, 0, 0, 0)`).
   - In `executeParsedLine`:
     - Calculate moves and modal coordinates using `this.plannerPosition`, NOT `this.kinematics.getState().currentPosition`.
     - Assign `segment.startX = this.plannerPosition.x`, `startY = this.plannerPosition.y`, `startZ = this.plannerPosition.z`.
     - Update `this.plannerPosition = { ...move.target }` after enqueuing the block.
     - Ensure omitted coordinates retain `this.plannerPosition` values.

2. **Fix Toolpath Type Preservation on `ParsedGCodeLine` (CRITICAL)**:
   - Add `toolpathType: ToolpathType` to `ParsedGCodeLine`.
   - Record `toolpathType` at line parse time in `GCodeParser.parseLine()`.
   - In `GCodeExecutor`, use `line.toolpathType` instead of querying the mutated `this.parser.getCurrentToolpathType()`.

3. **Fix Flow Override in `CartesianKinematics` (MAJOR)**:
   - In `CartesianKinematics.calculateMove()`, apply `flowOverride` only to the motion extrusion delta `deltaE`, or track separate `logicalE` (commanded) vs `physicalE` (actual pushed filament), so that `curr.e` matches the slicer's absolute coordinates.

4. **Fix Jog Execution While Paused (MAJOR)**:
   - In `executeImmediateCommand()`, do not step the main interpolator queue if a print is currently active or paused. Either execute immediate moves directly via an urgent block/bypass, or clear the jog after execution without popping paused print moves.

5. **Fix `abortPrint()` and `clearQueue()` (MAJOR)**:
   - Update `MotionInterpolator.clearQueue()` (or add `MotionInterpolator.abort()`) to set `this.activeBlock = null` and reset current position to target of the interrupted block.

6. **Fix `stepForward()` Completion Check (MAJOR)**:
   - In `GCodeExecutor.update()`, place the print completion check before or alongside the step mode return so that stepping to the end transitions state to `ExecutionState.COMPLETED`.

7. **Fix `GCodeParser.parseDocument` Distance Calculation (MAJOR)**:
   - In `parseDocument()`, track `prevX`, `prevY`, `prevZ` and compute `dx = this.modalX - prevX`, `dy = this.modalY - prevY`, `dz = this.modalZ - prevZ` for move distance and duration estimation.
   - Accumulate `totalFilamentMm` by summing positive `deltaE` across moves, rather than relying on `this.modalE` (which resets on `G92 E0`).

8. **Harden Unit Test Suite (INTEGRITY)**:
   - Add tests asserting that for sequential moves, `segment[i].startX === segment[i-1].endX` and `segment[i].startY === segment[i-1].endY`.
   - Assert exact filament consumed for `quick_pad.gcode` (~37.1 mm ± 1 mm), not merely `> 10`.

---

## 5. Verification Method

To independently verify after changes are applied:

1. **Run Full Test Suite**:
   ```powershell
   npm test
   ```
2. **Verify Toolpath Segment Continuity**:
   Execute the verification one-liner:
   ```powershell
   npx tsx -e "import { GCodeExecutor } from './src/core/gcode/GCodeExecutor'; import { generateQuickPadGCode } from './src/core/gcode/sampleModels'; const segs: any[] = []; const ex = new GCodeExecutor({ onToolpathSegment: (s: any) => segs.push(s) }); ex.loadGCode(generateQuickPadGCode()).then(() => { ex.setSpeedMultiplier(100); ex.startPrint(); for(let i=0; i<50; i++) ex.update(0.05); console.log(segs.slice(0, 5)); });"
   ```
   *Expected result*: `startX`, `startY`, and `startZ` of segments 1–4 MUST match the `endX`, `endY`, and `endZ` of segments 0–3 (NOT all zeros).
3. **Verify Build**:
   ```powershell
   npm run build
   ```
