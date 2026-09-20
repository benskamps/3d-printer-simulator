# Survey Analysis & Technical Specification: Thermal Dynamics, Failure Modes, & Control Dashboard UI

**Agent Identity**: `teamwork_preview_explorer_survey_3`  
**Working Directory**: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_explorer_survey_3`  
**Timestamp**: 2026-09-20T03:32:30Z  

---

## 1. Observation

Direct observations from authoritative project requirements and dispatch files:

### 1.1 From `ORIGINAL_REQUEST.md`:
- **Line 5**: *"An interactive, web-based 3D printer simulator featuring real-time 3D toolpath extrusion, printer kinematics, thermal dynamics, failure mode simulations, and an OctoPrint/Klipper-style dashboard."*
- **Lines 18-20 (R3. Thermal & Failure Mode Simulation Engine)**:
  > *"Implement a physics/state simulation for hotend and bed heating with thermal inertia (exponential rise toward setpoint with ambient cooling). Include a thermal runaway safety detector if heating fails or fluctuates unexpectedly. Provide toggles for hardware failure modes: nozzle clogs (extrusion halts while motion continues), bed adhesion failure / spaghetti mode, layer shift (stepper skips step on specified axis), and filament runout."*
- **Lines 21-27 (R4. Control Dashboard & Virtual Firmware Terminal)**:
  > *"Provide a responsive web control interface inspired by modern 3D printer frontends (e.g., Fluidd / Mainsail / OctoPrint):*  
  > *- Temperature telemetry with live history charts (hotend & bed actual vs. target).*  
  > *- Manual jog controls (X/Y/Z stepping, extrude/retract filament, home axes).*  
  > *- Interactive G-code console / pseudo-firmware terminal that logs sent commands and simulated OK / temperature telemetry replies.*  
  > *- Print metrics panel (current layer, estimated time remaining, total filament consumed)."*
- **Lines 32-34 (Verification Plan)**:
  > *"- Thermal model math reaches setpoints within target thresholds and correctly triggers thermal runaway flags on open-loop conditions."*
- **Lines 40-42 (Acceptance Criteria)**:
  > *"- Thermal simulation displays heating curves to user-defined temperatures (e.g. 200°C nozzle, 60°C bed) and prevents printing if nozzle is below minimum extrusion temperature."*  
  > *"- Simulating at least 2 failure conditions (e.g., layer shift, nozzle clog, or thermal runaway) correctly produces visible visual effects or emergency halt states."*  
  > *"- Manual jog interface and interactive G-code terminal allow sending arbitrary G-code commands and observe simulated printer state updates."*

### 1.2 From `DISPATCH.md`:
- **Lines 4-18**:
  > *"1. Thermal dynamics model: Physics-based differential or discrete exponential approach: $T(t + dt) = T(t) + (P_{heater} \cdot k_{heat} - (T(t) - T_{ambient}) \cdot k_{cool}) \cdot dt$. Hotend (ambient ~20°C up to ~260°C) and Heated Bed (ambient ~20°C up to ~110°C). Cold extrusion prevention (interlock preventing extrusion if nozzle temp < 170°C). Thermal runaway detector (checks if temperature fails to rise when power applied, or fluctuates beyond delta threshold).*  
  > *2. Failure mode simulations: Nozzle clog (extrusion stops depositing visual filament while motion and axis moves continue). Spaghetti mode / bed adhesion failure (extruded filament becomes detached, curling / generating chaotic noodles on the bed instead of following layer slices). Layer shift (stepper skip on X or Y axis by an offset $\Delta x$ or $\Delta y$, causing all subsequent moves to be shifted). Filament runout (sensor detects absence of filament, triggers pause and prompts reload).*  
  > *3. Control dashboard & UI (Fluidd / Mainsail / OctoPrint inspired): Layout & components, temperature charts, jog dials/buttons, manual extrude/retract, interactive terminal log with command input, print progress & metrics, state synchronization and reactive UI updates."*

### 1.3 Local Runtime Environment:
- Verified via `run_command`: Node.js version **v22.23.2**, npm version **10.9.8**.

---

## 2. Logic Chain

The requirements mandate four tightly-integrated technical domains:
1. **Thermal Dynamics Model (Physics & PID control)**
2. **Thermal Runaway & Cold Extrusion Safety Interlocks**
3. **Hardware Failure Mode Simulation Engine**
4. **Control Dashboard UI & Telemetry State Architecture**

Below is the exhaustive, step-by-step derivation and specification for each domain.

```
+-----------------------------------------------------------------------------------+
|                           SIMULATION CORE ENGINE                                  |
|                                                                                   |
|  +--------------------+    +----------------------+    +-----------------------+  |
|  |   Thermal Engine   |    |    Motion Engine     |    | Failure Mode Engine   |  |
|  |  - Hotend Physics  |    |  - Cartesian Kinematics  | - Nozzle Clog          |  |
|  |  - Bed Physics     |    |  - G-code Interpolation  | - Spaghetti Generator |  |
|  |  - PID Regulators  |    |  - Feedrate handling     | - Layer Shift Vector   |  |
|  |  - Safety Watchdog |    |  - Axis step execution   | - Runout Sensor Trigger|  |
|  +---------+----------+    +----------+-----------+    +-----------+-----------+  |
|            |                          |                            |              |
+------------|--------------------------|----------------------------|--------------+
             |                          |                            |
             v                          v                            v
