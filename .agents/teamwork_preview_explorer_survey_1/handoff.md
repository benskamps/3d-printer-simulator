# Technical Architecture & 3D Kinematic Viewport Survey Report

**Author**: teamwork_preview_explorer_survey_1  
**Date**: 2026-09-20T03:33:00Z  
**Target Milestone**: Architecture & 3D Kinematics Survey  
**Working Directory**: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_explorer_survey_1`

---

## 1. Observation

### 1.1 Authoritative Requirements Observation
- **Source**: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md`
  - Lines 5-8: *"An interactive, web-based 3D printer simulator featuring real-time 3D toolpath extrusion, printer kinematics, thermal dynamics, failure mode simulations, and an OctoPrint/Klipper-style dashboard. Working directory: ~/teamwork_projects/3d_printer_simulator. Integrity mode: development."*
  - Lines 12-13 (R1. 3D Viewport & Kinematic Simulation): *"Build an interactive 3D rendering environment representing a cartesian (or coreXY) 3D printer (chassis, heated bed, gantry, and extruder printhead). As print moves execute, the printhead must smoothly interpolate in 3D space corresponding to axis coordinates (X, Y, Z), and deposit visual filament lines/layers onto the build plate in real time. Include orbit, pan, zoom controls, and a layer slicing preview."*
  - Lines 30-36 (Verification Plan): *"An automated unit test suite (e.g., Jest, Vitest, or Node-based test runner) validating... Coordinate kinematics state machine responds accurately to homing (G28) and relative/absolute positioning commands. An end-to-end verification script or smoke test verifying the app builds without errors, serves via a lightweight static server, and renders without console runtime exceptions."*
  - Line 43: *"The application is completely runnable locally with a single setup/start command (e.g. npm install && npm start or npm run dev) and produces zero unhandled browser errors during standard operation."*

### 1.2 Host Environment & Workspace Observation
- **OS**: Windows 11 Pro 64-bit (`Version 10.0.22621`, verified via CIM `Win32_OperatingSystem`).
- **Node.js**: `v22.23.2` (verified via `node -v`).
- **npm**: `10.9.8` (verified via `npm -v`).
- **Git**: On branch `master`, initial commit `908b9ac6e85a87d045eeab4b92063d5c806e7e5a`.
- **Workspace Path**: `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta`.
- **Requested Path**: `~/teamwork_projects/3d_printer_simulator` (`C:\Users\beschipp\teamwork_projects\3d_printer_simulator`).
  - Initially non-existent (`Test-Path` returned `False`).
  - Successfully linked via NTFS Directory Junction:
    `New-Item -ItemType Junction -Path "C:\Users\beschipp\teamwork_projects\3d_printer_simulator" -Target "c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta"`. Verified `LinkType : Junction`.

### 1.3 Peer Agent Coordination Observation
- `teamwork_preview_spec_miner_survey_1`: Responsible for G-Code parsing syntax, linear feedrates, state transitions (G0/G1/G28/G90/G91/G92/M104/M109/M140/M190/M106/M107/M82/M83), bundled sample G-codes, and firmware terminal protocol.
- `teamwork_preview_explorer_survey_3`: Responsible for Thermal Dynamics math ($T(t+dt)$), runaway safety detection, failure modes (nozzle clog, spaghetti mode, layer shift, filament runout), and Fluidd/Mainsail dashboard UI layout.

---

## 2. Logic Chain

### 2.1 Tech Stack Selection & Justification
- **Observation 1.1**: Application demands an interactive 3D rendering environment, real-time toolpath extrusion, layer slicing preview, and an OctoPrint/Fluidd/Mainsail control dashboard with zero unhandled browser errors.
- **Deduction 2.1.1 (Framework)**: **Vite + React 18/19 + TypeScript**:
  - React provides modular component decomposition for the Fluidd/Mainsail dashboard panels (temperature graphs, jog controllers, terminal logs, print progress metrics, layer slider).
  - TypeScript provides end-to-end type safety for kinematic vectors, G-code instructions, telemetry packets, and failure configurations.
  - Vite delivers sub-second Hot Module Replacement (HMR) and optimized Rollup-based production bundling.
