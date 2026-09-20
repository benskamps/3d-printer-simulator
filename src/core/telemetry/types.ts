import { HeaterTelemetry, ThermalHistoryPoint } from '../thermal/types';
import { FailureConfig } from '../failures/types';

export type PrinterStatus =
  | 'IDLE'
  | 'HOMING'
  | 'HEATING'
  | 'PRINTING'
  | 'PAUSED'
  | 'HALTED'
  | 'ERROR';

export interface Coordinates {
  x: number;
  y: number;
  z: number;
  e: number;
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
  speedMultiplier: number;
  feedrateMmMin: number;
}

export interface TerminalEntry {
  id: string;
  timestamp: string;
  type: 'command' | 'response' | 'echo' | 'error' | 'broadcast';
  message: string;
}

export interface PrinterTelemetryState {
  status: PrinterStatus;
  statusMessage: string;
  hotend: HeaterTelemetry;
  bed: HeaterTelemetry;
  partCoolingFanSpeed: number; // 0.0 - 1.0
  nominalPosition: Coordinates;
  physicalPosition: Coordinates; // Transformed with layerShift
  homedAxes: { x: boolean; y: boolean; z: boolean };
  absolutePositioning: boolean;  // G90 (true) vs G91 (false)
  absoluteExtrusion: boolean;    // M82 (true) vs M83 (false)
  failures: FailureConfig;
  job: PrintJobMetrics;
  thermalHistory: ThermalHistoryPoint[]; // Ring buffer (last 120 samples)
  terminalLog: TerminalEntry[];          // Monospace console stream
}

export interface ITelemetryStore {
  getState(): PrinterTelemetryState;
  subscribe(listener: (state: PrinterTelemetryState) => void): () => void;
  setStatus(status: PrinterStatus, statusMessage?: string): void;
  updateHotend(hotend: HeaterTelemetry): void;
  updateBed(bed: HeaterTelemetry): void;
  recordThermalSample(point?: ThermalHistoryPoint): void;
  setFanSpeed(dutyCycle: number): void;
  updateNominalPosition(pos: Coordinates): void;
  updatePhysicalPosition(pos: Coordinates): void;
  updateHomedAxes(homed: { x: boolean; y: boolean; z: boolean }): void;
  setAbsolutePositioning(absolute: boolean): void;
  setAbsoluteExtrusion(absolute: boolean): void;
  updateFailures(config: FailureConfig): void;
  updateJobMetrics(metrics: Partial<PrintJobMetrics>): void;
  appendTerminal(message: string, type?: TerminalEntry['type']): void;
  clearTerminal(): void;
  reset(): void;
}
