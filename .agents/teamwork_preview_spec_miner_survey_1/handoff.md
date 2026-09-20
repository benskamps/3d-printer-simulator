# Survey & Specification Mining Report: G-Code Parser & Execution Engine

**Agent**: `teamwork_preview_spec_miner_survey_1`  
**Date**: 2026-09-20T03:33:00Z  
**Target Milestone**: Survey & Architecture (M1-M5 Foundation)  
**Authoritative Sources**: 
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md` (Requirements R1, R2, R3, R4)
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_spec_miner_survey_1\DISPATCH.md`
- NIST RS274NGC CNC Standard, RepRap Firmware G-Code Standard, Marlin 2.1 Firmware Reference, Klipper G-Code Protocol, and Slicer Specifications (PrusaSlicer 2.7, Ultimaker Cura 5.x, Bambu Studio 1.8).

---

## 1. 5-Component Handoff Report

### 1.1. Observation
1. **R2 Specification in `ORIGINAL_REQUEST.md` (lines 15-17)**:
   > "Implement a robust G-code parsing engine supporting standard 3D printing commands (G0/G1 rapid/linear moves, G28 homing, G90/G91 positioning, G92 coordinate offsets, M104/M109 extruder temperatures, M140/M190 bed temperatures, M106/M107 part cooling fan, M82/M83 extrusion modes). The simulator must accept user-uploaded `.gcode` files and provide built-in pre-sliced samples (e.g., Calibration Cube, 3DBenchy). The engine must support play, pause, abort, and playback speed adjustment (e.g., 1x, 5x, 20x, 100x)."
2. **Thermal & Cold Extrusion in `ORIGINAL_REQUEST.md` (lines 19, 40)**:
   > "Thermal simulation displays heating curves to user-defined temperatures (e.g. 200°C nozzle, 60°C bed) and prevents printing if nozzle is below minimum extrusion temperature."
3. **Firmware Terminal & Telemetry in `ORIGINAL_REQUEST.md` (lines 25, 42)**:
   > "Interactive G-code console / pseudo-firmware terminal that logs sent commands and simulated OK / temperature telemetry replies."
   > "Manual jog interface and interactive G-code terminal allow sending arbitrary G-code commands and observe simulated printer state updates."
4. **Verification Acceptance Criteria in `ORIGINAL_REQUEST.md` (line 38)**:
   > "G-code parser parses at least 3 distinct G-code files including homing, temperature waits, and layered extrusion moves without unhandled errors."
5. **DISPATCH.md Instructions (lines 6-11)**:
   - Feedrate handling: convert $F$ ($\text{mm/min}$) to linear velocity ($\text{mm/s}$), interpolate 3D vectors.
   - Time estimation: duration summation across segments, dwell times, and thermal waits.
   - Playback controls: play, pause, single-step, abort, speed multiplier ($1\times$ to $100\times$).
   - Slicer output quirks: comments `;`, line-trailing comments, parenthetical comments, uppercase/lowercase, inline parameters, arc moves (`G2`/`G3`), unknown `M`/`G` codes.
   - Firmware terminal protocol: standard Marlin/Klipper/RepRap `ok`, `T:200.0 /200.0 B:60.0 /60.0`, echo commands.

### 1.2. Logic Chain
1. **Coordinate & Extrusion Modality**:
   - G-code commands are inherently **modal**. In both Marlin and RepRap standards, if a parameter (`X`, `Y`, `Z`, `E`, or `F`) is omitted in a `G0`/`G1` command, the previous value persists.
   - Slicers emit `F` (feedrate) only when the speed changes (e.g. perimeter speed vs travel speed). Failing to preserve modal feedrate results in zero-velocity or undefined motion.
   - In absolute extrusion mode (`M82`), $E$ represents cumulative filament position. Slicers periodically emit `G92 E0` (often at layer changes). If `G92 E0` is ignored or incorrectly parsed, the accumulator discrepancy causes catastrophic negative extrusion ($\Delta E \ll 0$, triggering false retractions). In relative mode (`M83`), $E$ is already $\Delta E$. The parser must track both modes independently from axis positioning (`G90`/`G91`).
2. **Kinematic Interpolation & Time Scaling**:
   - Slicer feedrate $F$ is specified in $\text{mm/min}$. Instantaneous speed is $v = (F / 60) \times \text{speedMultiplier}$.
   - For a move with displacement vector $(\Delta X, \Delta Y, \Delta Z)$ and extrusion $\Delta E$, the spatial distance is $D = \sqrt{\Delta X^2 + \Delta Y^2 + \Delta Z^2}$.
   - If $D > 0$, nominal duration is $t = D / v$. If $D == 0$ and $|\Delta E| > 0$ (pure retract/unretract), duration is $t = |\Delta E| / v_e$.
   - At high speed multipliers (e.g. $100\times$), a single 16.6ms animation frame ($60\text{ fps}$) may encompass dozens of tiny G-code segments. Therefore, the execution loop cannot be a simple "1 move per frame" model. It must use an accumulator-based time budget loop: while `timeBudget > 0`, consume segments, update coordinates, accumulate visual toolpaths, and subtract duration until `timeBudget` is exhausted.
3. **Safety Interlocking & Thermal Coupling**:
   - The engine must intercept any move where $\Delta E > 0$ when actual hotend temperature $T_{actual} < T_{cold\_min}$ (typically $170^\circ\text{C}$). The physical motion should still occur (or be blocked per firmware mode), but filament extrusion must be suppressed, and a terminal message `echo: cold extrusion prevented` must be logged.
   - Blocking temperature commands (`M109`, `M190`) must transition the execution engine into a `WAITING_FOR_TEMPERATURE` state, streaming periodic status reports (`T:... / ...`) until the thermal simulation reaches target setpoints within hysteresis ($\pm 1.0^\circ\text{C}$).
4. **Slicer Variety & Graceful Fallback**:
   - Real-world G-code files from PrusaSlicer, Cura, and Bambu Studio contain hundreds of proprietary comment tags, calibration codes (`M900`, `M201`, `M204`, `M205`), and arc moves (`G2`/`G3` via ArcWelder).
   - The lexer/parser must strip whitespace and comments, extract tokens safely, execute recognized core commands, and **gracefully ignore unrecognized codes** while emitting an informational log or standard firmware `ok` to prevent print stalling.