- **Deduction 2.1.2 (3D Engine)**: **Three.js (Direct Imperative Engine via React `<canvas>` wrapper)** vs `@react-three/fiber`:
  - In 3D printer simulation with playback speed multipliers up to 100x, several hundred toolpath extrusion moves may execute per second.
  - `@react-three/fiber` wraps Three.js objects in React Fiber reconciler nodes. Driving thousands of geometry mutations per second through React's reconciler triggers garbage collection stalls and frame drops.
  - Recommended Architecture: A clean TypeScript class (`ThreePrinterViewport`) that directly manages `THREE.Scene`, `THREE.PerspectiveCamera`, `THREE.WebGLRenderer`, `OrbitControls`, and a decoupled `requestAnimationFrame` render loop. React connects via a single `<canvas ref={canvasRef} />` and receives throttled state snapshots (e.g. 15-30Hz) via callback or event listener, ensuring 60fps WebGL rendering is completely uninhibited by React re-renders.

### 2.2 3D Kinematics & Scene Graph Hierarchy
- **Observation 1.1 (R1)**: Cartesian (or CoreXY) printer with chassis, heated bed, gantry, and extruder printhead. Printhead must smoothly interpolate in 3D space corresponding to axis coordinates (X, Y, Z).
- **Physical Kinematics Realism**:
  - In a standard Cartesian "bed-slinger" (e.g. Prusa i3 / Ender 3 architecture):
    - The chassis is stationary on the ground.
    - The **Heated Bed** translates along the Y-axis ($[0, Y_{\text{max}}]$).
    - The **Z-Gantry** translates vertically along the Z-axis ($[0, Z_{\text{max}}]$).
    - The **Toolhead Carriage** translates horizontally along the X-axis ($[0, X_{\text{max}}]$) on the Z-Gantry.
  - **Critical Scene Graph Insight**:
    - Deposited filament is physically adhered to the build plate. Therefore, in the Three.js scene graph, the `ToolpathMeshGroup` MUST be a child of the `HeatedBedAssembly`!
    - If the toolpaths were placed in world space, moving the bed in Y would visually detach the printed model from the bed. Parenting toolpaths to `HeatedBedAssembly` ensures that whenever the bed moves in Y, all printed plastic moves synchronously with it.
  - **Scene Graph Tree**:
    ```
    THREE.Scene
      ├── Lights (DirectionalLight with soft shadows, AmbientLight, HemisphereLight)
      ├── Studio Environment (Ground grid, origin triad, measurement scale)
      └── PrinterChassisGroup (Fixed base frame, rubber feet, aluminum extrusions)
            ├── HeatedBedAssembly (Translates along Y: [0, -Y_rel])
            │     ├── BedHeaterPlate (Aluminum bed + silicone heater pad)
            │     ├── SpringSteelSheet (Textured PEI build plate, grid markings 220x220mm)
            │     ├── LevelingKnobs (4 corner thumbscrews)
            │     └── PrintedFilamentContainer (THREE.Group: contains all deposited extrusion geometry)
            ├── ZTowerLeft & ZTowerRight (2040 V-slot vertical pillars)
            ├── ZLeadScrews & StepperMotors
            └── ZAxisGantryAssembly (Translates along Z: [0, +Z_rel])
                  ├── XAxisExtrusionBeam (Horizontal 2020 rail)
                  ├── XAxisBelt & Pulley
                  └── ToolheadCarriage (Translates along X: [0, +X_rel])
                        ├── StepperMotor (NEMA 17 extruder drive)
                        ├── Heatsink & Cold End Fan (Spins when hotend > 50°C)
                        ├── HeaterBlock & Thermistor (Emits red glow when heated)
                        ├── BrassNozzleTip (0.4mm nozzle orifice at relative [0,0,0])
                        ├── PartCoolingFanDuct (Visual airflow indicator)
                        ├── DynamicExtrusionCursor (Glowing filament bead at current tip)
                        └── FilamentGuideTube (Curved CatmullRomCurve3 from spool to toolhead)
    ```

