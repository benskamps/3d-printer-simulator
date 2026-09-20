# Original User Request

## 2026-09-20T03:30:04Z

An interactive, web-based 3D printer simulator featuring real-time 3D toolpath extrusion, printer kinematics, thermal dynamics, failure mode simulations, and an OctoPrint/Klipper-style dashboard.

Working directory: ~/teamwork_projects/3d_printer_simulator
Integrity mode: development

## Requirements

### R1. 3D Viewport & Kinematic Simulation
Build an interactive 3D rendering environment representing a cartesian (or coreXY) 3D printer (chassis, heated bed, gantry, and extruder printhead). As print moves execute, the printhead must smoothly interpolate in 3D space corresponding to axis coordinates (X, Y, Z), and deposit visual filament lines/layers onto the build plate in real time. Include orbit, pan, zoom controls, and a layer slicing preview.

### R2. G-Code Parser & Execution Engine
Implement a robust G-code parsing engine supporting standard 3D printing commands (G0/G1 rapid/linear moves, G28 homing, G90/G91 positioning, G92 coordinate offsets, M104/M109 extruder temperatures, M140/M190 bed temperatures, M106/M107 part cooling fan, M82/M83 extrusion modes). The simulator must accept user-uploaded `.gcode` files and provide built-in pre-sliced samples (e.g., Calibration Cube, 3DBenchy). The engine must support play, pause, abort, and playback speed adjustment (e.g., 1x, 5x, 20x, 100x).

### R3. Thermal & Failure Mode Simulation Engine
Implement a physics/state simulation for hotend and bed heating with thermal inertia (exponential rise toward setpoint with ambient cooling). Include a thermal runaway safety detector if heating fails or fluctuates unexpectedly. Provide toggles for hardware failure modes: nozzle clogs (extrusion halts while motion continues), bed adhesion failure / spaghetti mode, layer shift (stepper skips step on specified axis), and filament runout.

### R4. Control Dashboard & Virtual Firmware Terminal
Provide a responsive web control interface inspired by modern 3D printer frontends (e.g., Fluidd / Mainsail / OctoPrint):
- Temperature telemetry with live history charts (hotend & bed actual vs. target).
- Manual jog controls (X/Y/Z stepping, extrude/retract filament, home axes).
- Interactive G-code console / pseudo-firmware terminal that logs sent commands and simulated OK / temperature telemetry replies.
- Print metrics panel (current layer, estimated time remaining, total filament consumed).

## Verification Plan & Acceptance Criteria

### Verification Resources & Automated Tests
- An automated unit test suite (e.g., Jest, Vitest, or Node-based test runner) validating:
  - G-code parser correctly parses linear coordinates, extrusion calculations, and temperatures from diverse sample files.
  - Thermal model math reaches setpoints within target thresholds and correctly triggers thermal runaway flags on open-loop conditions.
  - Coordinate kinematics state machine responds accurately to homing (G28) and relative/absolute positioning commands.
- An end-to-end verification script or smoke test verifying the app builds without errors, serves via a lightweight static server, and renders without console runtime exceptions.

### Acceptance Criteria
- [ ] G-code parser parses at least 3 distinct G-code files including homing, temperature waits, and layered extrusion moves without unhandled errors.
- [ ] 3D viewport renders gantry motion tracking G0/G1 commands and visualizes filament toolpaths layer-by-layer on the build plate.
- [ ] Thermal simulation displays heating curves to user-defined temperatures (e.g. 200°C nozzle, 60°C bed) and prevents printing if nozzle is below minimum extrusion temperature.
- [ ] Simulating at least 2 failure conditions (e.g., layer shift, nozzle clog, or thermal runaway) correctly produces visible visual effects or emergency halt states.
- [ ] Manual jog interface and interactive G-code terminal allow sending arbitrary G-code commands and observe simulated printer state updates.
- [ ] The application is completely runnable locally with a single setup/start command (e.g. `npm install && npm start` or `npm run dev`) and produces zero unhandled browser errors during standard operation.