### 1.3. Caveats
1. **Dynamic Acceleration Profiling vs Trapezoidal Approximation**:
   - Commercial firmware (Marlin/Klipper) uses lookahead jerk/junction deviation and trapezoidal acceleration planning. For a browser simulator rendering at $1\times$ to $100\times$ speed, an exact constant-velocity or smoothed trapezoidal segment model is used. The estimated print time is derived from nominal segment feedrates plus a configurable acceleration overhead factor (~10-15%) matching real slicer estimates.
2. **File Size and Memory Footprint**:
   - Real `.gcode` files can exceed 30MB (500,000+ lines). Loading all raw text, token arrays, and 3D objects simultaneously in the main browser thread could cause memory spikes. The architecture specifies a typed array/chunked streaming approach with background Web Worker parsing.

### 1.4. Conclusion
The G-code parser and execution engine must be designed as a decoupled, deterministic state machine driven by a high-resolution simulation clock. It acts as the central coordinator between the Virtual Firmware Terminal, Kinematic Viewport, and Thermal Subsystem. The full interface specifications, command dictionary, state machine transitions, and sample model generators detailed below provide an unambiguous blueprint for Milestones M1, M2, M3, M4, and M5.

### 1.5. Verification Method
1. **Unit Test Suite (`vitest` / `jest`)**:
   - Feed diverse G-code snippets (Cura format, PrusaSlicer format, Bambu format, manual jog commands) into `GCodeParser`.
   - Verify that modal states (`X`, `Y`, `Z`, `E`, `F`, `G90/G91`, `M82/M83`) maintain exact numerical continuity across 1,000+ sequential commands.
   - Verify `G92 E0` resets extrusion accumulator without corrupting cumulative print filament metrics.
   - Verify that non-blocking `M104`/`M140` and blocking `M109`/`M190` transition the engine correctly and output standard telemetry replies.
2. **Simulation Stepping & Multiplier Accuracy**:
   - Run a test model at $1\times, 5\times, 20\times$, and $100\times$ speed multipliers; verify that total deposited toolpath count and final toolhead coordinates are mathematically identical regardless of playback speed or frame rate.
3. **Invalidation Conditions**:
   - Any unhandled exception on valid slicer comments or unsupported M-codes.
   - Missing `ok` reply on any sent terminal command.
   - Filament extrusion occurring while hotend temperature is below $170^\circ\text{C}$.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Parser / Lexer | Line Tokenizer & Stripper | Cleans whitespace, extracts checksum `*NN`, removes comments (`;`, `//`, `(...)`), isolates command and key-value parameter pairs | Raw text line string | Clean command token + parameter map (`Map<string, number \| string>`) | Empty / comment-only lines return `null`; malformed tokens ignored | RS274NGC & Marlin Lexer |