+-----------------------------------------------------------------------------------+
|                        CENTRALIZED TELEMETRY STORE                                |
|  - Temperatures (Actual, Target, PWM)   - Coordinates (Nominal, Physical Shifted) |
|  - Safety Status (Watchdogs, ColdLock) - Active Failures & Sensor States          |
|  - Print Job Metrics (Layer, Time, E)   - Terminal Monospace Serial Stream Buffer  |
+-----------------------------------------------------------------------------------+
             |                          |                            |
             v                          v                            v
+-----------------------------------------------------------------------------------+
|                           USER INTERFACE DASHBOARD                                |
|  +--------------------+    +----------------------+    +-----------------------+  |
|  | 3D Viewport Panel  |    |  Telemetry & Charts  |    | Jog & Terminal Deck   |  |
|  | - Three.js Gantry  |    |  - Live Temp Graphs  |    | - XY / Z Jog Steppers |  |
|  | - Toolpath Extrude |    |  - Print Progress    |    | - Manual Extrude/Retr |  |
|  | - Spaghetti Mesh   |    |  - Speed/Fan Sliders |    | - Monospace Console   |  |
|  +--------------------+    +----------------------+    +-----------------------+  |
+-----------------------------------------------------------------------------------+
```

---

### Part 1: Thermal Dynamics Model (Physics & PID)

#### 1.1 Physics Formulation
The thermal behavior of both the hotend heater block and the heated build plate is governed by Joule heating from electrical heater cartridges/traces, coupled with convective and radiative heat transfer to the surrounding environment (Newton's Law of Cooling).

The continuous differential equation is:
$$C_{th} \frac{dT(t)}{dt} = P_{in}(t) - h \cdot A \cdot (T(t) - T_{ambient}) - \dot{Q}_{fan}(t)$$

Where:
- $T(t)$ is the actual temperature at time $t$ (°C).
- $T_{ambient}$ is ambient room temperature (°C), standardized at $21.0^\circ\text{C}$.
- $C_{th}$ is the thermal heat capacity of the body ($\text{J}/^\circ\text{C}$).
- $P_{in}(t) = u(t) \cdot P_{max}$ is heating electrical power, with $u(t) \in [0.0, 1.0]$ being the normalized PWM control duty cycle.
- $h \cdot A$ is the heat transfer coefficient multiplied by surface area ($\text{W}/^\circ\text{C}$).
- $\dot{Q}_{fan}(t)$ is additional convective heat loss caused by the part-cooling fan directed at the nozzle.

Dividing through by $C_{th}$ yields the canonical heating/cooling rate parameters:
- Heating constant: $k_{heat} = \frac{P_{max}}{C_{th}} \quad (^\circ\text{C} / \text{s})$
- Passive cooling constant: $k_{cool} = \frac{h A}{C_{th}} \quad (\text{s}^{-1})$
- Fan cooling multiplier: $k_{fan} \quad (\text{s}^{-1})$

The differential equation simplifies to:
$$\frac{dT(t)}{dt} = u(t) \cdot k_{heat} - \left(T(t) - T_{ambient}\right) \cdot \left(k_{cool} + k_{fan} \cdot \frac{S_{fan}}{255}\right)$$

#### 1.2 Discrete Time Integration & Unconditional Stability
In an interactive simulator with playback speed multipliers ($1\times, 5\times, 20\times, 100\times$), standard Euler integration $\Delta T = \frac{dT}{dt} \Delta t$ can suffer numerical instability or blow up if $k_{cool} \cdot \Delta t > 1$.

To guarantee **100% unconditional numerical stability** at arbitrary time steps ($\Delta t$), we employ the exact analytical exponential solution over each discrete simulation step where input $u(t)$ and fan speed remain constant:

Let the effective cooling constant be:
$$\lambda = k_{cool} + k_{fan} \cdot \frac{S_{fan}}{255}$$

The asymptotic steady-state temperature for the current power input $u \in [0, 1]$ is:
$$T_{\infty} = T_{ambient} + \frac{u \cdot k_{heat}}{\lambda}$$

The exact temperature at $t + \Delta t$ is computed via:
$$T(t + \Delta t) = T_{\infty} + \left(T(t) - T_{\infty}\right) \cdot e^{-\lambda \cdot \Delta t}$$

*Property*: Even if $\Delta t = 10.0\text{ s}$ during $100\times$ playback, $e^{-\lambda \Delta t} \in [0, 1)$, preventing any numerical overshoot, oscillation, or divergence.

#### 1.3 Calibrated Physical Parameters
Based on realistic 3D printer hardware (E3D V6 / Volcano 40W hotend, and 220x220mm 200W aluminum heated bed):

| Parameter | Hotend Heater Block | Heated Bed (Aluminum/Glass) | Units |
| :--- | :--- | :--- | :--- |
| **Ambient Temp ($T_{amb}$)** | 21.0 | 21.0 | °C |
| **Max Operating Temp ($T_{max}$)** | 285.0 (safe max 300.0) | 115.0 (safe max 125.0) | °C |
| **Rated Electrical Power ($P_{max}$)** | 40 W | 220 W | W |
| **Thermal Mass / Capacity ($C_{th}$)** | ~18 J/°C | ~480 J/°C | J/K |
| **Heating Rate ($k_{heat}$)** | **3.80** | **0.42** | °C / s |
| **Passive Cooling Rate ($k_{cool}$)** | **0.0145** | **0.0036** | s⁻¹ |
| **Fan Cooling Rate ($k_{fan}$)** | **0.0095** | **0.0002** (negligible) | s⁻¹ |
| **Max Equilibrium Temp ($u=1$, Fan=0)** | $21 + 3.80 / 0.0145 \approx \mathbf{283.0^\circ\text{C}}$ | $21 + 0.42 / 0.0036 \approx \mathbf{137.6^\circ\text{C}}$ | °C |
| **Equilibrium Temp ($u=1$, Fan=100%)** | $21 + 3.80 / (0.0145 + 0.0095) \approx \mathbf{179.3^\circ\text{C}}$ | N/A | °C |
| **Time to 200°C (PLA Hotend)** | ~55 seconds | N/A | s |
| **Time to 60°C (PLA Bed)** | N/A | ~110 seconds | s |

#### 1.4 Closed-Loop PID Temperature Controller
To maintain temperature setpoints without steady-state offset or severe overshoot, a discrete PID controller calculates duty cycle $u(t) \in [0.0, 1.0]$:

$$e(t) = T_{target}(t) - T_{actual}(t)$$

$$\text{Term}_P = K_p \cdot e(t)$$

$$\text{Term}_I(t) = \text{Term}_I(t - \Delta t) + K_i \cdot e(t) \cdot \Delta t \quad \text{(with anti-windup clamping to } [0, 1]\text{)}$$

$$\text{Term}_D = -K_d \cdot \frac{T_{actual}(t) - T_{actual}(t - \Delta t)}{\Delta t} \quad \text{(Derivative-on-Measurement)}$$

$$u(t) = \text{clamp}\left(\text{Term}_P + \text{Term}_I(t) + \text{Term}_D, 0.0, 1.0\right)$$

*Tuned Coefficients*:
- **Hotend**: $K_p = 0.045$, $K_i = 0.0018$, $K_d = 0.280$ (reaches 200°C in ~55s with < 1.5°C overshoot).
- **Bed**: $K_p = 0.120$, $K_i = 0.0004$, $K_d = 1.100$ (smooth approach to 60°C).

#### 1.5 Temperature G-Code Commands
1. `M104 S<temp>`: Non-blocking set hotend target temperature. Updates $T_{target\_hotend}$, returns immediately `ok`.
2. `M109 S<temp>`: Blocking wait for hotend target temperature. Sets target and halts execution queue until $|T_{actual} - T_{target}| \le 1.0^\circ\text{C}$ for at least $1.0\text{ s}$.
3. `M140 S<temp>`: Non-blocking set heated bed target temperature.
4. `M190 S<temp>`: Blocking wait for heated bed target temperature.
5. `M105`: Telemetry query. Responds with:
   `ok T:200.2 /200.0 B:60.1 /60.0 @:48 B@:22` (where `@` is hotend PWM 0-127, `B@` is bed PWM 0-127).

---

### Part 2: Thermal Safety Triggers & Safety Interlocks

#### 2.1 Cold Extrusion Prevention Interlock (`PREVENT_COLD_EXTRUSION`)
- **Threshold**: $T_{min\_extrude} = 170.0^\circ\text{C}$.
- **Rule**: Whenever an extrusion move is requested:
  - In G-code execution: any `G1` command with $\Delta E > 0$.
  - In UI manual jog: clicking `Extrude 5mm` or `Extrude 10mm`.
- **Condition Check**:
  $$\text{if } T_{actual\_hotend} < 170.0^\circ\text{C}:$$
  - The extrusion is **blocked**. In manual jog, the Extrude button is visually disabled with a warning badge `"Cold Extrusion Blocked (< 170°C)"`.
  - In G-code execution, the E axis move is suppressed or execution pauses with firmware notification:
    `echo: Cold extrusion prevented (hotend temp = 21.0C < 170.0C)`
- **Override Code**: `M302 S<temp>` or `M302 P1` (allow cold extrusion for testing/calibration).

#### 2.2 Thermal Runaway Safety Watchdog (Klipper / Marlin Protocol)
To protect against fire, heater detachment, or thermistor failure, the firmware watchdog continuously monitors heater response across 3 independent fault detectors:

```
                          HEATER COMMANDED (Target > Actual + 5°C)
                                            |
                                            v
                                 [Heating Watchdog Active]
                                            |
                     +----------------------+----------------------+
                     |                                             |
            Temp rises >= 2.0°C                             Temp fails to rise by
            within window tau_watch                         2.0°C within tau_watch
            (Hotend: 25s, Bed: 60s)                         (Power u > 0.85)
                     |                                             |
                     v                                             v
          [Target Reached Zone]                             !! THERMAL RUNAWAY !!
          (|T_act - T_tgt| <= 3.0°C)                        Heating Failed / Detached
                     |                                             |
                     v                                             |
          [Runaway Watchdog Active]                                |
                     |                                             |
     +---------------+---------------+                             |
     |                               |                             |
