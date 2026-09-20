# Worker Dispatch: Milestone 2 — Thermal Dynamics, Safety Systems, & Failure Simulators

## Objective
Implement Milestone 2 of the 3D Printer Simulator:
1. Implement Thermal Dynamics & Safety in `src/core/thermal/`:
   - `types.ts`: Adhere to `PROJECT.md` contracts (`HeaterTelemetry`, `ThermalHistoryPoint`, `IThermalModel`, etc.).
   - `ThermalModel.ts`:
     - Analytical exponential discrete integration:
       $T(t + \Delta t) = T_\infty + (T(t) - T_\infty)e^{-\lambda \Delta t}$
       ensuring unconditional numerical stability at 1x to 100x playback speeds.
     - Calibrated parameters:
       - Hotend: 40W, ambient 21°C to 285°C, $k_{heat} = 3.80$, $k_{cool} = 0.0145$, $k_{fan} = 0.0095$.
       - Heated Bed: 220W, ambient 21°C to 115°C, $k_{heat} = 0.42$, $k_{cool} = 0.0036$.
     - Discrete PID temperature controller with anti-windup clamping and derivative-on-measurement:
       - Hotend: $K_p = 0.045$, $K_i = 0.0018$, $K_d = 0.280$.
       - Bed: $K_p = 0.120$, $K_i = 0.0004$, $K_d = 1.100$.
     - Cold extrusion interlock: prevents extrusion if nozzle temperature < 170°C (`canExtrude()` returns false).
     - Marlin/Klipper-spec Thermal Runaway Safety Watchdogs:
       - Heating watchdog: temperature must rise by $\ge 2.0^\circ\text{C}$ within $\tau_{watch}$ (25s for hotend, 60s for bed) when heater is commanded.
       - In-range watchdog: once setpoint reached ($\pm 3^\circ\text{C}$), if temperature drops $>10^\circ\text{C}$ for $>15\text{s}$ under full power ($u \ge 0.90$), trip runaway.
       - Sensor open/short faults: $T < -10^\circ\text{C}$ (`MINTEMP`) or $T > 310^\circ\text{C}$ (`MAXTEMP`).
       - Emergency stop ($M112$): immediately cuts heater power to 0, fan to 100%, disables steppers, sets state to `ERROR / HALT`.
2. Implement Hardware Failure Modes in `src/core/failures/`:
   - `types.ts`: Adhere to `PROJECT.md` contracts (`FailureConfig`, `IFailureManager`).
   - `FailureManager.ts`:
     - Nozzle clog: 'NONE', 'PARTIAL' (25% volume), 'FULL' (air printing without filament deposit).
     - Bed adhesion failure / Spaghetti mode: boolean toggle.
     - Layer shift: hardware offset vector $\mathbf{\Delta}_{shift} = (\delta_x, \delta_y)$ injected into physical rendering.
     - Filament runout: sensor toggle, triggers automatic pause, logs `echo: Filament runout sensor triggered! Head parked at (10, 10).`, parks head at $(10, 10, Z+5)$.
   - `SpaghettiGenerator.ts`: Procedural 3D brownian curl noodle generator creating falling noodle paths.
3. Implement Centralized Telemetry Store in `src/core/telemetry/`:
   - `types.ts`, `TelemetryStore.ts`:
     - Synchronizes printer status (`IDLE`, `HOMING`, `HEATING`, `PRINTING`, `PAUSED`, `HALTED`, `ERROR`), hotend & bed telemetry, fan speed, positions, failures, job metrics, thermal history ring buffer (last 120 samples), and terminal log.
4. Bridge Integration with `GCodeExecutor`:
   - Connect `ThermalModel` as `thermalSubsystem` bridge:
     - `M104`/`M140` update targets asynchronously.
     - `M109`/`M190` wait for temperature setpoint ($\pm 1.0^\circ\text{C}$) before continuing queue.
     - `M105` queries temperatures and responds `ok T:... / ... B:... / ...`.
     - `M106`/`M107` update fan speed and cooling rate.
     - `M112` activates emergency halt.
     - Cold extrusion check prevents extrusion when nozzle < 170°C.
   - Connect `FailureManager` as `failureBridge`.
5. Automated Unit Tests in `src/test/unit/`:
   - `src/test/unit/thermal-model.test.ts`:
     - Heating curves toward 200°C nozzle and 60°C bed.
     - PID stability with < 2°C overshoot.
     - Cold extrusion lockout below 170°C and unlock above 170°C.
     - Thermal runaway detection on open-loop heating stall.
     - Emergency stop heater cutoff.
   - `src/test/unit/failure-modes.test.ts`:
     - Nozzle clog suppresses extrusion.
     - Spaghetti generator produces 3D curls.
     - Layer shift applies $\mathbf{\Delta}_{shift}$ offset.
     - Filament runout triggers pause and parking.
   - `src/test/unit/telemetry-store.test.ts`:
     - State synchronization and rolling history buffer.
6. Verify:
   - Run `npm test` (all tests must pass, 0 failures).
   - Run `npm run build` (clean build, exit code 0).

## Mandatory Files to Read Before Starting
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_explorer_survey_3\handoff.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m1_fix\handoff.md`

## File Ownership
You exclusively own:
- `src/core/thermal/*`
- `src/core/failures/*`
- `src/core/telemetry/*`
- `src/test/unit/thermal-model.test.ts`
- `src/test/unit/failure-modes.test.ts`
- `src/test/unit/telemetry-store.test.ts`
- Updating `src/core/gcode/GCodeExecutor.ts` to bridge thermal and failure subsystems.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Output
Write your handoff report to:
`c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m2\handoff.md`

## 2026-09-20T03:54:17Z
Your identity is teamwork_preview_worker_m2.
Your working directory is:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please read your assignment in:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m2\DISPATCH.md
and read:
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md
c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_explorer_survey_3\handoff.md

Your task is to implement Milestone 2:
1. Implement Thermal Dynamics & Safety in src/core/thermal/ (analytical exponential ODE, tuned PID, cold extrusion interlock, Marlin/Klipper runaway watchdogs, emergency stop M112).
2. Implement Hardware Failure Modes in src/core/failures/ (nozzle clog, spaghetti generator, layer shift, filament runout).
3. Implement Centralized Telemetry Store in src/core/telemetry/.
4. Bridge Thermal and Failure subsystems with GCodeExecutor.
5. Implement unit tests in src/test/unit/thermal-model.test.ts, failure-modes.test.ts, and telemetry-store.test.ts. Run `npm test` and `npm run build`.

Maintain progress.md in your working directory.
When done, write handoff.md in your working directory and notify the parent via send_message.
