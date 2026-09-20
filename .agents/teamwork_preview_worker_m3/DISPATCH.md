# Worker Dispatch: Milestone 3 — 3D Viewport & Filament Toolpath Rendering

## Objective
Implement Milestone 3 of the 3D Printer Simulator:
1. Implement 3D Scene Graph & Kinematics Hierarchy in `src/viewport/`:
   - `types.ts`: Adhere to `PROJECT.md` contracts (`IPrinterViewportController`, `AxisCoordinates`, `ToolpathSegment`, etc.).
   - `PrinterChassisMesh.ts`: Fixed base chassis, aluminum extrusions (2020/2040 V-slot), rubber feet, vertical Z pillars, lead screws.
   - `HeatedBedMesh.ts`: Translates along Y-axis ($[0, -Y_{rel}]$). Includes aluminum bed plate, textured PEI sheet with 220x220mm grid markings, corner leveling knobs, and `printedFilamentContainer` (`THREE.Group`).
     - **CRITICAL**: The deposited filament container MUST be parented to the Heated Bed Assembly so that when the bed moves along the Y-axis, all deposited filament moves synchronously with it.
   - `ToolheadMesh.ts`:
     - Z-axis gantry translates along Z ($[0, +Z_{rel}]$).
     - Toolhead carriage translates along X ($[0, +X_{rel}]$) on the Z-gantry rail.
     - Extruder NEMA motor, heatsink, fan duct, heater block (with red glow when heated), brass nozzle tip (0.4mm orifice at relative [0,0,0]), dynamic molten extrusion bead cursor.
2. Implement High-Performance Hybrid Toolpath Buffer Manager in `src/viewport/ToolpathBufferManager.ts`:
   - Fast Vector Mode (LineSegments): Pre-allocated `THREE.BufferGeometry` with typed arrays (`positionBuffer`, `colorBuffer`). Renders 200,000+ segments in a single draw call via `setDrawRange(0, activeSegments * 2)`.
   - Volumetric Bead Mode (InstancedMesh): Chunked `THREE.InstancedMesh` with unit box geometry (`BoxGeometry(1, 1, 1)`), quaternion orientation along displacement vector, and scale `(length, extrusionWidth, layerHeight)`.
   - Layer Filtering & Scrubbing: `setLayerFilter(minLayer, maxLayer)` instantly updates `setDrawRange` or instance count for real-time layer slicing preview without geometry rebuilds.
   - Failure Visuals:
     - Nozzle clog: skips segment creation during air printing.
     - Spaghetti mode: renders 3D brownian curling noodle line segments falling towards the bed.
     - Layer shift: applies $\mathbf{\Delta}_{shift}$ offset to vertices.
3. Implement Decoupled Imperative Viewport Engine in `src/viewport/ThreePrinterViewport.ts`:
   - Manages `THREE.Scene`, `THREE.PerspectiveCamera`, `THREE.WebGLRenderer`, and `OrbitControls` (orbit, pan, zoom).
   - Studio lighting (directional light with soft shadows, ambient light, hemisphere light) and origin axes indicator.
   - Camera presets: Isometric, Top-down, Front, Nozzle-follow.
   - Decoupled `requestAnimationFrame` render loop running at continuous 60 FPS, with resize observer for responsive resizing.
   - Methods: `updateKinematics(state)`, `appendExtrusionSegment(segment)`, `clearToolpaths()`, `setLayerFilter(min, max)`, `setRenderMode(mode)`, `setCameraPreset(preset)`, `triggerFailureVisual(type, active)`.
4. Implement React Container in `src/viewport/ViewportContainer.tsx`:
   - Clean `<canvas ref={canvasRef} />` wrapper.
   - Viewport overlay controls: Camera preset buttons (Iso, Top, Front), render mode toggle (Fast Line / Solid Bead), and layer slicing slider.
5. Automated Unit Tests in `src/test/unit/toolpath-buffer.test.ts`:
   - Buffer allocation, capacity expansion, segment addition, draw range filtering, layer slicing ranges, and coordinate transformations.
6. Verify:
   - Run `npm test` (all tests pass, 0 failures).
   - Run `npm run build` (clean build, exit code 0).

## Mandatory Files to Read Before Starting
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\ORIGINAL_REQUEST.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\PROJECT.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_explorer_survey_1\handoff.md`
- `c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m2\handoff.md`

## File Ownership
You exclusively own:
- `src/viewport/*`
- `src/test/unit/toolpath-buffer.test.ts`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Output
Write your handoff report to:
`c:\Users\beschipp\Documents\antigravity\zealous-brahmagupta\.agents\teamwork_preview_worker_m3\handoff.md`

## 2026-09-20T04:02:54Z
Your identity is teamwork_preview_worker_m3.
Implement Milestone 3:
1. Implement 3D Scene Graph & Kinematics Hierarchy in src/viewport/ (Chassis, Heated Bed with parented filament container, Toolhead on Z-gantry with X-carriage and nozzle).
2. Implement Hybrid Toolpath Buffer Manager in src/viewport/ToolpathBufferManager.ts (Dynamic LineSegments + InstancedMesh volumetric beads + instant layer slicing drawRange).
3. Implement ThreePrinterViewport.ts (OrbitControls, 60fps render loop, camera presets, failure visuals).
4. Implement ViewportContainer.tsx (React wrapper with controls overlay).
5. Implement unit tests in src/test/unit/toolpath-buffer.test.ts. Run `npm test` and `npm run build`.