### 2.3 High-Performance Toolpath Extrusion Architecture
- **Observation 1.1 (R1 & R2)**: Real-time extrusion of thousands of moves + layer slicing preview. Playback speed 1x to 100x.
- **Rendering Challenge**: Creating a new `THREE.Mesh` or `THREE.Line` per G1 command creates tens of thousands of draw calls, causing catastrophic browser lag (< 5 FPS).
- **Dual-Mode Rendering Engine (Hybrid Solution)**:
  1. **Mode A: Dynamic BufferGeometry LineSegments ("Fast Vector Toolpath")**:
     - Pre-allocate a single `THREE.BufferGeometry` with typed arrays:
       - `positionBuffer`: `Float32Array(MAX_SEGMENTS * 2 * 3)`
       - `colorBuffer`: `Float32Array(MAX_SEGMENTS * 2 * 3)`
     - Each extrusion move adds two 3D vertices: $P_{\text{start}}(x, y, z)$ and $P_{\text{end}}(x, y, z)$.
     - Colors dynamically encode: Layer index, feedrate speed (heat-map palette), or print feature (Perimeter: orange, Infill: cyan, Support: green, Travel: faint dashed grey).
     - GPU Draw Calls: Exactly **1 draw call** using `geometry.setDrawRange(0, activeSegments * 2)`.
     - Performance: Capable of rendering 200,000+ segments at continuous 60 FPS.
  2. **Mode B: Chunked InstancedMesh ("Photorealistic Volumetric Beads")**:
     - Real 3D printing deposits volumetric beads with layer height $h$ (e.g. 0.2mm) and extrusion width $w$ (e.g. 0.45mm).
     - Pre-allocate `THREE.InstancedMesh` with a unit box geometry `BoxGeometry(1, 1, 1)`.
     - For each move between $P_0$ and $P_1$:
       - Midpoint: $M = \frac{P_0 + P_1}{2}$.
       - Length: $L = \|P_1 - P_0\|$.
       - Orientation: Quaternion aligning unit X-axis with $P_1 - P_0$.
       - Scale: $(L, w, h)$.
       - Set transform via `instancedMesh.setMatrixAt(index, matrix)`.
       - Set color via `instancedMesh.setColorAt(index, color)`.
     - Chunked into batches of 20,000 instances to allow dynamic allocation without unbounded memory pre-allocation.
     - Performance: GPU hardware instancing allows up to 50,000 solid volumetric beads rendered in a single draw call with real lighting, reflections, and shadow mapping.
  3. **Live Nozzle Bead**:
     - A dynamic single cylinder/sphere positioned directly between the nozzle orifice and the current interpolated move progress, giving the visual appearance of molten plastic flowing from the nozzle.
  4. **Layer Slicing & Scrubbing**:
     - Controlled instantaneously by adjusting `geometry.setDrawRange(0, layerEndIndex * 2)` or `instancedMesh.count = layerInstanceCount`.
     - Zero geometry recalculation required when scrubbing the layer slider.

### 2.4 Kinematics Smooth Interpolation & Motion Engine
- **Feedrate Handling**: G-code feedrate $F$ is in millimeters per minute ($\text{mm/min}$).
  - Velocity: $v = \frac{F}{60}\;\text{mm/s}$.
  - Move length: $\Delta d = \sqrt{(x_1 - x_0)^2 + (y_1 - y_0)^2 + (z_1 - z_0)^2}$.
  - Move nominal duration: $\Delta t_{\text{nom}} = \frac{\Delta d}{v}$.
- **Smooth Trajectory Interpolation**:
  - Standard linear lerp with acceleration profiling:
    $$\vec{P}(s) = \vec{P}_0 + s \cdot (\vec{P}_1 - \vec{P}_0), \quad s \in [0, 1]$$
  - Acceleration-limited S-curve / trapezoid profiling:
    - Default acceleration: $a = 1500\,\text{mm/s}^2$.
    - Smooth start and stop for rapid G0/G1 moves eliminates robotic visual snapping.