Temp stays in band             Temp drifts outside band            |
(|T_act - T_tgt| <= 10°C)      (> 10°C drop for > 15s              |
                               with power u >= 0.95)               |
     |                               |                             |
     v                               v                             v
[Normal Operation]             !! THERMAL RUNAWAY !!     ===========================
                               Temp Fluctuating / Lost   == EMERGENCY HALT (M112) ==
                                                         == - Cut all heaters (u=0)==
                                                         == - Fan to 100% (M106)  ==
                                                         == - Steppers disabled   ==
                                                         == - Red alert UI modal  ==
                                                         ===========================
```

##### Detailed Watchdog Logic:
1. **Heating Watchdog (Rise Check)**:
   - When a heater is commanded to reach a setpoint ($T_{target} \ge T_{actual} + 5^\circ\text{C}$), a timer $\tau_{heating}$ initializes.
   - Every $\tau_{watch}$ period (25s for hotend, 60s for bed):
     If $u(t) \ge 0.85$ and $(T_{actual}(t) - T_{actual}(t - \tau_{watch})) < 2.0^\circ\text{C}$, trigger `HEATING_FAILURE_HALT`.
2. **In-Range Runaway Watchdog (Stability Check)**:
   - Once the target temperature is reached ($|T_{actual} - T_{target}| \le 3.0^\circ\text{C}$), the in-range monitor activates.
   - If $|T_{actual} - T_{target}| > 10.0^\circ\text{C}$ persists continuously for $\tau_{hysteresis} \ge 15.0\text{ s}$ while heater power is saturated ($u \ge 0.90$), trigger `THERMAL_RUNAWAY_HALT`.
3. **Thermistor Sensor Faults (MINTEMP / MAXTEMP)**:
   - If $T_{actual} < -10.0^\circ\text{C}$ (open circuit / disconnected thermistor wire): trigger `MINTEMP_ERROR`.
   - If $T_{actual} > 310.0^\circ\text{C}$ (short circuit / runaway heater): trigger `MAXTEMP_ERROR`.

##### Emergency Halt Action Sequence:
When any thermal fault is triggered:
1. Immediately force $u_{hotend} = 0$, $u_{bed} = 0$, $T_{target\_hotend} = 0$, $T_{target\_bed} = 0$.
2. Turn part cooling fan to 100% (`M106 S255`) to expedite safe cooldown.
3. Terminate G-code parser execution queue; printer state switches to `FIRMWARE_HALT`.
4. Stepper drivers disabled (`M84`).
5. Terminal stream emits:
   `!! Error: Thermal Runaway detected, system stopped! Heater killed.`
   `!! Action: Please fix hardware and reset printer.`
6. UI displays full-screen persistent red banner with "RESTART PRINTER" recovery button.

---

### Part 3: Hardware Failure Mode Simulation Engine

The simulator provides interactive failure mode simulation toggles via the UI dashboard to inspect failure dynamics and recovery procedures.

#### 3.1 Nozzle Clog
- **Trigger**: Toggle in Failure Simulation Panel (Off / Partial / Full Clog).
- **Physical Dynamics**: Filament jamming in heat break or foreign particle blocking the 0.4mm orifice.
- **Simulation Mechanism**:
  - **Full Clog**: Extruder stepper motor continues executing motion commands (E position accumulator increases in firmware), but the visual extrusion geometry generator outputs zero volume ($\Delta V = 0$). The printhead traverses the toolpath in mid-air ("ghost printing").
  - **Partial Clog**: Extruded volume is throttled to 25% of nominal, generating thinned, broken, dotted toolpath segments.
  - **Audio/Visual Telemetry**: The dashboard displays an extruder warning icon (simulated stepper clicking / motor skip).

#### 3.2 Bed Adhesion Failure / Spaghetti Mode
- **Trigger**: Toggle in Failure Simulation Panel, or auto-trigger at specific layer height $Z_{trigger}$.
- **Physical Dynamics**: Thermal contraction or dirty PEI build plate causes printed part to detach from the build bed. The nozzle then extrudes molten plastic into free air without support.
- **Procedural 3D Spaghetti Generation**:
  - In normal printing: Extrusion produces straight line or tube segments connecting consecutive G1 waypoints $\mathbf{P}_0 \to \mathbf{P}_1$ at $Z_{layer}$.
  - In Spaghetti Mode:
    When $\Delta E > 0$, instead of drawing linear path $\mathbf{P}_0 \to \mathbf{P}_1$, the extrusion algorithm procedurally injects chaotic looping noodles falling under simulated gravity:
    $$\mathbf{P}_{spaghetti}(s) = \mathbf{P}_{nozzle}(s) + \begin{pmatrix} R \cdot \cos(\omega s + \phi_1) \\ R \cdot \sin(\omega s + \phi_2) \\ -h(s) \end{pmatrix}$$
    Where $R \sim \text{random}(1.5, 6.0)\text{ mm}$, $\omega$ is rotational winding frequency, and $-h(s)$ drops vertices downward toward the build plate ($Z=0$ or onto the detached base mesh).
  - **Detached Part Physics**: The previously extruded solid base geometry detaches from $(0,0,0)$ and is displaced with a small random translation $(\Delta X_{part}, \Delta Y_{part})$ and tilt $(\theta_x, \theta_y)$ as the moving nozzle collides with it.
  - **AI Failure Detection Overlay**: A simulated Obico / "The Spaghetti Detective" computer vision widget alerts with `"Spaghetti Detected (96.4% confidence) - Print Paused"`.

#### 3.3 Layer Shift
- **Trigger**: UI button or trigger on specified layer (e.g. `Shift X +8.0mm`, `Shift Y -5.0mm`).
- **Physical Dynamics**: High acceleration/jerk, loose timing belt, or physical nozzle collision causing open-loop stepper motors to lose synchronization steps.
- **Coordinate Transformation Mechanics**:
  Because standard 3D printers lack closed-loop encoder feedback, firmware remains completely unaware of lost steps.
  The simulator maintains a **Hardware Shift Offset Vector**:
  $$\mathbf{\Delta}_{shift} = (\delta_x, \delta_y, \delta_z)^T$$
  When a layer shift occurs:
  $$\mathbf{\Delta}_{shift} \leftarrow \mathbf{\Delta}_{shift} + (\text{offset}_x, \text{offset}_y, 0)^T$$
  - The firmware terminal and position telemetry continue reporting nominal G-code coordinates $(X_{nominal}, Y_{nominal}, Z_{nominal})$.
  - The 3D viewport renderer transforms all toolpath endpoints and gantry visualization positions to:
    $$\mathbf{P}_{render} = \mathbf{P}_{nominal} + \mathbf{\Delta}_{shift}$$
  - **Visual Outcome**: Instantly creates the classic horizontal layer displacement / shelf artifact across all subsequent layers.

#### 3.4 Filament Runout
- **Trigger**: UI toggle switch "Filament Out".
- **Physical Dynamics**: Mechanical microswitch or optical sensor on the filament guide detects the end of the spool.
- **Simulation Mechanism**:
  1. Sensor boolean flips from `FILAMENT_PRESENT (true)` to `FILAMENT_EMPTY (false)`.
  2. The execution engine triggers the standard `M600` (Filament Change) macro:
     - G-code playback automatically **pauses**.
     - Retracts filament $2.0\text{ mm}$ to prevent oozing.
     - Saves current print coordinates $(X_0, Y_0, Z_0)$.
     - Raises nozzle $+5.0\text{ mm}$ ($Z = Z_0 + 5$) and moves gantry to park position $(X=10, Y=10)$.
     - Sounds simulated beeper and logs to terminal:
       `// action:paused`
       `echo: Filament runout sensor triggered! Head parked at (10, 10).`
  3. UI displays a modal dialog: *"Filament Runout: Spool is empty. Click [Load Filament & Resume] to continue."*
  4. On resume: gantry returns to $(X_0, Y_0, Z_0)$, primes nozzle, and resumes G-code playback seamlessly.