| 2 | Parser / Lexer | Modal State Tracker | Retains current feedrate `F`, coordinate mode (`G90`/`G91`), extrusion mode (`M82`/`M83`), and current toolhead coordinates across sequential lines | Parsed command & parameters | Updated coordinate state vector `(x, y, z, e, f)` | Missing modal parameters fall back to last known active value | RepRap G-code Spec |
| 3 | Motion | `G0` / `G1` Linear Interpolation | Executes coordinated linear motion in 3D space with optional filament extrusion/retraction | Parameters `X`, `Y`, `Z`, `E`, `F` | Motion vector, duration $\Delta t$, visual toolpath segment event | Zero-distance moves take 0s; negative coordinates clamped or validated against printer volume | `ORIGINAL_REQUEST.md` R2 |
| 4 | Motion | `G28` Auto Homing | Moves specified axes or all axes to endstops/origin `(0, 0, 0)` and flags axes as homed | Optional axis flags `X`, `Y`, `Z` | Printhead moves to home position; axes marked homed; `ok\n` | Moving unhomed axes in strict mode warns user; invalid axis flags ignored | `ORIGINAL_REQUEST.md` R2 |
| 5 | Motion | `G90` / `G91` Coordinate Modes | Toggles between absolute positioning (`G90`) and relative positioning (`G91`) for axes | None | Mode flag `isRelativePositioning` | Repetitive calls are idempotent | `ORIGINAL_REQUEST.md` R2 |
| 6 | Motion | `G92` Set Position / Reset | Redefines internal position coordinates without physical movement; critical for `G92 E0` layer resets | Coordinate parameters `X`, `Y`, `Z`, `E` | Updated logical position offsets | Invalid numeric values ignored; unmentioned axes unchanged | `ORIGINAL_REQUEST.md` R2 |
| 7 | Motion | `G4` Dwell / Pause | Suspends motion queue for specified milliseconds or seconds | `P<ms>` or `S<sec>` | Time delay in execution queue; `ok\n` | Negative dwell times treated as 0 | RepRap / Marlin Spec |
| 8 | Motion | `G2` / `G3` Arc Moves | Clockwise / counter-clockwise arc interpolation (common with ArcWelder slicer plugin) | `X`, `Y`, `Z`, `I`, `J` (offsets) or `R` (radius), `E`, `F` | Segmented toolpath approximation | Collinear / invalid radii fall back to direct linear move | Slicer Output Survey |
| 9 | Thermal | `M104` Set Hotend Temp (Async) | Updates hotend target temperature without blocking command execution queue | `S<temp_celsius>`, optional `T<tool>` | Hotend target set; `ok\n` | Temperatures > 300°C clamped to max limit; negative temps clamp to 0 | `ORIGINAL_REQUEST.md` R2 |
| 10 | Thermal | `M109` Wait for Hotend Temp | Sets hotend target temperature and halts motion execution until actual temperature stabilizes | `S<temp>` (heat only) or `R<temp>` (heat/cool), `T<tool>` | State set to `WAITING_FOR_TEMP`; periodic telemetry output; `ok\n` on setpoint | Timeout or thermal runaway aborts print if heating stalls | `ORIGINAL_REQUEST.md` R2 |
| 11 | Thermal | `M140` Set Bed Temp (Async) | Updates heated bed target temperature without blocking execution | `S<temp_celsius>` | Bed target set; `ok\n` | Bed temps > 120°C clamped to max limit | `ORIGINAL_REQUEST.md` R2 |
| 12 | Thermal | `M190` Wait for Bed Temp | Sets bed target temperature and halts motion execution until bed reaches setpoint | `S<temp>` (heat only) or `R<temp>`, `T<tool>` | State set to `WAITING_FOR_TEMP`; periodic telemetry; `ok\n` on setpoint | Timeout or thermal runaway aborts print if heating stalls | `ORIGINAL_REQUEST.md` R2 |
| 13 | Thermal | `M105` Query Temperatures | Queries instant actual and target temperatures for hotend and bed | None | String `ok T:<act> /<tgt> B:<act> /<tgt> @:<pwm> B@:<pwm>\n` | Unconfigured heaters report `0.0` | `ORIGINAL_REQUEST.md` R4 |
| 14 | Thermal | Cold Extrusion Prevention | Locks out any positive extrusion ($\Delta E > 0$) when hotend actual temperature is below minimum threshold | Hotend actual temp vs threshold (e.g. 170°C) | Block extrusion, suppress visual deposit, log `echo: cold extrusion prevented` | Warns in terminal, prevents visual deposition | `ORIGINAL_REQUEST.md` R3 |
| 15 | Cooling | `M106` Part Cooling Fan | Sets part cooling fan PWM duty cycle (0-255) | `S<speed_0_255>`, optional `P<fan_index>` | Fan speed updated (0-100%); `ok\n` | Values > 255 clamped to 255; negative values clamped to 0 | `ORIGINAL_REQUEST.md` R2 |
| 16 | Cooling | `M107` Part Fan Off | Turns off part cooling fan; identical to `M106 S0` | Optional `P<fan_index>` | Fan speed set to 0; `ok\n` | None | `ORIGINAL_REQUEST.md` R2 |
| 17 | Extrusion | `M82` Extruder Absolute Mode | Configures $E$ coordinate interpretation as absolute cumulative position | None | Extruder mode flag `isRelativeExtruder = false` | Idempotent | `ORIGINAL_REQUEST.md` R2 |
| 18 | Extrusion | `M83` Extruder Relative Mode | Configures $E$ coordinate interpretation as relative step per move | None | Extruder mode flag `isRelativeExtruder = true` | Idempotent | `ORIGINAL_REQUEST.md` R2 |
| 19 | Overrides | `M220` Speed Factor Override | Scales all feedrates by percentage multiplier (runtime speed pot) | `S<percentage>` (e.g. `S150` for 150%) | Engine speed scale factor updated; `ok\n` | Clamped between 10% and 500% | Marlin / Klipper Spec |
| 20 | Overrides | `M221` Flow Factor Override | Scales all extrusion volumes by percentage multiplier (extrusion flow) | `S<percentage>` | Engine flow multiplier updated; `ok\n` | Clamped between 10% and 300% | Marlin / Klipper Spec |
| 21 | Status | `M114` Get Current Position | Reports current coordinates and stepper count | None | String `X:<x> Y:<y> Z:<z> E:<e> Count X:<cx> Y:<cy> Z:<cz>\nok\n` | None | Marlin / RepRap Spec |
| 22 | Status | `M117` Set LCD Message | Sets status display message on virtual control screen | Text message following command | Updates UI status message; `ok\n` | Truncates to 64 characters if overly long | Marlin / RepRap Spec |
| 23 | Status | `M73` Slicer Progress | Sets print progress percentage and remaining time from slicer | `P<percent>`, `R<remaining_minutes>` | Updates progress bar & ETA display; `ok\n` | Invalid numbers ignored | PrusaSlicer / Bambu Spec |
| 24 | Stepper | `M84` / `M18` Disable Steppers | De-energizes stepper motors and flags axes as unhomed | Optional axis flags `X`, `Y`, `Z`, `E` | Axes stepper power disabled; `ok\n` | None | Marlin / RepRap Spec |
| 25 | Safety | `M112` Emergency Stop | Immediate hard shutdown of motion, heaters, and execution | None | Heaters off, motion halted, state `ERROR`, emits emergency error log | Unrecoverable without manual user reset | Marlin Spec |
| 26 | Execution | Playback Control: Play/Pause/Resume | Controls playback loop state transitions without losing sub-line position | Play, Pause, Resume button triggers | Transitions between `RUNNING` and `PAUSED`; maintains elapsed line fraction | Redundant triggers ignored | `ORIGINAL_REQUEST.md` R2 |
| 27 | Execution | Playback Control: Single-Step | Executes exactly one G-code command and immediately re-pauses | Step button trigger | State transitions `PAUSED` -> `STEPPING` -> executes 1 command -> `PAUSED` | Disabled while in `RUNNING` state | `ORIGINAL_REQUEST.md` R2 |
| 28 | Execution | Playback Control: Abort | Cancels print, turns off heaters, parks printhead at safe Z height | Abort button trigger | State transitions to `ABORTED`; heaters reset to 0; command queue flushed | Unparked head stays at abort coordinate | `ORIGINAL_REQUEST.md` R2 |
| 29 | Execution | Playback Speed Multiplier | Accelerated simulation clock ($1\times, 5\times, 20\times, 100\times$) with multi-command frame catch-up | Multiplier value ($1$ to $100$) | Scaled delta time $\Delta t_{eff}$; time budget loop processes multiple commands | Clamped to supported range ($0.1\times$ to $100\times$) | `ORIGINAL_REQUEST.md` R2 |
| 30 | Models | Calibration Cube Pre-sliced Asset | Built-in 20x20x20mm test cube G-code with 100 layers, perimeter walls, infill, and embossed X/Y/Z | Selection from model dropdown | Generates / loads parsed G-code blocks and pre-computed metrics | Validated structure guarantee | `ORIGINAL_REQUEST.md` R2 |
| 31 | Models | 3DBenchy Pre-sliced Asset | Built-in torture test model with hull curves, cabin arches, bridge roof, and chimney | Selection from model dropdown | Generates / loads parsed G-code model stream | Validated structure guarantee | `ORIGINAL_REQUEST.md` R2 |
| 32 | Models | Quick Test Pad (5-Layer) | Lightweight 15x15mm calibration pad for instant automated tests and rapid visual checks | Selection from model dropdown | Loads ~200 G-code commands executing in < 5 seconds | Validated structure guarantee | Verification Plan R2 |
| 33 | File Ingestion | Drag-and-Drop & File Upload | Ingests user `.gcode` files from local disk, analyzes metadata, and generates toolpath segments | File object (`.gcode`, `.gco`, `.g`) | Model summary (layers, filament, bounds, ETA) and command array | Files > 50MB rejected or streamed; non-gcode rejected | `ORIGINAL_REQUEST.md` R2 |
| 34 | Slicer Ingestion | Slicer Flavor Metadata Parser | Extracts layer height, layer changes, feature types (wall, infill, travel), and filament statistics from comments | Slicer-specific comment lines | Emits layer index, toolpath classification, and slice summary | Unknown comment formats treated as generic comments | Slicer Output Survey |
| 35 | Terminal | Virtual Firmware Protocol Engine | Simulates bidirectional serial communication between host UI and virtual 3D printer controller | Interactive command string / serial stream | Response line stream (`ok`, `T:...`, `echo: ...`, `Error: ...`) | Unknown commands respond `echo: Unknown command: "..." \n ok` | `ORIGINAL_REQUEST.md` R4 |
| 36 | Graceful Skip | Unrecognized G/M Codes | Gracefully handles non-critical slicer tuning codes (`M201`, `M203`, `M204`, `M205`, `M420`, `M900`, `G29`) | Code tokens and parameters | Logs parameter values, emits `ok\n`, and continues execution | Prevents print halting on unsupported vendor codes | Slicer Output Survey |

