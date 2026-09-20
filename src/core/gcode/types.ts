/**
 * G-Code engine type definitions
 */

import { ToolpathType } from '../kinematics/types';

export interface ParsedGCodeLine {
  originalLine: string;
  lineNumber?: number;                 // From N<number>
  command: string;                     // e.g. "G1", "M104", "G28"
  parameters: Record<string, number>;  // e.g. { X: 10.5, Y: 20.0, F: 3000 }
  stringParameter?: string;            // Text payload for commands like M117
  comment?: string;
  isExtruding: boolean;
  isRetracting: boolean;
  isTravel: boolean;
  toolpathType?: ToolpathType;
  deltaE?: number;
  layerIndex?: number;
}

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface GCodeModelSummary {
  fileName: string;
  totalLines: number;
  totalLayers: number;
  boundingBox: BoundingBox;
  totalFilamentMm: number;
  totalFilamentGrams: number;
  estimatedPrintTimeSeconds: number;
  layerHeights: number[];              // Z height per layer index
  layerStartIndices: number[];          // G-code line index where each layer starts
}

export enum ExecutionState {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  STEPPING = 'STEPPING',
  ABORTED = 'ABORTED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface PrintProgress {
  currentLine: number;
  totalLines: number;
  currentLayer: number;
  totalLayers: number;
  percentage: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  filamentConsumedMm: number;
}

export interface IEngineControls {
  loadGCode(gcodeText: string, fileName?: string): Promise<GCodeModelSummary>;
  startPrint(): void;
  pausePrint(): void;
  resumePrint(): void;
  stepForward(): void;
  abortPrint(): void;
  setSpeedMultiplier(multiplier: number): void;
  getSpeedMultiplier(): number;
  getState(): ExecutionState;
  getProgress(): PrintProgress;
}

export interface IThermalSubsystemBridge {
  getHotendTemp(): { actual: number; target: number };
  getBedTemp(): { actual: number; target: number };
  setHotendTarget(target: number): void;
  setBedTarget(target: number): void;
  isTargetReached(heater: 'hotend' | 'bed', toleranceCelsius: number): boolean;
  getColdExtrusionThreshold(): number; // Default 170°C
  isThermalRunaway(): boolean;
  update?(deltaTimeSeconds: number): void;
  setFanSpeed?(fanDutyCycle: number): void;
  triggerEmergencyStop?(): void;
  canExtrude?(): boolean;
}

export interface IFailureSimulatorBridge {
  isNozzleClogged(): boolean;
  isFilamentRunout(): boolean;
  isBedAdhesionFailed(): boolean;
  getLayerShiftOffset(currentLayer: number): { x: number; y: number };
  getExtrusionScale?(): number;
}

export interface IVirtualTerminal {
  emitLine(line: string): void;
  sendRawCommand(commandText: string): void;
  onReceiveLine(callback: (line: string) => void): () => void;
  getLogHistory(): string[];
  clearLog(): void;
}
