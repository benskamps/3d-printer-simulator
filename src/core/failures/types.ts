/**
 * Hardware Failure Simulation type definitions
 * Compliant with PROJECT.md and survey specifications.
 */

export type NozzleClogMode = 'NONE' | 'PARTIAL' | 'FULL';

export interface FailureConfig {
  nozzleClog: NozzleClogMode;
  spaghettiMode: boolean;
  layerShift: { x: number; y: number };
  filamentRunout: boolean;
  thermalRunawaySimulated: boolean;
}

export interface IFailureManager {
  getConfig(): FailureConfig;
  setNozzleClog(mode: NozzleClogMode): void;
  setSpaghettiMode(active: boolean): void;
  triggerLayerShift(offsetX: number, offsetY: number): void;
  setFilamentRunout(active: boolean): void;
  simulateThermalRunaway(heater: 'hotend' | 'bed'): void;
  resetAllFailures(): void;
}
