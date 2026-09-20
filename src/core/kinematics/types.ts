/**
 * Core kinematics type definitions for 3D Printer Simulator
 */

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
  extrusionLength: number; // mm of filament pushed (delta E)
  feedrate: number;        // mm/min
  type: ToolpathType;
  layerIndex: number;
  commandIndex: number;
}

export interface PrinterDimensions {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export const DEFAULT_PRINTER_DIMENSIONS: PrinterDimensions = {
  minX: 0,
  maxX: 220,
  minY: 0,
  maxY: 220,
  minZ: 0,
  maxZ: 250,
};