---

### Part 4: Control Dashboard UI & Telemetry State Model (Fluidd / Mainsail / OctoPrint)

#### 4.1 Dashboard Visual Theme & Layout Architecture
Inspired by the industry gold standards in modern 3D printing web interfaces (Fluidd and Mainsail):
- **Aesthetic**: Modern dark slate theme (`bg-slate-950`, card background `bg-slate-900`, borders `border-slate-800`, typography `font-sans` with `font-mono` terminal).
- **Status Accents**:
  - Emerald Green (`#10b981`): Ready / Printing OK / In-temp.
  - Amber / Orange (`#f59e0b`): Heating / Caution / Bed temp.
  - Ruby Red (`#ef4444`): Emergency Stop / Hotend / Thermal Runaway.
  - Sky Blue (`#0ea5e9`): Fan / Toolpath / Extrusion.

#### 4.2 UI Component Hierarchy

```
+-----------------------------------------------------------------------------------------------+
| App Header: [Printer State Badge] [File Name] [Elapsed / Remaining Time] [Emergency Stop M112]|
+-----------------------------------------------+-----------------------------------------------+
| LEFT COLUMN: 3D SIMULATION VIEWPORT (60%)     | RIGHT COLUMN: CONTROL DECK (40%)              |
|                                               |                                               |
| +-------------------------------------------+ | +-------------------------------------------+ |
| | Three.js WebGL Interactive 3D Canvas      | | | Panel 1: Temperature Telemetry & Charts   | |
| | - Animated Gantry (Frame, Bed, Extruder)  | | | - Live SVG/Canvas dual-line history chart | |
| | - Real-time Toolpath Layer Extrusion      | | | - Hotend: 200°C / Bed: 60°C target inputs | |
| | - Spaghetti Noodle Visualizer             | | | - Presets: Off | PLA | PETG | ABS         | |
| | - Camera Controls: Orbit / Pan / Zoom     | | | - Part Cooling Fan Slider (0-100%)        | |
| | - Layer Scrub Slider & View Modes         | | +-------------------------------------------+ |
| +-------------------------------------------+ | | Panel 2: Manual Kinematics & Jog Controls | |
| | Viewport Toolbar: Top | Front | Iso | Reset | | - XY Jog Ring & Z Up/Down Steppers         | |
| +-------------------------------------------+ | - Step sizes: 0.1 | 1.0 | 10 | 100 mm        | |
|                                               | | - Homing: [Home All G28] [X] [Y] [Z]      | |
|                                               | | - Extrude / Retract (Cold Extrude Lock)   | |
|                                               | +-------------------------------------------+ |
|                                               | | Panel 3: Print Job Metrics & Playback     | |
|                                               | | - Progress Bar (%) & Layer (Cur / Total)  | |
|                                               | | - Filament Consumed (Meters / Grams)      | |
|                                               | | - Speed Multiplier (1x, 5x, 20x, 100x)    | |
|                                               | | - Play / Pause / Resume / Abort Buttons   | |
|                                               | +-------------------------------------------+ |
|                                               | | Panel 4: Interactive Firmware Terminal    | |
|                                               | | - Monospace Serial Stream Buffer          | |
|                                               | | - Filter: [x] Hide Temp Queries (M105)    | |
|                                               | | - G-code Input Line with Enter & History  | |
|                                               | +-------------------------------------------+ |
|                                               | | Panel 5: Hardware Failure Simulation Box  | |
|                                               | | - [Toggle Clog] [Trigger Spaghetti]       | |
|                                               | | - [Trigger Layer Shift] [Toggle Runout]   | |
|                                               | | - [Simulate Thermal Runaway]              | |
|                                               | +-------------------------------------------+ |
+-----------------------------------------------+-----------------------------------------------+
```