- **High-Speed Catchup (20x - 100x Speed Multiplier)**:
  - In each animation frame, delta time is scaled: $dt_{\text{sim}} = dt_{\text{real}} \cdot \text{speedMultiplier}$.
  - If $dt_{\text{sim}} > \Delta t_{\text{remaining}}$ for the current move:
    - Complete the current move (finalize extrusion segment into buffer).
    - Consume subsequent moves in the queue until $dt_{\text{sim}}$ is exhausted or queue is empty.
    - Set final carriage position to the interpolated point of the active move.
    - Update WebGL buffer draw range once per frame, avoiding per-move GPU stalls.

### 2.5 Failure Mode 3D Visual Rendering
- **Nozzle Clog**:
  - Kinematic carriage moves along toolpath normally, but `isExtruding = false`.
  - No extrusion segments are added to the buffer. Result: Visible gap/void in the printed layers.
- **Bed Adhesion Failure ("Spaghetti Mode")**:
  - The printed part detaches from the bed.
  - When active, the toolpath generator perturbs extrusion endpoints using 3D random brownian motion / curled spirals:
    $$P_{\text{spaghetti}}(t) = P_{\text{toolhead}}(t) + \begin{pmatrix} r \cos(\omega t) \\ r \sin(\omega t) \\ -z_{\text{drift}} \end{pmatrix}$$
  - Creates a chaotic bird's-nest cluster of drooped noodles beneath the nozzle.
- **Layer Shift**:
  - Injects a persistent offset $(\Delta x, \Delta y)$ (e.g. $+8\,\text{mm}$ in X) into the kinematic coordinate register.
  - All subsequent extrusion vertices are translated by this offset, producing a visible sheared step in the printed model.
- **Filament Runout**:
  - Simulator pauses immediately. Toolhead stops. Visual red warning indicator triggers on extruder runout sensor.

---

## 3. Caveats

1. **Hardware Acceleration Dependency**:
   - WebGL 2.0 / Three.js performance is dependent on the host client browser having hardware acceleration enabled. On low-end VMs without hardware GPU pass-through, the "Fast Vector Toolpath" (LineSegments) mode should be default rather than Volumetric Beads.
2. **WebGL Thin Lines on Windows ANGLE**:
   - Standard WebGL `gl.lineWidth` is clamped to 1.0 by ANGLE on Chromium Windows.
   - For thick line rendering, Three.js fat lines (`LineSegments2` with `LineMaterial`) or the recommended `InstancedMesh` volumetric mode provides the solution.
3. **Workspace Symlink Behavior**:
   - The junction from `C:\Users\beschipp\teamwork_projects\3d_printer_simulator` to `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta` relies on Windows NTFS junction capabilities. This has been verified functional and active.

---

## 4. Conclusion & Recommended Architecture

### 4.1 Recommended Tech Stack
| Component | Technology | Version | Justification |
|---|---|---|---|
| **Build & Dev Tool** | Vite | `^5.4` / `^6.0` | Ultra-fast HMR, lightweight static build output, zero-config TS |
| **UI Framework** | React | `^18.3` | Modular dashboard panels, reactive telemetry hooks |
| **Language** | TypeScript | `^5.5` | Strict typing across kinematics, G-code instructions, and UI state |
| **3D Rendering** | Three.js | `^0.168` | Industry standard WebGL engine, rich lighting, OrbitControls, BufferGeometry |
| **Styling** | Tailwind CSS | `^3.4` | Dark-mode Fluidd/Mainsail industrial dashboard aesthetic |
| **Icons** | Lucide React | `^0.440` | Crisp UI icons for 3D printer controls (fans, heaters, axes, homing) |
| **Unit Testing** | Vitest | `^2.1` | Native Vite integration, fast ESM execution, compatible with Jest APIs |
| **Telemetry Charts** | Canvas / SVG / Chart.js | Custom / Recharts | Real-time 60-second rolling temperature graph (hotend & bed actual vs target) |

