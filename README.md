# 🖨️ 3D Printer Simulator

An interactive, high-fidelity 3D printer simulator built with **React**, **Three.js / WebGL**, **TypeScript**, and **Tailwind CSS**. Features real-time Cartesian kinematics, G-code toolpath extrusion, physical thermal modeling, simulated hardware failure modes, and a modern Fluidd/Mainsail-style web controller.

---

## ✨ Features

### 🧊 3D Viewport & Kinematics
- **3D Cartesian Printer Assembly**: Aluminum extrusion chassis, heated bed with millimeter grid, dual Z-leadscrews, and an articulated toolhead carriage.
- **Dynamic Toolpath Rendering**: High-performance single-draw-call buffer geometry supporting 200,000+ vector paths, plus instanced volumetric filament bead rendering with semantic layer color coding (outer wall, inner wall, infill, travel moves, support).
- **Interactive Camera Controls**: Orbit, pan, zoom, plus 4 camera presets (Isometric, Top-Down, Front, Side), and a layer-by-layer slicing scrubber.

### 📜 G-Code Parser & Execution Engine
- **Command Set**: Standard G-code parsing including `G0`/`G1` (linear moves), `G28` (homing), `G90`/`G91` (positioning), `G92` (offsets), `M104`/`M109` (hotend temp), `M140`/`M190` (bed temp), `M106`/`M107` (cooling fans), and `M82`/`M83` (extrusion).
- **Bundled Models & Uploads**:
  - **Calibration Cube** (20mm, multi-layer)
  - **3DBenchy**
  - **Quick Pad** (single-layer rapid test)
  - Custom drag-and-drop `.gcode` file uploader.
- **Transport Controls**: Real-time Play, Pause, Abort, and smooth playback speed multipliers from **1x up to 100x**.

### 🌡️ Thermal Dynamics & Hardware Failure Engine
- **Physics Modeling**: First-order ODE thermal transfer solver using Newton's law of cooling and discrete tuned PID controllers (40W hotend, 220W bed).
- **Safety Interlocks**: Cold-extrusion lockout (<170°C) and Marlin/Klipper-spec thermal runaway safety watchdog with `M112` emergency halt.
- **Simulated Hardware Failure Modes**:
  - 🍝 **Bed Adhesion Loss / Spaghetti Mode**: Procedurally generates curling 3D noodles in Brownian motion.
  - 🚫 **Nozzle Clogs**: Extrusion flow restriction down to zero with air-printing.
  - ⚙️ **Layer Shifts**: Mechanical step-loss displacement along X or Y axes.
  - 🛑 **Filament Runout**: Sensor trip triggering automatic pause and toolhead parking.
  - 💥 **Thermal Runaway**: Heating element failure triggering emergency halt.

### 🎛️ Fluidd / Mainsail Control Dashboard & Terminal
- **Thermal Telemetry**: Live dual-line SVG history chart tracking nozzle & bed temperatures against their setpoints over a rolling 60-second window, with one-click presets for PLA, PETG, and ABS.
- **Jog Controls**: 8-way directional XY jog ring, Z steppers, multi-resolution step scaling (0.1, 1, 10, 100 mm), and axis homing buttons.
- **Virtual Firmware Terminal**: Monospace serial console displaying sent commands and color-coded firmware telemetry (`ok`, `T:...`, `Error:...`), command history recall, and telemetry stream filtering.
- **Metrics Panel**: Real-time layer indicators, elapsed time, estimated time remaining (ETA), and filament consumption in meters and grams.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### Production Build & Preview
```bash
npm run build
npm run preview
```

### Running Tests
```bash
npm test          # Runs unit and end-to-end test suites
npm run smoke     # Runs standalone HTTP server smoke test
```

---

## 🛠️ Tech Stack
- **Framework**: React 18
- **Language**: TypeScript
- **3D Graphics**: Three.js (WebGL)
- **Styling**: Tailwind CSS, Lucide React
- **Build Tool**: Vite
- **Testing**: Vitest
