import { FailureConfig, IFailureManager, NozzleClogMode } from './types';
import { IFailureSimulatorBridge } from '../gcode/types';
import { SpaghettiGenerator } from './SpaghettiGenerator';
import { ThermalModel } from '../thermal/ThermalModel';

/**
 * Centralized Hardware Failure Manager.
 * Coordinates nozzle clogs, bed adhesion failure (spaghetti),
 * open-loop layer shifts, filament runout, and thermal runaway simulations.
 */
export class FailureManager implements IFailureManager, IFailureSimulatorBridge {
  private config: FailureConfig;
  private listeners: Set<(config: FailureConfig) => void> = new Set();
  private spaghettiGenerator: SpaghettiGenerator;
  private thermalModel: ThermalModel | null = null;

  constructor(thermalModel?: ThermalModel) {
    if (thermalModel) this.thermalModel = thermalModel;
    this.spaghettiGenerator = new SpaghettiGenerator();
    this.config = {
      nozzleClog: 'NONE',
      spaghettiMode: false,
      layerShift: { x: 0, y: 0 },
      filamentRunout: false,
      thermalRunawaySimulated: false,
    };
  }

  public setThermalModel(model: ThermalModel): void {
    this.thermalModel = model;
  }

  public getSpaghettiGenerator(): SpaghettiGenerator {
    return this.spaghettiGenerator;
  }

  public subscribe(listener: (config: FailureConfig) => void): () => void {
    this.listeners.add(listener);
    listener(this.getConfig());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const snapshot = this.getConfig();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  // --- IFailureManager Implementation ---

  public getConfig(): FailureConfig {
    return {
      nozzleClog: this.config.nozzleClog,
      spaghettiMode: this.config.spaghettiMode,
      layerShift: { ...this.config.layerShift },
      filamentRunout: this.config.filamentRunout,
      thermalRunawaySimulated: this.config.thermalRunawaySimulated,
    };
  }

  public setNozzleClog(mode: NozzleClogMode): void {
    this.config.nozzleClog = mode;
    this.notifyListeners();
  }

  public setSpaghettiMode(active: boolean): void {
    this.config.spaghettiMode = active;
    this.notifyListeners();
  }

  public triggerLayerShift(offsetX: number, offsetY: number): void {
    this.config.layerShift.x += offsetX;
    this.config.layerShift.y += offsetY;
    this.notifyListeners();
  }

  public setFilamentRunout(active: boolean): void {
    this.config.filamentRunout = active;
    this.notifyListeners();
  }

  public simulateThermalRunaway(heater: 'hotend' | 'bed' = 'hotend'): void {
    this.config.thermalRunawaySimulated = true;
    if (this.thermalModel) {
      this.thermalModel.setSimulatedFailure(heater, true);
    }
    this.notifyListeners();
  }

  public resetAllFailures(): void {
    this.config = {
      nozzleClog: 'NONE',
      spaghettiMode: false,
      layerShift: { x: 0, y: 0 },
      filamentRunout: false,
      thermalRunawaySimulated: false,
    };
    if (this.thermalModel) {
      this.thermalModel.resetFaults();
    }
    this.notifyListeners();
  }

  // --- IFailureSimulatorBridge Implementation ---

  public isNozzleClogged(): boolean {
    return this.config.nozzleClog === 'FULL';
  }

  public getExtrusionScale(): number {
    switch (this.config.nozzleClog) {
      case 'FULL':
        return 0.0;
      case 'PARTIAL':
        return 0.25;
      case 'NONE':
      default:
        return 1.0;
    }
  }

  public isFilamentRunout(): boolean {
    return this.config.filamentRunout;
  }

  public isBedAdhesionFailed(): boolean {
    return this.config.spaghettiMode;
  }

  public getLayerShiftOffset(_currentLayer?: number): { x: number; y: number } {
    return { ...this.config.layerShift };
  }
}
