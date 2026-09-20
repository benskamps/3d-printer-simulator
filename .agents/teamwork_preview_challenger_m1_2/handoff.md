# Milestone 1 Challenger Report: Kinematics & G-Code Parser Engine

**Agent**: `teamwork_preview_challenger_m1_2`  
**Date**: 2026-09-20T03:42:30Z  
**Verdict**: `REQUEST_CHANGES`  
**Parent Conversation ID**: `0473a626-21aa-464d-b2a7-b8a83fbdb25f`  
**Working Directory**: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_challenger_m1_2`  

---

## 1. Observation

1. **Test Execution & Build Verification**:
   - `npm test` executed across all suites:
     ```
     ✓ src/test/unit/kinematics.test.ts (11 tests) 6ms
     ✓ src/test/unit/motion-interpolator.test.ts (9 tests) 14ms
     ✓ src/test/unit/gcode-parser.test.ts (13 tests) 33ms
     ✓ src/test/unit/m1-adversarial-stress.test.ts (27 tests) 82ms

     Test Files  4 passed (4)
          Tests  60 passed (60)
       Duration  924ms
     ```
   - `npm run build` executed successfully:
     ```
     vite v5.4.21 building for production...
     ✓ 31 modules transformed.
     dist/assets/index-CWO9fVRC.js   142.93 kB │ gzip: 45.94 kB
     ✓ built in 1.23s
     ```

2. **Empirical Failure Mode 1: Flow Override in Absolute Extrusion Mode (M82) Triggers Retractions**:
   - Code location: `src/core/kinematics/CartesianKinematics.ts`, lines 222–235:
     ```typescript
     } else {
       if (params.e !== undefined) {
         targetE = params.e;
         deltaE = targetE - curr.e;
       } else {
         targetE = curr.e;
         deltaE = 0;
       }
     }

     // Apply flow override to positive extrusion
     if (deltaE > 0 && this.state.flowOverride !== 100) {
       deltaE *= this.state.flowOverride / 100;
       targetE = curr.e + deltaE;
     }
     ```
   - Empirical test result from `src/test/unit/m1-adversarial-stress.test.ts` (test: `EMPIRICAL CHALLENGE: flow override > 100% in absolute M82 mode causes subsequent moves to retract`):
     - Move 1: Commanded `E10` with 150% flow -> `deltaE = 15.0`, `curr.e` set to `15.0`.
     - Move 2: Commanded `E12` (slicer intended +2mm forward extrusion from previous E10):
       `deltaE = 12 - 15 = -3.0 mm`.
     - Output observed: `Move 2 deltaE with 150% flow in M82: -3`.
     - Forward extrusion is converted into an unintended 3mm retraction (`isRetracting = true`).

3. **Empirical Failure Mode 2: Immediate Jog During PAUSED Print Hijacks Print Queue**:
   - Code location: `src/core/gcode/GCodeExecutor.ts`, lines 668–675:
     ```typescript
     if (parsed.command === 'G0' || parsed.command === 'G1' || parsed.command === 'G28') {
       const res = this.interpolator.step(10.0, 1, true);
       this.kinematics.setCurrentPosition(res.currentPosition);
       if (this.callbacks.onPositionUpdate) {
         this.callbacks.onPositionUpdate(this.kinematics.getPhysicalPosition());
       }
     }
     ```
   - Code location: `src/core/kinematics/MotionInterpolator.ts`, lines 89 & 123:
     `this.queue.push(block)` (pushes jog block to end of queue).
     `this.activeBlock = this.queue.shift()!` (shifts front of queue).
   - Empirical test result from `src/test/unit/m1-adversarial-stress.test.ts` (test: `EMPIRICAL CHALLENGE: jog command while print is PAUSED hijacks queue`):
     - Print paused at `(0.035, 0.035, 0)`.
     - Immediate jog command sent: `G1 X100 Y100 F3000`.
     - Output observed:
       `Pos before jog: { x: 0.035, y: 0.035, z: 0, e: 0 } Pos after jog: { x: 10, y: 10, z: 0, e: 0 }`.
     - The printhead jumped to the next paused print block `(10, 10)` rather than the jog target `(100, 100)`, and the jog move was left in the print queue to execute later upon resume.

4. **Empirical Failure Mode 3: `G92 E0` Layer Resets Wipe Cumulative Filament Metrics**:
   - Code location: `src/core/gcode/GCodeParser.ts`, lines 178–183 & line 345:
     ```typescript
     } else if (command === 'G92') {
       if (parameters.E !== undefined) this.modalE = parameters.E;
     ...
     totalFilamentMm = Math.max(0, this.modalE);
     ```
   - In standard slicer outputs (PrusaSlicer, Bambu Studio, Cura) that insert `G92 E0` at every layer, `this.modalE` is reset to 0 each layer.
   - At the end of `parseDocument()`, `totalFilamentMm` only reflects the filament consumed in the final layer rather than the entire print job. A 100-layer print consuming 1000mm with `G92 E0` per layer reports only ~10mm.

5. **Empirical Failure Mode 4: `abortPrint()` Fails to Clear `activeBlock` in MotionInterpolator**:
   - Code location: `src/core/kinematics/MotionInterpolator.ts`, lines 96–98:
     ```typescript
     public clearQueue(): void {
       this.queue = [];
     }
     ```
   - `abortPrint()` calls `this.interpolator.clearQueue()`, which empties `this.queue` but leaves `this.activeBlock` active.
   - Output observed: `Active block after clearQueue: true`.
   - If a print is aborted mid-move and restarted or stepped, the residual move from the aborted print continues executing.

6. **Empirical Failure Mode 5: `stepForward()` Cannot Reach `COMPLETED` State**:
   - Code location: `src/core/gcode/GCodeExecutor.ts`, lines 317–320:
     ```typescript
     if (this.state === ExecutionState.STEPPING || isStepMode) {
       this.setState(ExecutionState.PAUSED);
       return;
     }
     ```
   - This early return occurs before line 323 (`this.setState(ExecutionState.COMPLETED)`). Stepping through an entire file to completion leaves the executor permanently stuck in `PAUSED`.
   - Output observed: `State after stepping to end: PAUSED`.

7. **Empirical Failure Mode 6: Print Time Estimation Uses Absolute Coordinates Instead of Move Displacement**:
   - Code location: `src/core/gcode/GCodeParser.ts`, lines 323–327:
     ```typescript
     const dx = parsed.parameters.X !== undefined ? parsed.parameters.X : 0;
     const dy = parsed.parameters.Y !== undefined ? parsed.parameters.Y : 0;
     const dz = parsed.parameters.Z !== undefined ? parsed.parameters.Z : 0;
     const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
     ```
   - For absolute moves (`G90`), `parsed.parameters.X` is the target coordinate (e.g. 101mm), NOT the delta `(targetX - currentX)` (e.g. 1mm). This inflates `dist` from 1mm to 142mm, causing `estimatedPrintTimeSeconds` to overestimate print durations by multiples (e.g., Calibration Cube estimated at 6368s / 1h46m despite being a 28m print).

---

## 2. Logic Chain

1. **Flow Override Defect (Observation 1.2)**:
   - In M82 mode, G-code coordinates represent absolute cumulative extrusion targets $E_{target}$.
   - Modifying `curr.e` directly by `deltaE * flowOverride` inflates the printer's internal register.
   - When the next G-code move specifies $E_{next}$, the computed delta is $\Delta E = E_{next} - curr.e$.
   - Because $curr.e > E_{prev}$, $\Delta E$ is artificially reduced or becomes negative ($12 - 15 = -3$).
   - Negative $\Delta E$ triggers a retraction instead of an extrusion, directly breaking user flow adjustment during printing.

2. **Jog Hijacking Defect (Observation 1.3)**:
   - When printing is paused, the interpolator queue holds in-flight print moves.
   - `executeImmediateCommand` queues the jog move to the end of `interpolator.queue` and immediately calls `step(10, 1, true)`.
   - `step(..., true)` dequeues the head of the queue (`this.queue.shift()`), which is the paused print block, not the jog move.
   - The carriage executes a print segment instead of the jog, and leaves the jog command in the queue to be executed upon resume.

3. **Cumulative Filament Metric Defect (Observation 1.4)**:
   - In G-code, `G92 E0` resets the extruder position register to zero at layer transitions.
   - Assigning `totalFilamentMm = Math.max(0, this.modalE)` at document EOF measures only the position of the final layer, discarding all previous extrusion totals.

4. **Abort Queue Defect (Observation 1.5)**:
   - An in-flight motion block is stored in `this.activeBlock`.
   - Calling `clearQueue()` only reinitializes `this.queue = []`.
   - Because `this.activeBlock` remains non-null, subsequent simulation ticks complete the aborted block before processing new commands.

5. **Single-Step Completion Defect (Observation 1.6)**:
   - Line 318 unconditionally returns after setting state to `PAUSED` when `isStepMode` is true.
   - The completion condition at lines 323–328 is never reached, preventing single-stepping from ever completing a print job.

---

## 3. Caveats

1. **Visual Rendering**:
   - The 3D viewport and Three.js scene graph are scheduled for Milestone 3; testing was strictly performed against the headless engine, mathematical models, and state machines.
2. **Thermal & Hardware Bridges**:
   - Thermal dynamics (ODE/PID) and failure simulator bridges are scheduled for Milestone 2; mock bridges were used to verify executor interlock hooks.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

While the foundational architecture (Vite, TypeScript, Cartesian kinematics, lexical tokenizer, and sample model generators) is well-scaffolded and builds cleanly, empirical stress testing has revealed **6 concrete defects** (3 High severity, 3 Medium severity) that must be remediated:

### Required Changes for Worker M1:
1. **Fix M82 Flow Override in `CartesianKinematics.ts`**:
   - Maintain separate logical G-code extruder position and physical extruded filament position, or scale $\Delta E$ without corrupting the reference register for absolute $E$ commands.
2. **Fix Immediate Command / Jog in `GCodeExecutor.ts`**:
   - Prevent jog commands from entering the motion interpolator queue while a print is running/paused, or execute jog commands immediately bypassing the print queue without shifting paused print blocks.
3. **Fix Cumulative Filament Tracking in `GCodeParser.ts`**:
   - Accumulate `deltaE` across all extrusion moves in `parseDocument()` rather than reading `modalE` at EOF, ensuring compatibility with files containing `G92 E0`.
4. **Fix `abortPrint()` and `clearQueue()` in `MotionInterpolator.ts` / `GCodeExecutor.ts`**:
   - Ensure `abortPrint()` calls `interpolator.reset()` or `clearQueue()` sets `this.activeBlock = null` to purge in-progress moves.
5. **Fix Single-Step Completion in `GCodeExecutor.ts`**:
   - Check if `currentLineIndex >= parsedLines.length` and queue is empty before returning early in step mode, transitioning to `COMPLETED` when the last step completes the print.
6. **Fix Print Time Estimation in `GCodeParser.ts`**:
   - Track previous coordinates in `parseDocument()` and compute $\Delta X = X_{new} - X_{old}$ rather than using absolute target coordinates as displacement deltas.

---

## 5. Verification Method

To independently verify all findings and confirm the fixes:

1. **Run Full Test Suite**:
   ```powershell
   npm test
   ```
   *Current state*: 4 test files pass (60 tests), including the empirical stress suite `src/test/unit/m1-adversarial-stress.test.ts`.

2. **Inspect Empirical Challenge Tests in `src/test/unit/m1-adversarial-stress.test.ts`**:
   - Line 486: `jog command while print is PAUSED hijacks queue`
   - Line 517: `abortPrint does not clear activeBlock in MotionInterpolator`
   - Line 545: `stepping forward to end of file never reaches COMPLETED`
   - Line 566: `flow override > 100% in absolute M82 mode causes subsequent moves to retract`

3. **Verify Production Build**:
   ```powershell
   npm run build
   ```
   *Expected result*: Clean bundle generation with 0 TypeScript compilation errors.