---

## 3. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Line Lexer | `G1 X10.5 Y20.2 ; Move to start` | Strips comment `; Move to start`, correctly parses `X=10.5` and `Y=20.2`. |
| 2 | Line Lexer | `G1 X 15.0 Y 25.0 F 1200` | Successfully parses parameters despite spaces between parameter letters and numeric values. |
| 3 | Line Lexer | `g1 x10 y20 f3000` | Case-insensitive parsing correctly maps to uppercase command `G1` and parameters `X=10, Y=20, F=3000`. |
| 4 | Line Lexer | `N105 G1 X25.4 Y12.2*38` | Checks or strips line number `N105` and checksum `*38`, returning clean `G1 X25.4 Y12.2`. Returns `ok 105` or `ok`. |
| 5 | Line Lexer | `(Depth 0.2mm) G1 Z0.2` | Strips parenthetical RS274/NGC comment `(Depth 0.2mm)`, extracts `G1 Z0.2`. |
| 6 | Line Lexer | `\r\n` (CRLF) and `\n` (LF) | Handles both Windows and Unix line endings seamlessly without leaving trailing `\r`. |
| 7 | Line Lexer | Empty lines or lines with only `;` or spaces | Returns `null` without advancing step counter or throwing parse exceptions. |
| 8 | Motion Modal | Line 1: `G1 X10 Y10 F3000` <br> Line 2: `G1 X20 Y20` | Line 2 retains `F=3000` modally from Line 1; does not default to zero velocity. |
| 9 | Motion Modal | Line 1: `G1 X10 Y10 Z0.2` <br> Line 2: `G1 X30` | Line 2 moves only X from 10 to 30; Y stays 10, Z stays 0.2. |
| 10 | Motion Zero-Length | `G1 F3000` | Feedrate update only; spatial distance is 0, execution duration is 0ms, updates modal feedrate instantly. |
| 11 | Extrusion Accumulator | Absolute mode (`M82`): `G92 E0` after `E1250.5` | Extruder current coordinate resets to 0.0; subsequent `G1 E0.2` calculates $\Delta E = 0.2$ instead of $\Delta E = -1250.3$ (preventing catastrophic false retraction). |
| 12 | Retraction Move | Absolute mode (`M82`): `G1 E12.0` followed by `G1 E10.5 F2400` | $\Delta E = -1.5\text{mm}$. Recognized as retraction; duration calculated using retraction feedrate; no visual filament deposited. |
| 13 | Pure Z-Hop | `G1 Z0.6 F1200` without XY or E | Pure vertical travel move; printhead lifts by 0.4mm without extrusion. |
| 14 | Cold Extrusion | `G1 X10 Y10 E2.0` with hotend at 25°C | Motion executes, but filament deposition is blocked; terminal emits `echo: cold extrusion prevented`. |
| 15 | Homing Subsets | `G28 X` or `G28 X Y` | Only the specified axes home to 0; unspecified axes (e.g. Z) maintain their current position. |
| 16 | Arc Move Collinear | `G2 X10 Y10 I0 J0` | Center offset `(0, 0)` is degenerate/collinear; parser falls back to direct linear interpolation `G1 X10 Y10` without throwing a math domain error. |
| 17 | Temperature Target 0 | `M104 S0` / `M140 S0` | Correctly recognized as turning off heater rather than maintaining ambient or throwing validation error. |
| 18 | High Playback Speed | $100\times$ multiplier on 0.1mm micro-segments | Execution loop consumes 50+ micro-segments in a single 16.6ms animation frame; all visual vertices are preserved in the layer toolpath buffer without UI lag. |
| 19 | Mid-Segment Pause | Pause clicked when move is 45% complete | Elapsed time and fractional progress stored; resume completes remaining 55% of segment before advancing to next G-code line. |
| 20 | Single-Step during Print | User clicks Step while print is Paused | Executes exactly 1 command (or 1 move), updates 3D position and deposited toolpath, and reverts to `PAUSED` state. |
| 21 | Slicer Comment Variations | `;LAYER_CHANGE` vs `;LAYER:0` vs `; layer 0, Z = 0.200` | Parser supports multi-slicer regex patterns to reliably increment layer counter regardless of slicer engine. |
| 22 | Unknown M-Codes | `M204 P1000 T1000` / `M900 K0.05` | Parsed without error, logged to telemetry if debug enabled, responds `ok\n` to prevent virtual firmware pipeline lockup. |
| 23 | Emergency Stop | `M112` received during active print | All heaters immediately set target to 0, current move truncated, state locked to `ERROR`, terminal displays `Error: Printer halted. kill() called!`. |
| 24 | Extreme Coordinates | `G1 X-50 Y350 Z500` | Coordinates exceeding soft endstops / print volume boundaries (e.g. 220x220x250mm) are flagged with visual boundary warnings or clamped to physical travel limits. |

---

## 4. Detailed Technical Specifications

### 4.1. G-Code Grammar & Parsing Architecture