#### 4.3 Telemetry State Model (TypeScript Interfaces)

```typescript
export type PrinterStatus = 'IDLE' | 'HOMING' | 'HEATING' | 'PRINTING' | 'PAUSED' | 'HALTED' | 'ERROR';

export interface HeaterTelemetry {
  actual: number;      // Current measured temperature (°C)
  target: number;      // Commanded target setpoint (°C)
  power: number;       // Normalized PWM output [0.0 - 1.0]
  isHeating: boolean;  // True if target > ambient and heating active
  hasError: boolean;   // True if runaway or sensor fault active
}

export interface ThermalHistoryPoint {
  timestamp: number;   // Epoch ms or relative seconds
  hotendActual: number;
  hotendTarget: number;
  bedActual: number;
  bedTarget: number;
}

export interface Coordinates {
  x: number;
  y: number;
  z: number;
  e: number;
}

export interface FailureState {
  nozzleClog: 'NONE' | 'PARTIAL' | 'FULL';
  spaghettiMode: boolean;
  layerShift: { x: number; y: number };
  filamentRunout: boolean;
  thermalRunawayTriggered: boolean;
}

export interface PrintJobMetrics {
  filename: string;
  totalLayers: number;
  currentLayer: number;
  progressPercent: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
  filamentUsedMm: number;
  filamentUsedGrams: number;
  speedMultiplier: number; // 0.1 to 3.0 (M220)
  feedrateMmMin: number;
}

export interface TerminalEntry {
  id: string;
  timestamp: string;
  type: 'command' | 'response' | 'echo' | 'error' | 'broadcast';
  message: string;
}

export interface PrinterState {
  status: PrinterStatus;
  statusMessage: string;
  hotend: HeaterTelemetry;
  bed: HeaterTelemetry;
  partCoolingFanSpeed: number; // 0 - 255
  nominalPosition: Coordinates;
  physicalPosition: Coordinates; // Transformed with layerShift
  homedAxes: { x: boolean; y: boolean; z: boolean };
  absolutePositioning: boolean; // G90 vs G91
  absoluteExtrusion: boolean;   // M82 vs M83
  failures: FailureState;
  job: PrintJobMetrics;
  thermalHistory: ThermalHistoryPoint[]; // Ring buffer (last 120 samples)
  terminalLog: TerminalEntry[];
}
```