### 4.2 Project Directory Structure Proposal
```
zealous-brahmagupta/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── public/
│   ├── samples/
│   │   ├── calibration_cube.gcode
│   │   ├── 3d_benchy.gcode
│   │   └── bed_level_test.gcode
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── core/
│   │   ├── kinematics/
│   │   │   ├── CartesianKinematics.ts      # Axis calculations & coordinate transforms
│   │   │   ├── MotionInterpolator.ts       # Trapezoidal feedrate & time interpolation
│   │   │   └── types.ts                    # Kinematic state interfaces
│   │   ├── gcode/
│   │   │   ├── GCodeParser.ts              # Command line tokenizer & parser
│   │   │   ├── GCodeExecutor.ts            # Execution queue & state machine
│   │   │   └── types.ts                    # G-code command types
│   │   ├── thermal/
│   │   │   ├── ThermalModel.ts             # Differential heating/cooling equations
│   │   │   └── RunawaySafety.ts            # Open-loop & fluctuation detectors
│   │   ├── failures/
│   │   │   ├── FailureManager.ts           # Clog, spaghetti, layer shift, runout
│   │   │   └── SpaghettiGenerator.ts       # Brownian wander path generator
│   │   └── telemetry/
│   │       ├── TelemetryStore.ts           # Centralized reactive state store
│   │       └── types.ts                    # Telemetry data contracts
│   ├── viewport/
│   │   ├── ThreePrinterViewport.ts         # Direct Three.js scene & render loop controller
│   │   ├── PrinterChassisMesh.ts           # Procedural frame, extrusions, motors, rods
│   │   ├── HeatedBedMesh.ts                # Bed plate, PEI sheet, leveling knobs
│   │   ├── ToolheadMesh.ts                 # Carriage, hotend, heatsink, fan, nozzle
│   │   ├── ToolpathBufferManager.ts        # LineSegments & InstancedMesh buffer allocators
│   │   ├── ViewportCameraManager.ts        # OrbitControls & preset views (Iso, Top, Nozzle)
│   │   └── ViewportContainer.tsx           # React wrapper with resize observer & controls
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── FluiddDashboard.tsx         # Main Fluidd/Mainsail layout
│   │   │   ├── TemperaturePanel.tsx        # Live thermal history chart & target inputs
│   │   │   ├── JogControlPanel.tsx         # X/Y/Z stepping dials, homing buttons, extrude
│   │   │   ├── PrintStatusPanel.tsx        # Layer count, ETA, elapsed time, filament usage
│   │   │   ├── GCodeTerminal.tsx           # Pseudo-firmware console with command input & history
│   │   │   ├── FailureControls.tsx         # Toggles for clogs, spaghetti, layer shifts
│   │   │   └── LayerScrubber.tsx           # Layer slicing range preview slider
│   │   └── common/
│   └── test/
│       ├── kinematics.test.ts              # Coordinate transforms, homing, bounds tests
│       ├── motion-interpolator.test.ts     # Feedrate conversion & lerp accuracy
│       ├── gcode-parser.test.ts            # Parser validity for G0/G1/G28/M-codes
│       ├── thermal-model.test.ts           # Heating curves & runaway trip conditions
│       └── toolpath-buffer.test.ts         # Buffer allocation, draw range, and layer slicing
```

### 4.3 Interface Contracts Between 3D Viewport and System Modules

