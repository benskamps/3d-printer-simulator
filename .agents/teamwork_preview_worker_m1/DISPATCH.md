# Dispatch: Milestone 1 — Foundation, Kinematics, & G-Code Parser Engine

## Objective
Implement Milestone 1 of the 3D Printer Simulator:
1. Initialize the project scaffolding in the workspace `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta`:
   - `package.json` with scripts (`dev`, `build`, `preview`, `test`), dependencies (React 18/19, Three.js, Lucide React, Tailwind CSS, etc.), and devDependencies (Vite, TypeScript, Vitest, @types/three, @types/react, etc.).
   - `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`.
   - Install dependencies (`npm install`).
2. Implement Core Kinematics & G-Code Engine in `src/core/`:
   - `src/core/kinematics/types.ts`: AxisCoordinates, IKinematicState, ToolpathSegment, ToolpathType.
   - `src/core/kinematics/CartesianKinematics.ts`: Axis tracking (X, Y, Z, E), coordinate transformation, endstop boundaries (220x220x250mm), homing logic (G28), coordinate offsets (G92), feedrate conversion (mm/min to mm/s).
   - `src/core/kinematics/MotionInterpolator.ts`: Trapezoidal / linear interpolation, accumulator-based time budget simulation loop supporting 1x to 100x playback speed multipliers without UI freezing.
   - `src/core/gcode/types.ts`: ParsedGCodeLine, GCodeModelSummary, ExecutionState, IEngineControls.
   - `src/core/gcode/GCodeParser.ts`: Lexical parser, comment stripper (`;`, `//`, `()`), line number / checksum stripping, modal parameter tracking (F, X, Y, Z, E, G90/G91, M82/M83), command tokenizer supporting G0, G1, G28, G90, G91, G92, M104, M109, M140, M190, M106, M107, M82, M83, M220, M221, M114, M117, M73, M84, M112, and graceful fallback for unknown tuning codes.
   - `src/core/gcode/GCodeExecutor.ts`: Execution queue state machine (IDLE, RUNNING, PAUSED, STEPPING, ABORTED, COMPLETED, ERROR), play/pause/step/abort controls, speed multiplier scaling, ETA estimation, cold extrusion guard check hook.
   - `src/core/gcode/sampleModels.ts`: Built-in pre-sliced models:
     - Calibration Cube 20mm (100 layers, perimeter, infill, embossed X/Y/Z)
     - 3DBenchy (curved hull, overhangs, cabin, chimney)
     - Quick Test Pad 15x15mm (5 layers, rapid execution for automated testing)
3. Implement automated unit test suite in `src/test/unit/`:
   - `src/test/unit/gcode-parser.test.ts`: TC-01 through TC-07 (tokenizer, modal states, whitespace, G92 E0 resets, M82/M83 modes, feedrates).
   - `src/test/unit/kinematics.test.ts`: Cartesian coordinate math, homing, feedrate conversion, duration math, boundary clamping.
   - `src/test/unit/motion-interpolator.test.ts`: Time budget accumulator stepping across 1x, 5x, 20x, 100x speed multipliers.
4. Run `npm install` and `npm test` to verify all unit tests pass with 0 errors. Run `npm run build` to verify clean build without TypeScript errors.

## Mandatory Files to Read Before Starting
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_spec_miner_survey_1\handoff.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_explorer_survey_1\handoff.md`

## File Ownership
You exclusively own:
- `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`
- `src/core/kinematics/*`
- `src/core/gcode/*`
- `src/test/unit/*`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.


## Output
Write `handoff.md` in your working directory `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m1\handoff.md` documenting:
- Observation (files created, packages installed)
- Logic Chain (how kinematics & G-code engine were implemented)
- Test verification results (exact commands run and full test outputs)
- Caveats & interfaces for Milestone 2

## 2026-09-20T03:34:10Z
Your identity is teamwork_preview_worker_m1.
Your working directory is:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m1

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please read your assignment in:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m1\DISPATCH.md
and read:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_spec_miner_survey_1\handoff.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_explorer_survey_1\handoff.md

Your task is to implement Milestone 1:
1. Initialize project scaffolding (package.json with vite, react, three, tailwind, vitest; tsconfig, vite config, index.html).
2. Implement Core Kinematics & G-Code Parser Engine in src/core/kinematics/ and src/core/gcode/ per the interface contracts in PROJECT.md.
3. Implement sample pre-sliced models (Calibration Cube, 3DBenchy, Quick Test Pad).
4. Implement and run unit tests with vitest (`npm test`).
5. Verify build (`npm run build`).

Maintain progress.md in your working directory with a "Last visited: [timestamp]" header.
When done, write handoff.md in your working directory and notify the parent via send_message.