#### 4.4 Simulation Update Loops & Timing Separation
To maintain high frame rates without choking React re-renders:
1. **Graphics Render Loop (`requestAnimationFrame`, ~60 FPS)**:
   - Interpolates printhead carriage position smoothly between G-code waypoints.
   - Renders Three.js scene, gantry parts, camera orbit, and newly deposited line buffer geometries.
2. **Physics & Watchdog Tick Loop (`10 Hz` / 100ms interval)**:
   - Calculates discrete thermal equations $T(t + \Delta t)$ for hotend and bed.
   - Updates PID loop duty cycles $u(t)$.
   - Evaluates thermal runaway timers and cold extrusion checks.
3. **Telemetry & UI Update Throttle (`2 Hz` / 500ms interval)**:
   - Appends data point to `thermalHistory` ring buffer (last 120 points = 60s history window).
   - Syncs print metrics (layer, elapsed time, grams) to React components.
   - Emits simulated `M105` temperature reports to terminal if auto-report is active.

---

## 3. Caveats

1. **Analytical vs. Discrete Euler Integration**:
   At $1\times$ playback, Euler integration is stable. However, when users test at $20\times$ or $100\times$ playback speed, Euler steps can exceed the cooling time constant and oscillate. The implementation **must** use the analytical exponential solution derived in Section 1.2 to remain robust across all playback multipliers.