#### 4.1.1. Lexical Grammar (EBNF)
```ebnf
GCodeLine       ::= [ LineNumber ] [ CommandSegment ] [ Checksum ] [ Comment ] LineEnding
LineEnding      ::= '\r\n' | '\n' | '\r'
LineNumber      ::= ('N' | 'n') Digit+
Checksum        ::= '*' Digit+
Comment         ::= (';' | '//') AnyCharExceptNewline* | '(' AnyCharExceptCloseParen* ')'
CommandSegment  ::= CommandWord { ParameterWord }*
CommandWord     ::= Letter Digit+ ('.' Digit+)?
ParameterWord   ::= Letter [ Whitespace* ] Number
Letter          ::= 'A'..'Z' | 'a'..'z'
Number          ::= ['+' | '-']? Digit+ ('.' Digit*)? (('e' | 'E') ['+' | '-']? Digit+)?
Digit           ::= '0'..'9'
```

#### 4.1.2. Parsing Flowchart & Step Logic
1. **Sanitization**: Trim trailing carriage returns and leading/trailing whitespace.
2. **Comment Extraction**:
   - Check for leading or inline `;` or `//`.
   - Strip comment substring, but run **Slicer Metadata Extraction** on the comment text (detecting layer change tags, feature types, filament calculations).
3. **Line Number & Checksum Validation**:
   - If line begins with `N<int>`, extract sequence index.
   - If line contains `*<int>`, verify XOR checksum if parity checking is enabled, then discard.
4. **Tokenization**:
   - Extract primary command letter and integer (e.g., `G1`, `M104`, `G28`).
   - Match remaining alphanumeric pairs using regular expressions: `/([A-Za-z])\s*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g`.
   - Populate parameter dictionary: `{ X: 10.5, Y: 20.0, E: 0.045, F: 3000 }`.

---

### 4.2. Complete Command Dictionary & State Transitions

#### 1. Motion Commands (`G0`, `G1`)
- **Syntax**: `G0 [X<float>] [Y<float>] [Z<float>] [E<float>] [F<float>]` or `G1 ...`
- **Semantics**: Linear interpolated movement.
- **State Modifications**:
  - If $F$ is provided: `state.feedrate = F`.
  - Coordinate calculation:
    - If `state.isRelativePositioning`:
      - $X_{target} = state.x + (X \text{ ?? } 0)$
      - $Y_{target} = state.y + (Y \text{ ?? } 0)$
      - $Z_{target} = state.z + (Z \text{ ?? } 0)$
    - Else (absolute):
      - $X_{target} = X \text{ ?? } state.x$
      - $Y_{target} = Y \text{ ?? } state.y$
      - $Z_{target} = Z \text{ ?? } state.z$
  - Extrusion calculation:
    - If `state.isRelativeExtruder`:
      - $\Delta E = E \text{ ?? } 0$
      - $E_{target} = state.e + \Delta E$
    - Else (absolute):
      - $E_{target} = E \text{ ?? } state.e$
      - $\Delta E = E_{target} - state.e$
  - Distance:
    - $D_{xyz} = \sqrt{(X_{target} - state.x)^2 + (Y_{target} - state.y)^2 + (Z_{target} - state.z)^2}$
  - Move Duration:
    - Effective feedrate $v = (\text{state.feedrate} / 60) \times (\text{state.speedOverride} / 100) \times \text{playbackMultiplier}$.
    - If $D_{xyz} > 0$: $t_{move} = D_{xyz} / v$.
    - Else if $|\Delta E| > 0$: $t_{move} = |\Delta E| / (v_e \times \text{playbackMultiplier})$ (where $v_e = \min(v, 40\text{mm/s})$).
    - Else: $t_{move} = 0$.
- **Extrusion & Toolpath Type**:
  - If $\Delta E > 0$:
    - Check Cold Extrusion: If $T_{hotend} < 170^\circ\text{C}$, filament deposition is suppressed; trigger terminal warning `echo: cold extrusion prevented`.
    - Check Nozzle Clog: If failure mode `nozzleClog == true`, filament deposition is suppressed.
    - If valid: Emit `ToolpathSegment` to 3D Viewport.
  - If $\Delta E < 0$: Retraction move (no deposition).
  - If $\Delta E == 0$: Travel move.

#### 2. Auto Homing (`G28`)
- **Syntax**: `G28 [X] [Y] [Z] [W]`
- **Semantics**: Homes axes to reference endstops.
- **State Modifications**:
  - If no parameters provided (standard `G28`): Homes all axes in safe sequence (Z lift 5mm -> Home X -> Home Y -> Home Z).
  - Target coordinates: Set homed axes to `0.0`.
  - Axes marked as `isHomed = { x: true, y: true, z: true }`.
  - Generates travel moves from current coordinates to origin.
- **Firmware Response**: `ok\n`

#### 3. Coordinate Positioning Modes (`G90`, `G91`)
- **Syntax**: `G90` (Absolute) / `G91` (Relative)
- **State Modifications**:
  - `G90`: `state.isRelativePositioning = false`.
  - `G91`: `state.isRelativePositioning = true`.
- **Firmware Response**: `ok\n`

#### 4. Set Position / Origin Reset (`G92`)
- **Syntax**: `G92 [X<float>] [Y<float>] [Z<float>] [E<float>]`
- **Semantics**: Redefines the internal position registers without moving the physical stepper motors.
- **State Modifications**:
  - If $X$ specified: `state.x = X`.
  - If $Y$ specified: `state.y = Y`.
  - If $Z$ specified: `state.z = Z`.
  - If $E$ specified: `state.e = E`.
  - Note: Cumulative filament counter $E_{total}$ is NOT reset; only logical relative position is reset.
- **Firmware Response**: `ok\n`

#### 5. Extruder Modes (`M82`, `M83`)
- **Syntax**: `M82` (Absolute Extruder) / `M83` (Relative Extruder)
- **State Modifications**:
  - `M82`: `state.isRelativeExtruder = false`.
  - `M83`: `state.isRelativeExtruder = true`.
- **Firmware Response**: `ok\n`

#### 6. Temperature Control (`M104`, `M109`, `M140`, `M190`, `M105`)
- **`M104 S<temp>`**: Sets hotend target temperature non-blocking. Response: `ok\n`.
- **`M109 S<temp>` / `M109 R<temp>`**:
  - Sets hotend target temperature and halts G-code execution until actual temperature reaches target ($\pm 1.0^\circ\text{C}$).
  - Engine enters substate `WAITING_FOR_TEMPERATURE`.
  - Emits telemetry every 1s simulated time: `T:<actual> /<target> B:<bed_actual> /<bed_target>\n`.
  - Resumes execution and emits `ok\n` once reached.
