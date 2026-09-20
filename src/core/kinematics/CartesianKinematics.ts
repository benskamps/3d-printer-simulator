import {
  AxisCoordinates,
  IKinematicState,
  PrinterDimensions,
  DEFAULT_PRINTER_DIMENSIONS,
} from './types';

export class CartesianKinematics {
  private state: IKinematicState;
  private dimensions: PrinterDimensions;

  constructor(dimensions: PrinterDimensions = DEFAULT_PRINTER_DIMENSIONS) {
    this.dimensions = { ...dimensions };
    this.state = {
      currentPosition: { x: 0, y: 0, z: 0, e: 0 },
      targetPosition: { x: 0, y: 0, z: 0, e: 0 },
      feedrate: 3000, // 3000 mm/min = 50 mm/s
      isHomed: { x: false, y: false, z: false },
      isRelativePositioning: false, // Absolute G90
      isRelativeExtruder: false,    // Absolute M82
      steppersEnabled: true,
      fanSpeed: 0.0,
      speedOverride: 100, // 100%
      flowOverride: 100,  // 100%
      layerShiftOffset: { x: 0, y: 0 },
      activeLayer: 0,
      totalLayers: 0,
      isExtruding: false,
    };
  }

  public getState(): IKinematicState {
    return {
      ...this.state,
      currentPosition: { ...this.state.currentPosition },
      targetPosition: { ...this.state.targetPosition },
      isHomed: { ...this.state.isHomed },
      layerShiftOffset: { ...this.state.layerShiftOffset },
    };
  }

  public getDimensions(): PrinterDimensions {
    return { ...this.dimensions };
  }

  /**
   * Returns the physical position taking into account layer shifts for 3D visualization.
   */
  public getPhysicalPosition(): AxisCoordinates {
    return {
      x: this.state.currentPosition.x + this.state.layerShiftOffset.x,
      y: this.state.currentPosition.y + this.state.layerShiftOffset.y,
      z: this.state.currentPosition.z,
      e: this.state.currentPosition.e,
    };
  }

  /**
   * Home axes (G28). If no specific axes are provided, homes all (X, Y, Z).
   */
  public home(axes?: { x?: boolean; y?: boolean; z?: boolean }): void {
    const homeAll = !axes || (!axes.x && !axes.y && !axes.z);

    if (homeAll || axes?.x) {
      this.state.currentPosition.x = 0;
      this.state.targetPosition.x = 0;
      this.state.isHomed.x = true;
    }
    if (homeAll || axes?.y) {
      this.state.currentPosition.y = 0;
      this.state.targetPosition.y = 0;
      this.state.isHomed.y = true;
    }
    if (homeAll || axes?.z) {
      this.state.currentPosition.z = 0;
      this.state.targetPosition.z = 0;
      this.state.isHomed.z = true;
    }
    this.state.steppersEnabled = true;
  }

  /**
   * Set internal coordinate offsets without physical movement (G92).
   */
  public setCoordinateOffset(offset: Partial<AxisCoordinates>): void {
    if (offset.x !== undefined) {
      this.state.currentPosition.x = offset.x;
      this.state.targetPosition.x = offset.x;
    }
    if (offset.y !== undefined) {
      this.state.currentPosition.y = offset.y;
      this.state.targetPosition.y = offset.y;
    }
    if (offset.z !== undefined) {
      this.state.currentPosition.z = offset.z;
      this.state.targetPosition.z = offset.z;
    }
    if (offset.e !== undefined) {
      this.state.currentPosition.e = offset.e;
      this.state.targetPosition.e = offset.e;
    }
  }

  public setPositioningMode(relative: boolean): void {
    this.state.isRelativePositioning = relative;
  }

  public setExtruderMode(relative: boolean): void {
    this.state.isRelativeExtruder = relative;
  }

  public setFeedrate(feedrateMmMin: number): void {
    if (feedrateMmMin > 0) {
      this.state.feedrate = feedrateMmMin;
    }
  }

  public getFeedrateMmPerSec(): number {
    return this.state.feedrate / 60;
  }

  public getEffectiveFeedrateMmPerSec(playbackMultiplier: number = 1): number {
    const baseVelocity = this.state.feedrate / 60;
    const speedRatio = (this.state.speedOverride / 100) * playbackMultiplier;
    return Math.max(0.1, baseVelocity * speedRatio);
  }

  public setFanSpeed(dutyCycle: number): void {
    this.state.fanSpeed = Math.max(0, Math.min(1, dutyCycle));
  }

  public setSteppersEnabled(enabled: boolean): void {
    this.state.steppersEnabled = enabled;
    if (!enabled) {
      this.state.isHomed = { x: false, y: false, z: false };
    }
  }

  public setSpeedOverride(factor: number): void {
    // Marlin typically clamps M220 to [10, 500]
    this.state.speedOverride = Math.max(10, Math.min(500, factor));
  }

  public setFlowOverride(factor: number): void {
    // Marlin typically clamps M221 to [10, 300]
    this.state.flowOverride = Math.max(10, Math.min(300, factor));
  }

  public setLayerShiftOffset(x: number, y: number): void {
    this.state.layerShiftOffset = { x, y };
  }

  public setActiveLayer(layer: number, totalLayers?: number): void {
    this.state.activeLayer = layer;
    if (totalLayers !== undefined) {
      this.state.totalLayers = totalLayers;
    }
  }

