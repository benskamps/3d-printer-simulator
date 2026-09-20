import { AxisCoordinates, ToolpathSegment, ToolpathType } from './types';

export interface MotionBlock {
  id: number;
  commandIndex: number;
  layerIndex: number;
  startPosition: AxisCoordinates;
  targetPosition: AxisCoordinates;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  deltaE: number;
  distanceXYZ: number;
  feedrate: number; // mm/min
  duration: number; // seconds
  elapsed: number;  // seconds
  type: ToolpathType;
  toolpathSegment?: ToolpathSegment;
  isExtruding: boolean;
}

export type InterpolationMode = 'linear' | 'trapezoidal';

export interface StepResult {
  currentPosition: AxisCoordinates;
  completedBlocks: MotionBlock[];
  activeBlock: MotionBlock | null;
  hasRemaining: boolean;
  blockProgress: number; // 0.0 to 1.0 for active block
}

export class MotionInterpolator {
  private queue: MotionBlock[] = [];
  private activeBlock: MotionBlock | null = null;
  private currentPosition: AxisCoordinates = { x: 0, y: 0, z: 0, e: 0 };
  private interpolationMode: InterpolationMode = 'linear';
  private acceleration: number = 1500; // mm/s^2 default acceleration
  private nextBlockId: number = 1;

  constructor(mode: InterpolationMode = 'linear', acceleration: number = 1500) {
    this.interpolationMode = mode;
    this.acceleration = acceleration;
  }

  public setMode(mode: InterpolationMode): void {
    this.interpolationMode = mode;
  }

  public setAcceleration(accel: number): void {
    if (accel > 0) {
      this.acceleration = accel;
    }
  }

  public reset(initialPosition?: AxisCoordinates): void {
    this.queue = [];
    this.activeBlock = null;
    this.currentPosition = initialPosition ? { ...initialPosition } : { x: 0, y: 0, z: 0, e: 0 };
    this.nextBlockId = 1;
  }

  public setPosition(pos: AxisCoordinates): void {
    this.currentPosition = { ...pos };
  }

  public getCurrentPosition(): AxisCoordinates {
    return { ...this.currentPosition };
  }

  public getQueueLength(): number {
    return this.queue.length + (this.activeBlock ? 1 : 0);
  }

  public getActiveBlock(): MotionBlock | null {
    return this.activeBlock ? { ...this.activeBlock } : null;
  }

  /**
   * Enqueue a new motion block
   */
  public enqueue(blockData: Omit<MotionBlock, 'id' | 'elapsed'>): MotionBlock {
    const block: MotionBlock = {
      ...blockData,
      id: this.nextBlockId++,
      elapsed: 0,
      startPosition: { ...blockData.startPosition },
      targetPosition: { ...blockData.targetPosition },
    };
    this.queue.push(block);
    return block;
  }

  /**
   * Clear all pending blocks in queue and active block upon abort/reset
   */
  public clearQueue(): void {
    this.queue = [];
    this.activeBlock = null;
  }