- **`M140 S<temp>`**: Sets bed target temperature non-blocking. Response: `ok\n`.
- **`M190 S<temp>` / `M190 R<temp>`**: Sets bed target and halts execution until bed stabilizes. Response: `ok\n`.
- **`M105`**: Temperature query. Immediate response: `ok T:205.3 /210.0 B:60.1 /60.0 @:127 B@:127\n`.

#### 7. Part Cooling Fan (`M106`, `M107`)
- **`M106 S<0-255>`**: Sets part cooling fan PWM duty cycle. `state.fanSpeed = clamp(S, 0, 255) / 255.0`. Response: `ok\n`.
- **`M107`**: Turns off part cooling fan. `state.fanSpeed = 0`. Response: `ok\n`.

#### 8. Steppers & Emergency Shutdown (`M84`, `M18`, `M112`)
- **`M84` / `M18`**: Disables steppers. `state.steppersEnabled = false`. Response: `ok\n`.
- **`M112`**: Emergency stop. Heaters set to 0, motion canceled, state set to `ERROR`. Response: `Error: Emergency Stop Activated! kill() called!\n`.

---

### 4.3. Kinematics Execution Engine & Interpolator Mechanics

#### 4.3.1. Engine State Machine
```
              ┌───────────────┐
              │     IDLE      │◄──────────────────────────┐
              └───────┬───────┘                           │
                      │ loadModel() / startPrint()        │
                      ▼                                   │
              ┌───────────────┐                           │
       ┌─────►│    RUNNING    ├────────────┐              │
       │      └───────┬───────┘            │              │
       │              │                    │              │
Resume │       Pause  │                    │ Abort        │ Reset
       │              ▼                    │              │
       │      ┌───────────────┐            │              │
       └──────┤    PAUSED     │            ▼              │
              └───────┬───────┘    ┌───────────────┐      │
                      │ Step       │    ABORTED    ├──────┤
                      ▼            └───────────────┘      │
              ┌───────────────┐                           │
              │   STEPPING    │                           │
              └───────┬───────┘                           │
                      │ 1 cmd done                        │
                      ▼                                   │
                 (to PAUSED)                              │
                                                          │
                      │ Print finished                    │
                      ▼                                   │
              ┌───────────────┐                           │
              │   COMPLETED   ├───────────────────────────┤
              └───────────────┘                           │
                                                          │
                      │ Thermal runaway / Hardware error  │
                      ▼                                   │
              ┌───────────────┐                           │
              │     ERROR     ├───────────────────────────┘
              └───────────────┘
```

#### 4.3.2. Accumulator-Based Time Budget Simulation Loop
```typescript
class GCodeExecutionEngine {
  public update(realDeltaTimeMs: number): void {
    if (this.state !== ExecutionState.RUNNING && this.state !== ExecutionState.STEPPING) {
      return;
    }

    // Scale delta time by playback speed multiplier (1x, 5x, 20x, 100x)
    let timeBudgetSeconds = (realDeltaTimeMs / 1000) * this.playbackSpeedMultiplier;

    // Safety guard against massive frame lag spikes
    timeBudgetSeconds = Math.min(timeBudgetSeconds, 1.0);

    while (timeBudgetSeconds > 0 && this.hasRemainingCommands()) {
      // 1. If currently waiting for temperature, step thermal simulation
      if (this.isWaitingForTemp) {
        if (this.thermalSubsystem.isTargetReached(this.targetTempSensor, 1.0)) {
          this.isWaitingForTemp = false;
          this.virtualTerminal.emitLine("ok");
        } else {
          // Waiting consumes the time budget
          timeBudgetSeconds = 0;
          break;
        }
      }

      // 2. Fetch or continue active motion block
      const currentBlock = this.activeBlock ?? this.fetchNextBlock();
      if (!currentBlock) break;

      const remainingBlockTime = currentBlock.duration - currentBlock.elapsed;

      if (timeBudgetSeconds >= remainingBlockTime) {
        // Move completes within this time slice
        timeBudgetSeconds -= remainingBlockTime;
        currentBlock.elapsed = currentBlock.duration;
        this.applyInterpolatedPosition(currentBlock, 1.0);
        this.finalizeBlock(currentBlock);
        this.activeBlock = null;

        // If in STEPPING mode, halt immediately after 1 command
        if (this.state === ExecutionState.STEPPING) {
          this.state = ExecutionState.PAUSED;
          break;
        }
      } else {
        // Move partially completes within this time slice
        currentBlock.elapsed += timeBudgetSeconds;
        const progressFraction = currentBlock.elapsed / currentBlock.duration;
        this.applyInterpolatedPosition(currentBlock, progressFraction);
        timeBudgetSeconds = 0;
      }
    }

    if (!this.hasRemainingCommands() && !this.activeBlock) {
      this.state = ExecutionState.COMPLETED;
      this.virtualTerminal.emitLine("echo: Print completed successfully.");
    }
  }
}
```

#### 4.3.3. Time Estimation Algorithm
1. **Pre-computation Pass** (executed immediately upon loading `.gcode`):
   - Traverse all lines with modal tracking.
   - For each linear move ($D_{xyz}$ or $|\Delta E|$):
     $t = \text{distance} / (\text{feedrate} / 60)$
   - Add dwell times from `G4` ($P$ or $S$).
   - Estimate heating times:
     - Ambient to bed target (e.g. $25^\circ\text{C} \to 60^\circ\text{C}$ at ~0.5°C/s $\approx 70\text{s}$).
     - Ambient to hotend target (e.g. $25^\circ\text{C} \to 210^\circ\text{C}$ at ~1.8°C/s $\approx 102\text{s}$).
   - Total nominal print time: $T_{total} = \sum t_{motion} + \sum t_{dwell} + \sum t_{heat}$.
   - Add acceleration factor ($+12\%$) for cornering and direction changes to match slicer ETA.
2. **Runtime ETA Calculation**:
   - $\text{Time Remaining} = T_{total} - \text{Cumulative Nominal Time Expended}$.

