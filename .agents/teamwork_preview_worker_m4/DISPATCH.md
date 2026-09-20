# Worker Dispatch: Milestone 4 — Control Dashboard & Virtual Firmware Terminal

## Objective
Implement Milestone 4 of the 3D Printer Simulator:
1. Implement the responsive Fluidd / Mainsail / OctoPrint-style web dashboard in `src/components/dashboard/`:
   - `FluiddDashboard.tsx`:
     - Dark slate aesthetic (`bg-slate-950`, cards `bg-slate-900`, borders `border-slate-800`, text `text-slate-100`).
     - App Header:
       - Printer state badge (Emerald green for PRINTING/READY, Amber for HEATING, Ruby red for ERROR/HALTED).
       - Active file name & overall progress bar (percentage, layer count, elapsed/remaining time).
       - Prominent Emergency Stop button (`M112`) that triggers instant halt.
       - Printer Reset / Clear Faults button.
     - Responsive 2-column layout:
       - Left Column (60%): Interactive 3D Viewport container (`ViewportContainer`).
       - Right Column (40%): Modular control deck panels.
   - `TemperaturePanel.tsx`:
     - Live dual-line temperature history chart (smooth SVG/Canvas rendering hotend actual [red], hotend target [dashed red], bed actual [blue], bed target [dashed blue] over rolling 60s history from `TelemetryStore.getThermalHistory()`).
     - Numeric temperature readouts and target input spinners.
     - One-click temperature presets: Off (0/0), PLA (200/60), PETG (240/80), ABS (250/100).
     - Part cooling fan slider (0% to 100%, M106/M107).
   - `JogControlPanel.tsx`:
     - Interactive XY jog ring (North, South, East, West, diagonals) and Z Up/Down steppers.
     - Selectable step increments: 0.1mm, 1.0mm, 10mm, 100mm.
     - Homing buttons: [Home All G28], [Home X], [Home Y], [Home Z].
     - Manual Extrude & Retract buttons (5mm, 10mm).
       - **CRITICAL**: If nozzle temperature < 170°C, Extrude button is visually locked with a warning badge `"Cold Extrusion Blocked (< 170°C)"`.
   - `PrintStatusPanel.tsx`:
     - Print progress indicators: current layer / total layers, elapsed seconds, estimated remaining seconds (ETA).
     - Filament consumption: total meters extruded and grams consumed.
     - Speed multiplier selector: 1x, 5x, 20x, 100x.
     - Transport buttons: Start Print / Pause / Resume / Abort.
   - `GCodeTerminal.tsx`:
     - Monospace pseudo-firmware serial console displaying timestamped sent commands (`> G1 X100 Y100`) and simulated firmware replies (`ok`, `T:... / ...`, `echo: ...`, `Error: ...`).
     - Text input line with Enter key submission.
     - Command history navigation via Up and Down arrow keys.
     - Filter checkbox: `[x] Filter M105 temperature queries`.
     - Auto-scroll to latest log entries.
   - `FailureControls.tsx`:
     - Interactive hardware failure injection controls:
       - Nozzle Clog: Toggle buttons (Normal / Partial Clog 25% / Full Clog).
       - Bed Adhesion / Spaghetti Mode: Toggle button.
       - Layer Shift: Buttons to inject X+10mm or Y+10mm step loss.
       - Filament Runout: Toggle switch triggering M600 filament pause and head park.
       - Simulate Thermal Runaway: Button to simulate heater open-loop failure.
   - `ModelSelector.tsx`:
     - Model selection dropdown for built-in pre-sliced models (Calibration Cube 20mm, 3DBenchy, Quick Test Pad 15x15mm).
     - Drag-and-drop / file upload zone for custom user `.gcode` files with pre-computation summary card (file name, dimensions, layers, ETA, filament mass).
2. Wire everything into `src/App.tsx`:
   - Initialize `TelemetryStore`, `GCodeExecutor`, `ThermalModel`, `FailureManager`, and `ThreePrinterViewport`.
   - Connect telemetry tick loop (2Hz) and physics tick loop (10Hz).
   - Ensure the application renders cleanly in the browser with ZERO console errors.
3. Add automated tests in `src/test/unit/dashboard-ui.test.ts` (or integration tests):
   - Verifying temperature preset dispatch, jog commands, terminal command dispatch, model loading, and failure mode toggling.
4. Verify:
   - `npm test` (all tests pass, 0 failures).
   - `npm run build` (clean production build, exit code 0).

## Mandatory Files to Read Before Starting
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_explorer_survey_3\handoff.md`

## File Ownership
You exclusively own:
- `src/components/dashboard/*`
- `src/App.tsx`
- `src/test/unit/dashboard-ui.test.ts`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Output
Write your handoff report to:
`c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m4\handoff.md

## 2026-09-20T04:09:07Z
Your identity is teamwork_preview_worker_m4.
Your working directory is:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m4

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please read your assignment in:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m4\DISPATCH.md
and read:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_explorer_survey_3\handoff.md

Your task is to implement Milestone 4:
1. Implement Fluidd/Mainsail dashboard components in src/components/dashboard/ (FluiddDashboard, TemperaturePanel with live SVG charts, JogControlPanel with cold extrusion lock, PrintStatusPanel, GCodeTerminal with command history, FailureControls, ModelSelector).
2. Wire all components, TelemetryStore, GCodeExecutor, ThermalModel, and ViewportContainer into src/App.tsx.
3. Implement unit/integration tests in src/test/unit/dashboard-ui.test.ts. Run `npm test` and `npm run build`.

Maintain progress.md in your working directory.
When done, write handoff.md in your working directory and notify the parent via send_message.
`