  /**
   * Clamps target coordinates to printer build volume boundaries.
   */
  public clampCoordinates(target: AxisCoordinates): {
    clamped: AxisCoordinates;
    wasClamped: boolean;
  } {
    const clamped: AxisCoordinates = {
      x: Math.max(this.dimensions.minX, Math.min(this.dimensions.maxX, target.x)),
      y: Math.max(this.dimensions.minY, Math.min(this.dimensions.maxY, target.y)),
      z: Math.max(this.dimensions.minZ, Math.min(this.dimensions.maxZ, target.z)),
      e: target.e,
    };
    const wasClamped =
      clamped.x !== target.x || clamped.y !== target.y || clamped.z !== target.z;
    return { clamped, wasClamped };
  }

  /**
   * Calculates movement displacement vector, extrusion delta, distance, and duration.
   */
  public calculateMove(
    params: Partial<AxisCoordinates> & { f?: number },
    playbackMultiplier: number = 1,
    basePosition?: AxisCoordinates
  ): {
    target: AxisCoordinates;
    deltaX: number;
    deltaY: number;
    deltaZ: number;
    deltaE: number;
    distanceXYZ: number;
    durationSeconds: number;
    isExtruding: boolean;
    isRetracting: boolean;
  } {
    if (params.f !== undefined && params.f > 0) {
      this.setFeedrate(params.f);
    }

    const curr = basePosition ?? this.state.currentPosition;
    let targetX = curr.x;
    let targetY = curr.y;
    let targetZ = curr.z;
    let targetE = curr.e;
    let deltaE = 0;

    // Positioning (X, Y, Z)
    if (this.state.isRelativePositioning) {
      targetX = curr.x + (params.x ?? 0);
      targetY = curr.y + (params.y ?? 0);
      targetZ = curr.z + (params.z ?? 0);
    } else {
      targetX = params.x !== undefined ? params.x : curr.x;
      targetY = params.y !== undefined ? params.y : curr.y;
      targetZ = params.z !== undefined ? params.z : curr.z;
    }

    // Clamp coordinates to printer build volume boundaries (soft limits)
    const clampedResult = this.clampCoordinates({
      x: targetX,
      y: targetY,
      z: targetZ,
      e: targetE,
    });
    targetX = clampedResult.clamped.x;
    targetY = clampedResult.clamped.y;
    targetZ = clampedResult.clamped.z;

    // Extrusion (E)
    if (this.state.isRelativeExtruder) {
      deltaE = params.e ?? 0;
      targetE = curr.e + deltaE;
    } else {
      if (params.e !== undefined) {
        targetE = params.e;
        deltaE = targetE - curr.e;
      } else {
        targetE = curr.e;
        deltaE = 0;
      }
    }

    // Apply flow override to positive extrusion
    if (deltaE > 0 && this.state.flowOverride !== 100) {
      deltaE *= this.state.flowOverride / 100;
      if (this.state.isRelativeExtruder) {
        targetE = curr.e + deltaE;
      }
      // In absolute M82 mode, keep logical targetE intact so subsequent moves calculate correct delta
    }

    const deltaX = targetX - curr.x;
    const deltaY = targetY - curr.y;
    const deltaZ = targetZ - curr.z;
    const distanceXYZ = Math.sqrt(
      deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ
    );

    const effectiveFeedrate = this.getEffectiveFeedrateMmPerSec(playbackMultiplier);
    let durationSeconds = 0;

    if (distanceXYZ > 0) {
      durationSeconds = distanceXYZ / effectiveFeedrate;
    } else if (Math.abs(deltaE) > 0) {
      // Pure extrusion / retraction move: typically capped at max 40 mm/s in slicers
      const retractSpeed = Math.min(effectiveFeedrate, 40 * (this.state.speedOverride / 100) * playbackMultiplier);
      durationSeconds = Math.abs(deltaE) / Math.max(0.1, retractSpeed);
    }

    const isExtruding = deltaE > 0.00001;
    const isRetracting = deltaE < -0.00001;

    return {
      target: { x: targetX, y: targetY, z: targetZ, e: targetE },
      deltaX,
      deltaY,
      deltaZ,
      deltaE,
      distanceXYZ,
      durationSeconds,
      isExtruding,
      isRetracting,
    };
  }

  /**
   * Sets currentPosition to target and updates targetPosition.
   */
  public setCurrentPosition(pos: AxisCoordinates): void {
    const clamped = this.clampCoordinates(pos).clamped;
    this.state.currentPosition = { ...clamped, e: pos.e };
    this.state.targetPosition = { ...clamped, e: pos.e };
  }

  /**
   * Updates targetPosition for an in-progress move.
   */
  public setTargetPosition(target: AxisCoordinates): void {
    const clamped = this.clampCoordinates(target).clamped;
    this.state.targetPosition = { ...clamped, e: target.e };
  }

  /**
   * Resets kinematics to initial factory state.
   */
  public reset(): void {
    this.state = {
      currentPosition: { x: 0, y: 0, z: 0, e: 0 },
      targetPosition: { x: 0, y: 0, z: 0, e: 0 },
      feedrate: 3000,
      isHomed: { x: false, y: false, z: false },
      isRelativePositioning: false,
      isRelativeExtruder: false,
      steppersEnabled: true,
      fanSpeed: 0.0,
      speedOverride: 100,
      flowOverride: 100,
      layerShiftOffset: { x: 0, y: 0 },
      activeLayer: 0,
      totalLayers: 0,
      isExtruding: false,
    };
  }
}