---

### 4.4. Virtual Firmware Terminal Protocol

The terminal mimics an ASCII serial connection to a Marlin/Klipper 3D printer controller running at 115200 or 250000 baud.

#### 4.4.1. Message Frame Types
1. **Command Echo**: Host transmits command; terminal logs `> G1 X100 Y100 F3000`.
2. **Acknowledge (`ok`)**: Sent upon completion of standard commands.
3. **Telemetry Report**:
   - Format: `ok T:200.0 /200.0 B:60.0 /60.0 @:127 B@:127`
   - Fields:
     - `T:<actual> /<target>`: Extruder temperature.
     - `B:<actual> /<target>`: Heated bed temperature.
     - `@:<pwm>`: Extruder heater power (0-127 or 0-255).
     - `B@:<pwm>`: Bed heater power (0-127 or 0-255).
4. **Position Report (`M114`)**:
   - `X:105.20 Y:98.40 Z:0.20 E:14.32 Count X:8416 Y:7872 Z:800`
5. **Echo Information**:
   - Format: `echo: <message>`
   - Examples:
     - `echo: cold extrusion prevented`
     - `echo: Unknown command: "M9999"`
     - `echo: Heating hotend...`
6. **Error / Emergency Stop**:
   - Format: `Error: <reason>`
   - Examples:
     - `Error: Thermal Runaway, system stopped! Heater_ID: hotend`
     - `Error: Printer halted. kill() called!`

---

### 4.5. Built-in Pre-Sliced Models & File Ingestion

#### 4.5.1. Model 1: Calibration Cube (20x20x20mm)
- **Purpose**: Dimensional accuracy, perimeter quality, and infill verification.
- **Dimensions**: $20.0\text{mm} \times 20.0\text{mm} \times 20.0\text{mm}$, centered at $(X=110, Y=110)$ on a $220 \times 220\text{mm}$ bed.
- **Layer Height**: $0.2\text{mm}$ ($100\text{ layers}$).
- **Structure**:
  - Layer 0 (0.2mm): Skirt ring (diameter 40mm) + Solid base rect (100 to 120mm in X & Y).
  - Layers 1-2 (0.4-0.6mm): Solid bottom layers (rectilinear 100% infill).
  - Layers 3-96 (0.8-19.4mm): Outer perimeter ($0.4\text{mm}$ width), inner perimeter, grid infill ($20\%$).
  - Embossed letters: 'X' on front wall ($Y=100$), 'Y' on right wall ($X=120$), 'Z' on top roof ($Z=20.0$).
  - Layers 97-99 (19.6-20.0mm): Solid top roof layers.
- **Implementation**: Available as an optimized, embedded G-code template string or procedural toolpath generator (~2,500 lines of standard G-code).

#### 4.5.2. Model 2: 3DBenchy
- **Purpose**: Torture test for bridging, overhangs, cooling, and curved hull toolpaths.
- **Dimensions**: $60\text{mm} \times 31\text{mm} \times 48\text{mm}$ (~$240\text{ layers}$ at $0.2\text{mm}$).
- **Key Features**:
  - Curved boat hull with progressive overhangs.
  - Arched cabin doors and rear window.
  - Flat horizontal bridge roof.
  - Cylindrical hollow smokestack.
  - Stern nameplate text.
- **Implementation**: Pre-sliced G-code asset bundled in `assets/models/benchy.gcode` or dynamically loaded via fetch.

#### 4.5.3. Model 3: Quick Test Pad (5-Layer 15x15mm Plate)
- **Purpose**: Ultra-fast E2E test verification and unit testing (< 5 seconds execution).
- **Dimensions**: $15\text{mm} \times 15\text{mm} \times 1.0\text{mm}$ ($5\text{ layers}$).
- **Commands**: ~180 G-code lines. Contains homing (`G28`), temperature setup (`M104`, `M140`, `M109`, `M190`), fan control (`M106`), extrusion resets (`G92 E0`), outer perimeters, infill, and end print sequence (`M104 S0`, `M140 S0`, `G28 X0 Y0`, `M84`).

#### 4.5.4. User File Upload Pipeline
1. **Input**: File dropzone or standard `<input type="file" accept=".gcode,.gco,.g">`.
2. **Chunked Reader**: `FileReader.readAsText()` or `file.stream()` pipe to prevent main-thread UI freeze on large files (>20MB).
3. **Pre-computation Pass**:
   - Extracts bounding box: $[X_{min}, X_{max}], [Y_{min}, Y_{max}], [Z_{min}, Z_{max}]$.
   - Calculates total filament consumed (length $E_{mm}$ and mass in grams: $\text{Mass} = \pi \times (1.75/2)^2 \times E_{mm} \times 1.25\text{ g/cm}^3 \times 10^{-3}$).
   - Builds layer index table mapping each layer number to starting line index and Z height.
   - Calculates total print time.
4. **Summary Card**: Displays file name, dimensions, layer count, estimated duration, and filament usage in the UI before user clicks "Start Print".

---

### 4.6. Complete TypeScript Interface Contracts

These contracts form the binding interfaces for the implementation milestones.

