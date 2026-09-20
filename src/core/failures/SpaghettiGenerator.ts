import { ToolpathSegment, ToolpathType } from '../kinematics/types';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface SpaghettiGeneratorOptions {
  minRadius?: number;      // Minimum curl radius (mm), default 1.5
  maxRadius?: number;      // Maximum curl radius (mm), default 6.0
  curlFrequency?: number;  // Rotational frequency (rad/s or turns), default 4*PI
  brownianNoise?: number;  // Random walk magnitude (mm), default 0.4
  gravitySagRate?: number; // Rate of downward drop towards bed (mm/s), default 1.5
}

/**
 * Procedural 3D Brownian Curl Spaghetti Noodle Generator.
 * When bed adhesion fails or plastic is extruded into open air,
 * generates chaotic falling coils and spaghetti noodle paths.
 */
export class SpaghettiGenerator {
  private minRadius: number;
  private maxRadius: number;
  private curlFrequency: number;
  private brownianNoise: number;
  private gravitySagRate: number;

  constructor(options?: SpaghettiGeneratorOptions) {
    this.minRadius = options?.minRadius ?? 1.5;
    this.maxRadius = options?.maxRadius ?? 6.0;
    this.curlFrequency = options?.curlFrequency ?? Math.PI * 4;
    this.brownianNoise = options?.brownianNoise ?? 0.4;
    this.gravitySagRate = options?.gravitySagRate ?? 1.5;
  }

  /**
   * Generate 3D procedural noodle points between start and end positions.
   *
   * @param start Start coordinate (mm)
   * @param end End coordinate (mm)
   * @param extrusionLength Extrusion volume/length (mm)
   * @param numPoints Number of intermediate curl vertices
   */
  public generateNoodlePath(
    start: Point3D,
    end: Point3D,
    extrusionLength: number,
    numPoints: number = 16
  ): Point3D[] {
    const points: Point3D[] = [];
    points.push({ ...start });

    if (extrusionLength <= 0.0001 || numPoints <= 1) {
      points.push({ ...end });
      return points;
    }

    let currentBrownianX = 0;
    let currentBrownianY = 0;

    const phaseX = Math.random() * Math.PI * 2;
    const phaseY = Math.random() * Math.PI * 2;
    const radius = this.minRadius + Math.random() * (this.maxRadius - this.minRadius);

    for (let i = 1; i <= numPoints; i++) {
      const s = i / numPoints;

      // Linear interpolation between start and end
      const baseX = start.x + (end.x - start.x) * s;
      const baseY = start.y + (end.y - start.y) * s;
      const baseZ = start.z + (end.z - start.z) * s;

      // Rotational curl
      const angle = s * this.curlFrequency;
      const curlX = Math.cos(angle + phaseX) * radius;
      const curlY = Math.sin(angle + phaseY) * radius;

      // Brownian random walk
      currentBrownianX += (Math.random() - 0.5) * this.brownianNoise;
      currentBrownianY += (Math.random() - 0.5) * this.brownianNoise;

      // Downward gravity drop towards bed (Z >= 0)
      const gravityDrop = s * this.gravitySagRate * (baseZ * 0.5 + 0.5);
      const noodleZ = Math.max(0, baseZ - gravityDrop);

      points.push({
        x: baseX + curlX + currentBrownianX,
        y: baseY + curlY + currentBrownianY,
        z: noodleZ,
      });
    }

    return points;
  }

  /**
   * Convert a single nominal ToolpathSegment into procedural curling noodle segments.
   */
  public generateSpaghettiSegments(segment: ToolpathSegment, stepsPerSegment: number = 10): ToolpathSegment[] {
    if (segment.extrusionLength <= 0.00001) {
      return [segment];
    }

    const start: Point3D = { x: segment.startX, y: segment.startY, z: segment.startZ };
    const end: Point3D = { x: segment.endX, y: segment.endY, z: segment.endZ };

    const points = this.generateNoodlePath(start, end, segment.extrusionLength, stepsPerSegment);
    const result: ToolpathSegment[] = [];

    const subExtrusion = segment.extrusionLength / (points.length - 1);

    for (let i = 0; i < points.length - 1; i++) {
      result.push({
        startX: points[i].x,
        startY: points[i].y,
        startZ: points[i].z,
        endX: points[i + 1].x,
        endY: points[i + 1].y,
        endZ: points[i + 1].z,
        extrusionLength: subExtrusion,
        feedrate: segment.feedrate,
        type: ToolpathType.INFILL, // Render as noodle material
        layerIndex: segment.layerIndex,
        commandIndex: segment.commandIndex,
      });
    }

    return result;
  }
}