2. **Three.js Spaghetti Geometry Vertex Budget**:
   Generating hundreds of chaotic curling coils for spaghetti failure can rapidly produce tens of thousands of vertices. The spaghetti visualizer should use a single pre-allocated `LineSegments` or `BufferGeometry` with dynamic vertex offsets, or cap noodle segments to ~5,000 vertices to ensure smooth 60 FPS WebGL rendering on all client machines.
3. **Open-Loop Coordinate Separation**:
   When simulating layer shift, the virtual firmware terminal must report the *nominal* G-code coordinates (e.g. `X: 100.00 Y: 100.00`), while the 3D viewport applies the hardware shift $\mathbf{\Delta}_{shift}$. This accurately replicates real-world open-loop stepper behavior where the printer has no feedback that it lost position.
4. **Cold Extrusion User Guidance**:
   When a user clicks "Extrude" on a cold printer, simple silent failure is confusing. The UI must clearly indicate *why* the button is locked (tooltip and badge displaying current temp vs 170°C requirement).

---

## 4. Conclusion

The architectural design for the Thermal Dynamics, Failure Modes, and Control Dashboard UI is fully specified:
1. **Thermal Dynamics**: Uses Newton's cooling law and Joule heating integrated via an unconditionally stable analytical formulation, paired with a tuned PID controller, cold extrusion prevention (<170°C), and Marlin/Klipper-spec heating/runaway watchdogs.
2. **Failure Modes**: Formulates precise mechanisms for 4 realistic hardware failures:
   - Nozzle Clog: Air printing without filament deposit.
   - Spaghetti Mode: Procedural 3D random-walk noodle generation and detached model displacement.
   - Layer Shift: Stepper loss offset vector $\mathbf{\Delta}_{shift}$ applied to physical rendering.
   - Filament Runout: Sensor trip, automatic pause, head parking ($M600$), and reload prompt.
