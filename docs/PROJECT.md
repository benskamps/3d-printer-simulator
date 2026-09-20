# Project: 3D Printer Simulator

## Architecture
An interactive, high-performance web-based 3D printer simulator featuring real-time 3D toolpath extrusion, Cartesian printer kinematics, thermal dynamics, failure mode simulations, and an OctoPrint/Klipper/Fluidd/Mainsail-style control dashboard.

- **Frontend & Build**: Vite + React 18/19 + TypeScript + Tailwind CSS + Lucide Icons.
- **3D Viewport Engine**: Decoupled imperative Three.js viewport (`ThreePrinterViewport`) with orbit/pan/zoom controls, animated Cartesian gantry, parented bed-slinger hierarchy, and hybrid toolpath renderer (Dynamic `BufferGeometry` LineSegments for 200,000+ vector paths with single draw call + Chunked `InstancedMesh` for volumetric beads).
- **Core Kinematics & Motion**: Modal coordinate tracker, feedrate converter (mm/min to mm/s), smooth interpolation, and accumulator-based time budget loop supporting 1x to 100x playback speed multipliers without UI freezing.
- **Physics & Safety**: Unconditionally stable analytical exponential thermal integration ($T(t+\Delta t) = T_\infty + (T(t)-T_\infty)e^{-\lambda \Delta t}$) with tuned PID controllers for 40W hotend and 220W bed, cold extrusion interlock (<170°C), and Marlin/Klipper-spec heating/runaway safety watchdogs with emergency shutdown ($M112$).
- **Hardware Failure Engine**: Simulation toggles for nozzle clogs (air printing), bed adhesion failure / spaghetti mode (procedural 3D brownian curl noodles + detached part displacement), layer shift (hardware offset vector $\mathbf{\Delta}_{shift}$), and filament runout (sensor trip, M600 pause, head parking at 10,10,Z+5, and UI reload prompt).
- **Control Dashboard & Virtual Firmware**: Responsive dark-slate layout inspired by Fluidd/Mainsail, live rolling temperature history charts, manual jog controls (0.1/1/10/100mm stepping, homing, extrude/retract), interactive monospace terminal with standard serial responses (`ok`, `T:... / ...`, `echo: ...`, `Error: ...`), print progress metrics, layer scrubber slider, pre-sliced samples (Calibration Cube, 3DBenchy, Quick Pad), and drag-and-drop file upload.

---