```typescript
// --- Kinematics State Contract ---
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
  absolutePositioning: boolean; // G90 vs G91
  absoluteExtrusion: boolean;   // M82 vs M83
  coordinateOffset: AxisCoordinates; // G92
  layerShiftOffset: { x: number; y: number };
  activeLayer: number;
  totalLayers: number;
  isExtruding: boolean;
  fanSpeed: number; // 0 - 255 (M106/M107)
}

// --- Extrusion Toolpath Segment Contract ---
export interface IToolpathSegment {
  id: number;
  start: [number, number, number];
  end: [number, number, number];
  extrusionLength: number; // mm of filament pushed
  feedrate: number;        // mm/min
  layerIndex: number;
  isExtrusion: boolean;    // true = print move, false = travel move
  feature: 'perimeter' | 'infill' | 'support' | 'travel';
}

// --- 3D Viewport Public Controller API ---
export interface IPrinterViewportController {
  init(canvas: HTMLCanvasElement): void;
  dispose(): void;
  updateKinematics(kinematics: IKinematicState): void;
  appendExtrusionSegment(segment: IToolpathSegment): void;
  clearToolpaths(): void;
  setLayerFilter(minLayer: number, maxLayer: number): void;
  setRenderMode(mode: 'lines' | 'volumetric'): void;
  setCameraPreset(preset: 'isometric' | 'top' | 'front' | 'nozzle_follow'): void;
  triggerFailureVisual(failureType: 'clog' | 'spaghetti' | 'layer_shift' | 'thermal_runaway', active: boolean): void;
  onFrameRendered(callback: (fps: number) => void): void;
}
```

### 4.4 Key Architectural Risks & Mitigations
1. **Risk**: High-speed G-code playback (e.g. 100x) flooding React state updates and causing UI freezing.
   - **Mitigation**: Decouple simulation tick from React state. The simulation engine runs in an internal timer / RAF loop. Telemetry updates to React state are throttled via `requestAnimationFrame` or a 30Hz ticker (`throttle(notifyReactUI, 33ms)`).
2. **Risk**: Float32Array buffer overflow on very large G-code files (> 150,000 moves).
   - **Mitigation**: Chunked buffer allocation. Pre-allocate an initial buffer of 50,000 segments. When capacity reaches 90%, allocate a new chunk geometry or double the buffer size using `Float32Array.set()`.
3. **Risk**: Thin lines being invisible on high-DPI (Retina/4K) screens due to `gl.lineWidth = 1.0`.
   - **Mitigation**: Implement the hybrid renderer where volumetric beads (`InstancedMesh` with 3D width and height) are available alongside fat line segments (`LineSegments2`).
4. **Risk**: Cold extrusion causing invalid physical state.
   - **Mitigation**: Kinematics engine checks `thermalState.hotendTemp >= 170°C` before executing `E` axis deposition. If cold extrusion is attempted, firmware reports `echo: Cold extrusion prevented` in terminal, and toolpath deposition is suppressed while physical motion still completes.

---

## 5. Verification Method

### 5.1 Independent Workspace Inspection Verification
Run the following PowerShell verification commands in `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta`:

1. **Verify Node and npm runtime compatibility**:
   ```powershell
   node -v
   # Expected: v22.23.2 (or >= 18.0.0)
   npm -v
   # Expected: 10.9.8 (or >= 9.0.0)
   ```

2. **Verify Directory Junction integrity**:
   ```powershell
   Get-Item "$HOME\teamwork_projects\3d_printer_simulator" | Select-Object FullName, LinkType, Target
   # Expected:
   # FullName : C:\Users\beschipp\teamwork_projects\3d_printer_simulator
   # LinkType : Junction
   # Target   : c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta
   ```

3. **Verify Git clean state**:
   ```powershell
   git status --short
   ```

### 5.2 Implementation Verification Targets (For Downstream Implementation Agents)
1. **Package Setup & Dependency Installation**:
   ```powershell
   npm install
   ```
2. **Automated Unit Tests**:
   ```powershell
   npm test
   # Executes Vitest suites validating:
   # - Cartesian Kinematics coordinate transforms
   # - Motion interpolator trapezoid profiling
   # - Dynamic buffer allocation and draw range slicing
   # - G-code parser command extraction
   # - Thermal exponential heating math
   ```
3. **Production Build Smoke Test**:
   ```powershell
   npm run build
   # Expected: Zero TypeScript errors, dist/ bundle generated with index.html, assets/*.js, assets/*.css
   ```
4. **Preview Server**:
   ```powershell
   npm run preview -- --port 4173 --strictPort
   # Expected: Serves production bundle without console errors
   ```