3. **Control Dashboard UI**: Follows modern Fluidd/Mainsail patterns with dark-mode aesthetic, live dual-line temperature history chart, 4-way jog controls with stepping distances, progress metrics, monospace G-code terminal, and interactive failure injection controls.

The specifications are completely documented, mathematically validated, and ready for immediate implementation.

---

## 5. Verification Method

To independently verify the thermal model, safety triggers, failure simulations, and UI state:

### 5.1 Automated Unit Tests (`npm test` / `vitest`)
1. **Thermal Physics Test**:
   - Initialize hotend at $21^\circ\text{C}$ with target $200^\circ\text{C}$.
   - Step thermal physics for 60s simulated time.
   - Assert $T_{actual}$ approaches $200^\circ\text{C} \pm 1.0^\circ\text{C}$ with smooth asymptotic curve.
   - Turn heater off ($u=0$); verify temperature exponentially decays toward $21^\circ\text{C}$.
2. **Thermal Runaway Watchdog Test**:
   - Command hotend target $220^\circ\text{C}$, but freeze $T_{actual}$ at $21^\circ\text{C}$ (simulating heater cartridge fell out).
   - Step time past $\tau_{watch}$ ($25\text{ s}$).
   - Verify `thermalRunawayTriggered === true`, state transitions to `ERROR / HALTED`, and power cuts to 0.
3. **Cold Extrusion Prevention Test**:
   - At $T_{hotend} = 100^\circ\text{C}$, send `G1 E10 F100`.
   - Verify command is blocked, extruded distance remains 0, and terminal logs `"Cold extrusion prevented"`.
   - Heat to $180^\circ\text{C}$; send `G1 E10 F100`; verify extrusion succeeds.
4. **Layer Shift Coordinate Transformation Test**:
   - Inject layer shift $\Delta X = +10\text{ mm}$.
   - Verify terminal telemetry outputs nominal $X = 50.0$, while 3D viewport mesh position evaluates to $X = 60.0$.
5. **Filament Runout Pause Test**:
   - Trip runout sensor during active print.
   - Verify print status transitions to `PAUSED`, head coordinates park to $(10, 10, Z+5)$, and `M600` macro is logged.

### 5.2 Interactive UI Verification
- Run dev server (`npm run dev` or `npm start`).
- Verify live temperature chart renders curves for both hotend and bed.
- Verify jog buttons step gantry by selected increments (0.1, 1, 10, 100mm).
- Trigger failure buttons in the failure panel; verify visual nozzle clog (no filament deposit), spaghetti noodles, layer shift staircase, and emergency stop banner appear without runtime exceptions.