## Feature Inventory
Every feature from the survey and requirements is enumerated below and mapped to a specific milestone.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Lexical G-Code Parser | Cleans whitespace, strips comments (`;`, `//`, `()`), extracts line numbers/checksums, parses commands and numeric parameters | M1 | Survey 2 / R2 |
| 2 | Modal State Machine | Tracks persistent feedrate `F`, coordinate mode (`G90`/`G91`), extruder mode (`M82`/`M83`), and current coordinate registers `(X, Y, Z, E)` | M1 | Survey 2 / R2 |
| 3 | Linear Motion (`G0`/`G1`) | Translates 3D coordinates, handles feedrate velocity, calculates move duration, and generates toolpath segments | M1 | Survey 2 / R1 / R2 |
| 4 | Auto Homing (`G28`) | Homes specified or all axes to `(0, 0, 0)`, updates `isHomed` flags, and transitions coordinates | M1 | Survey 2 / R1 / R2 |
| 5 | Coordinate Reset (`G92`) | Redefines internal position offsets without physical movement; handles `G92 E0` layer resets | M1 | Survey 2 / R2 |
| 6 | Extrusion Modes (`M82`/`M83`) | Supports absolute cumulative extrusion and relative incremental extrusion per move | M1 | Survey 2 / R2 |
| 7 | Motion Interpolator & Speed Scaling | Accumulator-based time budget loop supporting 1x, 5x, 20x, and 100x playback speed multipliers | M1 | Survey 1, 2 / R2 |
| 8 | Playback Controls | Play, pause, resume, single-step, and abort execution state transitions | M1 | Survey 2 / R2 |
| 9 | Pre-sliced Sample Models | Bundled G-code assets for Calibration Cube (20mm), 3DBenchy, and 5-layer Quick Test Pad | M1 | Survey 2 / R2 |
| 10 | Thermal Physics ODE | Discrete exponential solution of Joule heating and Newton's law of cooling for hotend and bed | M2 | Survey 3 / R3 |
| 11 | PID Temperature Control | Discrete PID controllers with anti-windup clamping for hotend and heated bed setpoints | M2 | Survey 3 / R3 |
| 12 | Temperature G-Codes | `M104`/`M140` (async set), `M109`/`M190` (blocking wait), and `M105` (query telemetry) | M2 | Survey 2, 3 / R2, R3 |
| 13 | Part Cooling Fan (`M106`/`M107`) | PWM duty cycle control (0-255) affecting convective cooling rate | M2 | Survey 2, 3 / R2 |
| 14 | Cold Extrusion Prevention | Blocks filament deposition and warns user when hotend temperature is below 170°C | M2 | Survey 2, 3 / R3 |
| 15 | Thermal Runaway Watchdog | Marlin/Klipper-spec heating rise detector, in-range temperature stability monitor, and sensor fault trip | M2 | Survey 3 / R3 |
| 16 | Emergency Halt (`M112`) | Immediate heater power cutoff, fan 100%, steppers disabled, and firmware error halt state | M2 | Survey 3 / R3 |
| 17 | Nozzle Clog Simulation | Hardware failure toggle causing extrusion to halt while carriage motion continues (air printing) | M2 | Survey 3 / R3 |
| 18 | Spaghetti Mode Simulation | Hardware failure toggle generating procedural 3D brownian curl noodle geometry and detached model offset | M2 | Survey 3 / R3 |
| 19 | Layer Shift Simulation | Hardware failure injecting coordinate offset vector $\mathbf{\Delta}_{shift}$ into physical rendering | M2 | Survey 3 / R3 |
| 20 | Filament Runout Simulation | Hardware failure sensor trip triggering automatic M600 pause, head parking at (10, 10, Z+5), and reload prompt | M2 | Survey 3 / R3 |
| 21 | Centralized Telemetry Store | Reactive state store synchronizing kinematics, thermals, failures, job progress, and terminal log | M2 | Survey 3 / R4 |
| 22 | Three.js Viewport Environment | 3D canvas with studio lighting, shadows, ground grid, origin triad, and OrbitControls (orbit, pan, zoom) | M3 | Survey 1 / R1 |
| 23 | Cartesian Gantry Scene Graph | Fixed base chassis, heated bed (translates Y), vertical Z gantry (translates Z), and toolhead carriage (translates X) | M3 | Survey 1 / R1 |
| 24 | Parented Toolpath Hierarchy | Deposited filament geometry parented to Heated Bed Assembly so printed plastic translates synchronously in Y | M3 | Survey 1 / R1 |
| 25 | High-Speed Buffer Extrusion | Dynamic `BufferGeometry` LineSegments for 200,000+ vector paths rendered in a single GPU draw call | M3 | Survey 1 / R1 |
| 26 | Volumetric Bead Extrusion | Chunked `InstancedMesh` with unit box geometry for photorealistic solid extrusion lines with lighting | M3 | Survey 1 / R1 |
| 27 | Layer Slicing Preview & Scrubbing | Dynamic layer filtering via `setDrawRange` allowing instant layer-by-layer inspection slider | M3 | Survey 1 / R1 |
| 28 | Viewport Camera Presets | Isometric, Top-down, Front, and Nozzle-follow camera views | M3 | Survey 1 / R1 |
| 29 | Failure Visuals in Viewport | 3D procedural spaghetti noodles, sheared layer shift geometry, and glowing nozzle bead | M3 | Survey 1, 3 / R1, R3 |
| 30 | Fluidd/Mainsail Dashboard Layout | Responsive dark-slate web interface with header, viewport column, and modular control deck panels | M4 | Survey 3 / R4 |
| 31 | Live Temperature History Chart | Real-time SVG/Canvas dual-line temperature history chart displaying hotend and bed actual vs target curves | M4 | Survey 3 / R4 |
| 32 | Manual Jog Controls | Stepping controls for X, Y, Z (0.1, 1, 10, 100mm increments), Home All / Individual, and Extrude/Retract buttons | M4 | Survey 3 / R4 |
| 33 | Virtual Firmware Terminal | Monospace interactive serial console with command history, sending arbitrary G-code, and standard responses | M4 | Survey 2, 3 / R4 |
| 34 | Print Metrics Panel | Displays current layer / total layers, elapsed time, estimated time remaining (ETA), and filament consumed | M4 | Survey 2, 3 / R4 |
| 35 | Model Selector & File Upload | Dropdown for bundled sample models (Cube, Benchy, Pad) and drag-and-drop user `.gcode` file ingestion | M4 | Survey 2 / R2 |
| 36 | Hardware Failure Control Panel | Interactive toggles to inject nozzle clog, spaghetti mode, layer shift, filament runout, and thermal runaway | M4 | Survey 3 / R3 |
| 37 | E2E Test Suite Tiers 1-4 | Automated opaque-box unit and integration tests verifying parser, kinematics, thermal ODE, safety, and models | M5 | Verification Plan |
| 38 | Smoke Test & Build Script | Headless browser smoke test and production build validation verifying zero unhandled browser errors | M5 | Acceptance Criteria |
| 39 | Adversarial Coverage Hardening | Tier 5 white-box stress testing, boundary fuzzing, and robustness hardening | M5 | Project Pattern |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Kinematics & G-Code Engine | G-Code lexer/parser, modal state machine, Cartesian coordinate math, accumulator motion interpolator, playback controls, and bundled sample G-code models. Complete with unit test suite. | none | DONE |
| M2 | Thermal Dynamics & Failure Simulators | Analytical exponential thermal ODE, tuned PID controllers, cold extrusion guard, runaway safety watchdogs, emergency stop, 4 failure mode mechanics, and centralized telemetry store. | M1 contracts | DONE |
| M3 | 3D Viewport & Extrusion Rendering | Decoupled Three.js viewport, Cartesian gantry scene graph, parented bed hierarchy, dynamic LineSegments and InstancedMesh toolpath buffers, layer scrubber, camera presets, and failure visuals. | M1, M2 contracts | DONE |
| M4 | Control Dashboard & Virtual Firmware Terminal | Fluidd/Mainsail dark-slate web UI, live temperature charts, manual jog dials, interactive monospace terminal, print metrics, model selector & upload, and failure toggles. | M1, M2, M3 | DONE |
| M5 | E2E Integration, Dual-Track Tests, & Hardening | Full integration pass, passing 100% of E2E test suite (Tiers 1-4: Feature, Boundary, Pairwise, Workloads), Tier 5 adversarial stress testing, and single-command local runnability verification. | M1, M2, M3, M4 | IN_PROGRESS |