```typescript
/**
 * Core coordinate and kinematic state of the virtual 3D printer
 */
export interface KinematicState {
  x: number;
  y: number;
  z: number;
  e: number;                  // Cumulative extruder position in mm
  feedrate: number;           // Modal feedrate in mm/min
  isRelativePositioning: boolean; // false = G90, true = G91
  isRelativeExtruder: boolean;    // false = M82, true = M83
  isHomed: { x: boolean; y: boolean; z: boolean };
  fanSpeed: number;           // 0.0 to 1.0 (PWM duty cycle)
  steppersEnabled: boolean;
  speedOverride: number;      // M220 factor (100 = 100%)
  flowOverride: number;       // M221 factor (100 = 100%)
}

/**
 * Categorization of toolpaths for rendering in 3D viewport
 */
export enum ToolpathType {
  TRAVEL = 'travel',
  WALL_OUTER = 'wall_outer',
  WALL_INNER = 'wall_inner',
  INFILL = 'infill',
  SOLID_SURFACE = 'solid_surface',
  SUPPORT = 'support',
  SKIRT_BRIM = 'skirt_brim',
  PRIME_TOWER = 'prime_tower',
}

/**
 * A single atomic extrusion line segment deposited onto the build plate
 */
export interface ToolpathSegment {
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  extrusionLength: number;    // Delta E in mm
  feedrate: number;           // mm/min
  type: ToolpathType;
  layerIndex: number;
  commandIndex: number;
}

/**
 * Structured tokenized representation of a single G-code line
 */
export interface ParsedGCodeLine {
  originalLine: string;
  lineNumber?: number;        // From N<number>
  command: string;            // e.g. "G1", "M104", "G28"
  parameters: Record<string, number>; // e.g. { X: 10.5, Y: 20.0, F: 3000 }
  comment?: string;
  isExtruding: boolean;
  isRetracting: boolean;
  isTravel: boolean;
}

/**
 * Metadata pre-computed when a G-code model is loaded
 */
export interface GCodeModelSummary {
  fileName: string;
  totalLines: number;
  totalLayers: number;
  boundingBox: {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
  };
  totalFilamentMm: number;
  totalFilamentGrams: number;
  estimatedPrintTimeSeconds: number;
  layerHeights: number[];     // Z height per layer index
  layerStartIndices: number[]; // G-code line index where each layer starts
}

/**
 * Engine execution lifecycle states
 */
export enum ExecutionState {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  STEPPING = 'STEPPING',
  ABORTED = 'ABORTED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

/**
 * Playback control interface exposed to UI dashboard
 */
export interface IEngineControls {
  loadGCode(gcodeText: string, fileName?: string): Promise<GCodeModelSummary>;
  startPrint(): void;
  pausePrint(): void;
  resumePrint(): void;
  stepForward(): void;
  abortPrint(): void;
  setSpeedMultiplier(multiplier: number): void; // 1, 5, 20, 100
  getSpeedMultiplier(): number;
  getState(): ExecutionState;
  getProgress(): {
    currentLine: number;
    totalLines: number;
    currentLayer: number;
    totalLayers: number;
    percentage: number;
    elapsedSeconds: number;
    remainingSeconds: number;
    filamentConsumedMm: number;
  };
}

/**
 * Thermal subsystem bridge interface
 */
export interface IThermalSubsystemBridge {
  getHotendTemp(): { actual: number; target: number };
  getBedTemp(): { actual: number; target: number };
  setHotendTarget(target: number): void;
  setBedTarget(target: number): void;
  isTargetReached(heater: 'hotend' | 'bed', toleranceCelsius: number): boolean;
  getColdExtrusionThreshold(): number; // Default 170°C
  isThermalRunaway(): boolean;
}

/**
 * Hardware failure simulation injection interface
 */
export interface IFailureSimulatorBridge {
  isNozzleClogged(): boolean;
  isFilamentRunout(): boolean;
  isBedAdhesionFailed(): boolean;
  getLayerShiftOffset(currentLayer: number): { x: number; y: number };
}

/**
 * Virtual Firmware Terminal interface
 */
export interface IVirtualTerminal {
  sendRawCommand(commandText: string): void;
  onReceiveLine(callback: (line: string) => void): () => void;
  getLogHistory(): string[];
  clearLog(): void;
}
```

---

## 5. Test Suite & Verification Matrix

The table below defines the automated unit and integration tests required for Milestone M1 (Kinematics & G-Code Engine):

| Test ID | Test Category | Target Feature | Input Data | Expected Verification Result |
|---------|---------------|----------------|------------|------------------------------|
| TC-01 | Lexer | Parameter Extraction | `G1 X10.5 Y-20.25 Z0.2 E0.045 F3000` | Extracts command `G1`, `X=10.5`, `Y=-20.25`, `Z=0.2`, `E=0.045`, `F=3000`. |
| TC-02 | Lexer | Whitespace & Cases | `g1 x 12.0 y 5.5 f 1500 ; inline` | Extracts command `G1`, `X=12.0`, `Y=5.5`, `F=1500`, strips comment. |
| TC-03 | Lexer | Line Numbers & Checksum | `N42 G28 X0*99` | Strips `N42` and `*99`, yields clean `G28 X0`. |
| TC-04 | State | Modal Coordinates | `G1 X10 Y10 F3000` followed by `G1 X20` | Final position is `(X=20, Y=10)`, `F=3000` retained. |
| TC-05 | State | Absolute Extruder Reset | `G1 E100` -> `G92 E0` -> `G1 E1.0` | After `G92 E0`, `state.e == 0`; subsequent move deposits exactly `1.0mm` extrusion, not negative. |
| TC-06 | State | Relative Extruder Mode | `M83` -> `G1 E1.0` -> `G1 E1.0` | In `M83`, each command deposits `1.0mm`; total deposited is `2.0mm`. |
| TC-07 | Kinematics | Move Duration | `G1 X30 Y40 F3000` (from `0, 0`) | Displacement $D = \sqrt{30^2 + 40^2} = 50\text{mm}$. $v = 3000/60 = 50\text{mm/s}$. Duration $t = 1.0\text{s}$. |
| TC-08 | Thermal Safety | Cold Extrusion Guard | Hotend at 25°C, `G1 E5.0 F1200` | Move executed or skipped; deposited toolpath segment has `extrusionLength == 0`; terminal logs `echo: cold extrusion prevented`. |
| TC-09 | Playback | Speed Multiplier | 100 lines at $1\times$ vs $100\times$ | Total segments generated and final toolhead coordinates identical; simulation clock advances 100x faster. |
| TC-10 | Playback | Step Control | `engine.pausePrint()` -> `engine.stepForward()` | Exactly 1 command executed; engine returns to `PAUSED`. |
| TC-11 | Terminal | Temperature Query (`M105`) | Send `M105` with hotend=200, bed=60 | Response line matches regex `/^ok T:200\.0 \/200\.0 B:60\.0 \/60\.0/`. |
| TC-12 | Terminal | Unknown Command | Send `M9999` | Response is `echo: Unknown command: "M9999"` followed by `ok`. |
| TC-13 | Slicer Ingestion | Quick Pad Parse | Ingest 5-layer Quick Pad G-code | Total layers == 5; bounding box within $[100, 120]\text{mm}$; non-zero filament consumed. |
| TC-14 | Slicer Ingestion | Calibration Cube Parse | Ingest 20mm Calibration Cube | Total layers == 100; total Z height == 20.0mm; bounding box $[100, 120]\text{mm}$ in X and Y. |