  /**
   * Accumulator-based time budget step supporting 1x to 100x playback speed.
   *
   * @param deltaTimeSeconds Real-world elapsed time (e.g., from requestAnimationFrame or timer)
   * @param speedMultiplier Playback speed multiplier (1, 5, 20, 100)
   * @param singleStep If true, completes at most one block and halts
   */
  public step(
    deltaTimeSeconds: number,
    speedMultiplier: number = 1,
    singleStep: boolean = false
  ): StepResult {
    const completedBlocks: MotionBlock[] = [];
    let timeBudget = Math.max(0, deltaTimeSeconds * Math.max(0.1, speedMultiplier));

    // Clamp timeBudget to prevent unbounded jumps on tab restore / lag spikes
    timeBudget = Math.min(timeBudget, 2.0);

    while (timeBudget > 0 || singleStep) {
      if (!this.activeBlock) {
        if (this.queue.length === 0) {
          break;
        }
        this.activeBlock = this.queue.shift()!;
        this.activeBlock.elapsed = 0;
      }

      const block = this.activeBlock;

      // Handle zero-duration block (instantaneous feedrate change, offset reset, etc.)
      if (block.duration <= 0.000001) {
        this.currentPosition = { ...block.targetPosition };
        completedBlocks.push(block);
        this.activeBlock = null;
        if (singleStep) {
          break;
        }
        continue;
      }

      const remainingTime = block.duration - block.elapsed;

      if (singleStep) {
        // In single-step mode, complete the entire block immediately
        block.elapsed = block.duration;
        this.currentPosition = { ...block.targetPosition };
        completedBlocks.push(block);
        this.activeBlock = null;
        break;
      }

      if (timeBudget >= remainingTime) {
        // Block finishes in this time slice
        timeBudget -= remainingTime;
        block.elapsed = block.duration;
        this.currentPosition = { ...block.targetPosition };
        completedBlocks.push(block);
        this.activeBlock = null;
      } else {
        // Block partially finishes in this time slice
        block.elapsed += timeBudget;
        timeBudget = 0;
        const u = block.elapsed / block.duration;
        const progress = this.calculateProgress(u, block);
        this.currentPosition = this.interpolate(block.startPosition, block.targetPosition, progress);
        break;
      }
    }

    const hasRemaining = this.activeBlock !== null || this.queue.length > 0;
    const blockProgress = this.activeBlock
      ? Math.min(1.0, Math.max(0.0, this.activeBlock.elapsed / this.activeBlock.duration))
      : 1.0;

    return {
      currentPosition: { ...this.currentPosition },
      completedBlocks,
      activeBlock: this.activeBlock ? { ...this.activeBlock } : null,
      hasRemaining,
      blockProgress,
    };
  }

  /**
   * Calculates progress [0, 1] through a move based on interpolation mode.
   */
  private calculateProgress(normalizedTime: number, block: MotionBlock): number {
    const u = Math.max(0, Math.min(1, normalizedTime));

    if (this.interpolationMode === 'linear' || block.distanceXYZ <= 0.01) {
      return u;
    }

    // Trapezoidal profile:
    // If distance is very small, fall back to linear
    const d = block.distanceXYZ;
    const a = this.acceleration;
    const vMax = (block.feedrate / 60);

    // Time to reach vMax
    const tAcc = vMax / a;
    const dAcc = 0.5 * a * tAcc * tAcc;

    let totalDuration: number;
    let tCruise: number;

    if (2 * dAcc > d) {
      // Triangular profile (does not reach vMax)
      const vPeak = Math.sqrt(a * d);
      const tAccTri = vPeak / a;
      totalDuration = 2 * tAccTri;
      const t = u * totalDuration;

      if (t <= tAccTri) {
        return (0.5 * a * t * t) / d;
      } else {
        const tDec = t - tAccTri;
        const dCovered = 0.5 * a * tAccTri * tAccTri + (vPeak * tDec - 0.5 * a * tDec * tDec);
        return Math.min(1.0, dCovered / d);
      }
    } else {
      // Full trapezoidal profile
      const dCruise = d - 2 * dAcc;
      tCruise = dCruise / vMax;
      totalDuration = 2 * tAcc + tCruise;
      const t = u * totalDuration;

      if (t <= tAcc) {
        return (0.5 * a * t * t) / d;
      } else if (t <= tAcc + tCruise) {
        const tMid = t - tAcc;
        return (dAcc + vMax * tMid) / d;
      } else {
        const tDec = t - tAcc - tCruise;
        const dCovered = dAcc + dCruise + (vMax * tDec - 0.5 * a * tDec * tDec);
        return Math.min(1.0, dCovered / d);
      }
    }
  }

  /**
   * 4-axis linear interpolation between start and target positions.
   */
  public interpolate(
    start: AxisCoordinates,
    target: AxisCoordinates,
    progress: number
  ): AxisCoordinates {
    const s = Math.max(0, Math.min(1, progress));
    return {
      x: start.x + (target.x - start.x) * s,
      y: start.y + (target.y - start.y) * s,
      z: start.z + (target.z - start.z) * s,
      e: start.e + (target.e - start.e) * s,
    };
  }
}