---

## Interface Contracts

### 1. `src/core/kinematics/types.ts`
```typescript
export interface AxisCoordinates {
  x: number; // mm (0 to 220)
  y: number; // mm (0 to 220)
  z: number; // mm (0 to 250)
  e: number; // mm cumulative extruded filament
}

export interface IKinematicState {
  currentPosition: AxisCoordinates;
  targetPosition: AxisCoordinates;
  feedrate: number; // mm/min
  isHomed: { x: boolean; y: boolean; z: boolean };
  isRelativePositioning: boolean; // G90 vs G91
  isRelativeExtruder: boolean;    // M82 vs M83
  steppersEnabled: boolean;
  fanSpeed: number; // 0.0 to 1.0 (PWM duty cycle)
  speedOverride: number; // M220 factor (100 = 100%)
  flowOverride: number;  // M221 factor (100 = 100%)
  layerShiftOffset: { x: number; y: number };
  activeLayer: number;
  totalLayers: number;
  isExtruding: boolean;
}

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

export interface ToolpathSegment {
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  extrusionLength: number; // mm of filament pushed
  feedrate: number;        // mm/min
  type: ToolpathType;
  layerIndex: number;
  commandIndex: number;
}
```

### 2. `src/core/thermal/types.ts`
```typescript
export interface HeaterTelemetry {
  actual: number;      // Current measured temperature (°C)
  target: number;      // Commanded target setpoint (°C)
  power: number;       // Normalized PWM output [0.0 - 1.0]
  isHeating: boolean;  // True if target > ambient and heating active
  hasError: boolean;   // True if runaway or sensor fault active
}

export interface ThermalHistoryPoint {
  timestamp: number;
  hotendActual: number;
  hotendTarget: number;
  bedActual: number;
  bedTarget: number;
}

export interface IThermalModel {
  update(deltaTimeSeconds: number): void;
  getHotend(): HeaterTelemetry;
  getBed(): HeaterTelemetry;
  setHotendTarget(target: number): void;
  setBedTarget(target: number): void;
  setFanSpeed(fanDutyCycle: number): void;
  isTargetReached(heater: 'hotend' | 'bed', toleranceCelsius: number): boolean;
  canExtrude(): boolean; // Checks hotend >= 170°C
  isThermalRunaway(): boolean;
  triggerEmergencyStop(): void;
  resetFaults(): void;
}
```

