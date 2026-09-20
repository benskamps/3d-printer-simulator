import {
  Coordinates,
  ITelemetryStore,
  PrinterStatus,
  PrinterTelemetryState,
  PrintJobMetrics,
  TerminalEntry,
} from './types';
import { HeaterTelemetry, ThermalHistoryPoint } from '../thermal/types';
import { FailureConfig } from '../failures/types';

/**
 * Centralized Telemetry Store.
 * Maintains single-source-of-truth state across kinematics, thermals,
 * hardware failure flags, print job metrics, rolling history buffers, and firmware logs.
 */
export class TelemetryStore implements ITelemetryStore {
  private state: PrinterTelemetryState;
  private listeners: Set<(state: PrinterTelemetryState) => void> = new Set();
  private static readonly MAX_THERMAL_HISTORY = 120; // 120 samples (e.g. 60s at 2Hz)
  private static readonly MAX_TERMINAL_LOG = 500;
  private nextTerminalId = 1;

  constructor(initialState?: Partial<PrinterTelemetryState>) {
    this.state = {
      status: 'IDLE',
      statusMessage: 'Ready',
      hotend: {
        actual: 21.0,
        target: 0,
        power: 0,
        isHeating: false,
        hasError: false,
      },
      bed: {
        actual: 21.0,
        target: 0,
        power: 0,
        isHeating: false,
        hasError: false,
      },
      partCoolingFanSpeed: 0.0,
      nominalPosition: { x: 0, y: 0, z: 0, e: 0 },
      physicalPosition: { x: 0, y: 0, z: 0, e: 0 },
      homedAxes: { x: false, y: false, z: false },
      absolutePositioning: true,
      absoluteExtrusion: true,
      failures: {
        nozzleClog: 'NONE',
        spaghettiMode: false,
        layerShift: { x: 0, y: 0 },
        filamentRunout: false,
        thermalRunawaySimulated: false,
      },
      job: {
        filename: '',
        totalLayers: 0,
        currentLayer: 0,
        progressPercent: 0,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: 0,
        filamentUsedMm: 0,
        filamentUsedGrams: 0,
        speedMultiplier: 1.0,
        feedrateMmMin: 3000,
      },
      thermalHistory: [],
      terminalLog: [],
      ...initialState,
    };
  }

  public getState(): PrinterTelemetryState {
    return {
      ...this.state,
      hotend: { ...this.state.hotend },
      bed: { ...this.state.bed },
      nominalPosition: { ...this.state.nominalPosition },
      physicalPosition: { ...this.state.physicalPosition },
      homedAxes: { ...this.state.homedAxes },
      failures: {
        ...this.state.failures,
        layerShift: { ...this.state.failures.layerShift },
      },
      job: { ...this.state.job },
      thermalHistory: [...this.state.thermalHistory],
      terminalLog: [...this.state.terminalLog],
    };
  }

  public subscribe(listener: (state: PrinterTelemetryState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  public setStatus(status: PrinterStatus, statusMessage?: string): void {
    this.state.status = status;
    if (statusMessage !== undefined) {
      this.state.statusMessage = statusMessage;
    }
    this.notify();
  }

  public updateHotend(hotend: HeaterTelemetry): void {
    this.state.hotend = { ...hotend };
    this.notify();
  }

  public updateBed(bed: HeaterTelemetry): void {
    this.state.bed = { ...bed };
    this.notify();
  }

  public recordThermalSample(point?: ThermalHistoryPoint): void {
    const sample: ThermalHistoryPoint = point ?? {
      timestamp: Date.now(),
      hotendActual: Math.round(this.state.hotend.actual * 10) / 10,
      hotendTarget: Math.round(this.state.hotend.target * 10) / 10,
      bedActual: Math.round(this.state.bed.actual * 10) / 10,
      bedTarget: Math.round(this.state.bed.target * 10) / 10,
    };

    this.state.thermalHistory.push(sample);
    if (this.state.thermalHistory.length > TelemetryStore.MAX_THERMAL_HISTORY) {
      this.state.thermalHistory.shift();
    }
    this.notify();
  }

  public setFanSpeed(dutyCycle: number): void {
    this.state.partCoolingFanSpeed = Math.max(0, Math.min(1.0, dutyCycle));
    this.notify();
  }

  public updateNominalPosition(pos: Coordinates): void {
    this.state.nominalPosition = { ...pos };
    this.notify();
  }

  public updatePhysicalPosition(pos: Coordinates): void {
    this.state.physicalPosition = { ...pos };
    this.notify();
  }

  public updateHomedAxes(homed: { x: boolean; y: boolean; z: boolean }): void {
    this.state.homedAxes = { ...homed };
    this.notify();
  }

  public setAbsolutePositioning(absolute: boolean): void {
    this.state.absolutePositioning = absolute;
    this.notify();
  }

  public setAbsoluteExtrusion(absolute: boolean): void {
    this.state.absoluteExtrusion = absolute;
    this.notify();
  }

  public updateFailures(config: FailureConfig): void {
    this.state.failures = {
      ...config,
      layerShift: { ...config.layerShift },
    };
    this.notify();
  }

  public updateJobMetrics(metrics: Partial<PrintJobMetrics>): void {
    this.state.job = {
      ...this.state.job,
      ...metrics,
    };
    this.notify();
  }

  public appendTerminal(message: string, type: TerminalEntry['type'] = 'echo'): void {
    const entry: TerminalEntry = {
      id: `term-${this.nextTerminalId++}`,
      timestamp: new Date().toISOString().substring(11, 19), // HH:MM:SS
      type,
      message,
    };
    this.state.terminalLog.push(entry);
    if (this.state.terminalLog.length > TelemetryStore.MAX_TERMINAL_LOG) {
      this.state.terminalLog.shift();
    }
    this.notify();
  }

  public clearTerminal(): void {
    this.state.terminalLog = [];
    this.notify();
  }

  public reset(): void {
    this.state.status = 'IDLE';
    this.state.statusMessage = 'Ready';
    this.state.hotend = {
      actual: 21.0,
      target: 0,
      power: 0,
      isHeating: false,
      hasError: false,
    };
    this.state.bed = {
      actual: 21.0,
      target: 0,
      power: 0,
      isHeating: false,
      hasError: false,
    };
    this.state.partCoolingFanSpeed = 0.0;
    this.state.nominalPosition = { x: 0, y: 0, z: 0, e: 0 };
    this.state.physicalPosition = { x: 0, y: 0, z: 0, e: 0 };
    this.state.homedAxes = { x: false, y: false, z: false };
    this.state.failures = {
      nozzleClog: 'NONE',
      spaghettiMode: false,
      layerShift: { x: 0, y: 0 },
      filamentRunout: false,
      thermalRunawaySimulated: false,
    };
    this.state.job = {
      filename: '',
      totalLayers: 0,
      currentLayer: 0,
      progressPercent: 0,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: 0,
      filamentUsedMm: 0,
      filamentUsedGrams: 0,
      speedMultiplier: 1.0,
      feedrateMmMin: 3000,
    };
    this.state.thermalHistory = [];
    this.state.terminalLog = [];
    this.notify();
  }
}