### 3. `src/core/failures/types.ts`
```typescript
export interface FailureConfig {
  nozzleClog: 'NONE' | 'PARTIAL' | 'FULL';
  spaghettiMode: boolean;
  layerShift: { x: number; y: number };
  filamentRunout: boolean;
  thermalRunawaySimulated: boolean;
}

export interface IFailureManager {
  getConfig(): FailureConfig;
  setNozzleClog(mode: 'NONE' | 'PARTIAL' | 'FULL'): void;
  setSpaghettiMode(active: boolean): void;
  triggerLayerShift(offsetX: number, offsetY: number): void;
  setFilamentRunout(active: boolean): void;
  simulateThermalRunaway(heater: 'hotend' | 'bed'): void;
  resetAllFailures(): void;
}
```

### 4. `src/viewport/types.ts`
```typescript
export interface IPrinterViewportController {
  init(canvas: HTMLCanvasElement): void;
  dispose(): void;
  updateKinematics(kinematics: IKinematicState): void;
  appendExtrusionSegment(segment: ToolpathSegment): void;
  clearToolpaths(): void;
  setLayerFilter(minLayer: number, maxLayer: number): void;
  setRenderMode(mode: 'lines' | 'volumetric'): void;
  setCameraPreset(preset: 'isometric' | 'top' | 'front' | 'nozzle_follow'): void;
  triggerFailureVisual(failureType: 'clog' | 'spaghetti' | 'layer_shift' | 'thermal_runaway', active: boolean): void;
}
```

---

## Code Layout

```
zealous-brahmagupta/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── public/
│   └── samples/
│       ├── calibration_cube.gcode
│       ├── 3d_benchy.gcode
│       └── quick_pad.gcode
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── core/
│   │   ├── kinematics/
│   │   │   ├── types.ts
│   │   │   ├── CartesianKinematics.ts
│   │   │   └── MotionInterpolator.ts
│   │   ├── gcode/
│   │   │   ├── types.ts
│   │   │   ├── GCodeParser.ts
│   │   │   ├── GCodeExecutor.ts
│   │   │   └── sampleModels.ts
│   │   ├── thermal/
│   │   │   ├── types.ts
│   │   │   ├── ThermalModel.ts
│   │   │   └── PIDController.ts
│   │   ├── failures/
│   │   │   ├── types.ts
│   │   │   ├── FailureManager.ts
│   │   │   └── SpaghettiGenerator.ts
│   │   └── telemetry/
│   │       ├── types.ts
│   │       └── TelemetryStore.ts
│   ├── viewport/
│   │   ├── types.ts
│   │   ├── ThreePrinterViewport.ts
│   │   ├── PrinterChassisMesh.ts
│   │   ├── HeatedBedMesh.ts
│   │   ├── ToolheadMesh.ts
│   │   └── ToolpathBufferManager.ts
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── FluiddDashboard.tsx
│   │   │   ├── ViewportContainer.tsx
│   │   │   ├── TemperaturePanel.tsx
│   │   │   ├── JogControlPanel.tsx
│   │   │   ├── PrintStatusPanel.tsx
│   │   │   ├── GCodeTerminal.tsx
│   │   │   ├── FailureControls.tsx
│   │   │   └── LayerScrubber.tsx
│   │   └── common/
│   └── test/
│       ├── e2e/
│       │   ├── harness.ts
│       │   ├── tier1_features.test.ts
│       │   ├── tier2_boundaries.test.ts
│       │   ├── tier3_pairwise.test.ts
│       │   ├── tier4_scenarios.test.ts
│       │   └── tier5_adversarial.test.ts
│       ├── unit/
│       │   ├── gcode-parser.test.ts
│       │   ├── kinematics.test.ts
│       │   ├── thermal-model.test.ts
│       │   ├── failure-modes.test.ts
│       │   └── toolpath-buffer.test.ts
│       └── smoke-test.mjs
```
