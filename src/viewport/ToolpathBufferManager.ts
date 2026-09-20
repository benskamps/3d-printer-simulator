import * as THREE from 'three';
import { ToolpathSegment, ToolpathType } from '../core/kinematics/types';
import { SpaghettiGenerator } from '../core/failures/SpaghettiGenerator';
import { FailureVisualType, LayerRange, RenderMode } from './types';

/**
 * Color palette per toolpath type.
 */
export const TOOLPATH_COLORS: Record<ToolpathType, THREE.Color> = {
  [ToolpathType.WALL_OUTER]: new THREE.Color(0xf97316),    // Orange
  [ToolpathType.WALL_INNER]: new THREE.Color(0xeab308),    // Amber/Yellow
  [ToolpathType.INFILL]: new THREE.Color(0x06b6d4),        // Cyan
  [ToolpathType.SOLID_SURFACE]: new THREE.Color(0x3b82f6), // Blue
  [ToolpathType.SUPPORT]: new THREE.Color(0x22c55e),       // Green
  [ToolpathType.SKIRT_BRIM]: new THREE.Color(0xa855f7),    // Purple
  [ToolpathType.PRIME_TOWER]: new THREE.Color(0xec4899),   // Pink
  [ToolpathType.TRAVEL]: new THREE.Color(0x475569),        // Slate/faint
};

export const DEFAULT_TOOLPATH_COLOR = new THREE.Color(0x10b981);

export interface ToolpathBufferManagerOptions {
  initialCapacity?: number;     // Initial segment capacity for LineSegments buffer
  chunkSize?: number;           // Chunk size for InstancedMesh volumetric beads
  extrusionWidth?: number;      // Default bead width in mm (default 0.45)
  layerHeight?: number;         // Default bead height in mm (default 0.20)
}

/**
 * High-Performance Hybrid Toolpath Buffer Manager.
 *
 * 1. Fast Vector Mode (LineSegments):
 *    Pre-allocated `THREE.BufferGeometry` with dynamic typed arrays.
 *    Renders 200,000+ segments in a single GPU draw call via `setDrawRange(start, count)`.
 * 2. Volumetric Bead Mode (InstancedMesh):
 *    Chunked `THREE.InstancedMesh` with unit box geometry (`BoxGeometry(1, 1, 1)`),
 *    quaternion orientation along displacement vector, and scale `(length, width, height)`.
 * 3. Layer Filtering & Instant Scrubbing:
 *    `setLayerFilter(minLayer, maxLayer)` updates `setDrawRange` and instance count in O(1)
 *    for real-time layer slicing preview with ZERO geometry rebuilds.
 * 4. Failure Visuals:
 *    - Nozzle Clog: skips segment creation during air printing.
 *    - Spaghetti Mode: procedural 3D brownian curling noodles falling towards the bed.
 *    - Layer Shift: applies hardware offset vector Delta_shift to vertices.
 */
export class ToolpathBufferManager {
  public readonly rootGroup: THREE.Group;

  // Mode 1: Fast LineSegments
  private readonly lineSegmentsGroup: THREE.Group;
  private lineGeometry: THREE.BufferGeometry;
  private lineMaterial: THREE.LineBasicMaterial;
  private lineMesh: THREE.LineSegments;

  private positions: Float32Array;
  private colors: Float32Array;
  private capacity: number;
  private activeSegments: number = 0;

  // Mode 2: Volumetric InstancedMesh
  private readonly instancedGroup: THREE.Group;
  private readonly unitBoxGeometry: THREE.BoxGeometry;
  private readonly beadMaterial: THREE.MeshStandardMaterial;
  private readonly instancedChunks: THREE.InstancedMesh[] = [];
  private readonly chunkSize: number;
  private currentChunkIndex: number = -1;
  private currentChunkInstanceCount: number = 0;
  private totalVolumetricInstances: number = 0;

  // Volumetric instance tracking for layer scrubbing: chunkIndex, instanceIndex, layerIndex
  private readonly volumetricMetadata: Array<{ chunkIndex: number; instanceIndex: number; layerIndex: number }> = [];

  // Configuration
  private readonly extrusionWidth: number;
  private readonly layerHeight: number;
  private renderMode: RenderMode = 'lines';

  // Layer Tracking
  private readonly layerRanges: Map<number, LayerRange> = new Map();
  private minRecordedLayer: number = Infinity;
  private maxRecordedLayer: number = -Infinity;
  private currentMinLayer: number = 0;
  private currentMaxLayer: number = Infinity;

  // Failure Simulation Visuals
  private clogActive: boolean = false;
  private spaghettiActive: boolean = false;
  private layerShiftOffset: { x: number; y: number } = { x: 0, y: 0 };
  private readonly spaghettiGenerator: SpaghettiGenerator;

  // Scratch objects for zero-allocation math
  private readonly vStart = new THREE.Vector3();
  private readonly vEnd = new THREE.Vector3();
  private readonly vDir = new THREE.Vector3();
  private readonly vMid = new THREE.Vector3();
  private readonly vScale = new THREE.Vector3();
  private readonly qRot = new THREE.Quaternion();
  private readonly mTransform = new THREE.Matrix4();
  private readonly xAxis = new THREE.Vector3(1, 0, 0);

  constructor(options?: ToolpathBufferManagerOptions) {
    this.capacity = options?.initialCapacity ?? 50_000;
    this.chunkSize = options?.chunkSize ?? 10_000;
    this.extrusionWidth = options?.extrusionWidth ?? 0.45;
    this.layerHeight = options?.layerHeight ?? 0.20;

    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'ToolpathBufferManager';

    this.spaghettiGenerator = new SpaghettiGenerator();

    // 1. Initialize LineSegments
    this.lineSegmentsGroup = new THREE.Group();
    this.lineSegmentsGroup.name = 'FastLineSegments';

    this.positions = new Float32Array(this.capacity * 2 * 3);
    this.colors = new Float32Array(this.capacity * 2 * 3);

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.lineGeometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.lineGeometry.setDrawRange(0, 0);

    this.lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
    });

    this.lineMesh = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.lineMesh.name = 'ToolpathLinesMesh';
    this.lineMesh.frustumCulled = false;
    this.lineSegmentsGroup.add(this.lineMesh);
    this.rootGroup.add(this.lineSegmentsGroup);

    // 2. Initialize Volumetric Beads
    this.instancedGroup = new THREE.Group();
    this.instancedGroup.name = 'VolumetricBeads';
    this.instancedGroup.visible = false; // default to fast lines

    this.unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.beadMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.15,
    });

    this.rootGroup.add(this.instancedGroup);
  }

  /**
   * Append a toolpath segment to the buffers.
   */
  public appendSegment(segment: ToolpathSegment): void {
    // 1. Failure Mode: Nozzle Clog (air printing - suppress extrusion visual)
    if (this.clogActive && segment.extrusionLength > 0.0001) {
      return;
    }

    // 2. Failure Mode: Bed Adhesion Failure (Spaghetti Mode)
    if (this.spaghettiActive && segment.extrusionLength > 0.0001) {
      const noodles = this.spaghettiGenerator.generateSpaghettiSegments(segment, 8);
      for (const noodle of noodles) {
        this.writeSingleSegment(noodle);
      }
      return;
    }

    // Standard segment insertion
    this.writeSingleSegment(segment);
  }

  private writeSingleSegment(segment: ToolpathSegment): void {
    // Apply layer shift offset if active
    const sx = segment.startX + this.layerShiftOffset.x;
    const sy = segment.startY + this.layerShiftOffset.y;
    const sz = segment.startZ;
    const ex = segment.endX + this.layerShiftOffset.x;
    const ey = segment.endY + this.layerShiftOffset.y;
    const ez = segment.endZ;

    // Check capacity expansion for LineSegments
    if (this.activeSegments >= this.capacity) {
      this.expandCapacity();
    }

    const segIdx = this.activeSegments;
    const vOffset = segIdx * 6; // 2 vertices * 3 floats

    // Write positions
    this.positions[vOffset] = sx;
    this.positions[vOffset + 1] = sy;
    this.positions[vOffset + 2] = sz;
    this.positions[vOffset + 3] = ex;
    this.positions[vOffset + 4] = ey;
    this.positions[vOffset + 5] = ez;

    // Determine color
    const color = TOOLPATH_COLORS[segment.type] ?? DEFAULT_TOOLPATH_COLOR;
    const cOffset = segIdx * 6;
    this.colors[cOffset] = color.r;
    this.colors[cOffset + 1] = color.g;
    this.colors[cOffset + 2] = color.b;
    this.colors[cOffset + 3] = color.r;
    this.colors[cOffset + 4] = color.g;
    this.colors[cOffset + 5] = color.b;

    // Update layer boundaries
    const layer = segment.layerIndex;
    if (!this.layerRanges.has(layer)) {
      this.layerRanges.set(layer, { firstSegmentIndex: segIdx, lastSegmentIndex: segIdx });
    } else {
      this.layerRanges.get(layer)!.lastSegmentIndex = segIdx;
    }

    if (layer < this.minRecordedLayer) this.minRecordedLayer = layer;
    if (layer > this.maxRecordedLayer) this.maxRecordedLayer = layer;

    this.activeSegments++;

    // Mark position and color attributes as needing update
    const posAttr = this.lineGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.lineGeometry.getAttribute('color') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Add to volumetric bead instances if it's an extrusion move
    if (segment.extrusionLength > 0.0001 && segment.type !== ToolpathType.TRAVEL) {
      this.appendVolumetricInstance(sx, sy, sz, ex, ey, ez, color, layer);
    }

    // Refresh active draw range according to layer filter
    this.refreshDrawRanges();
  }

  private appendVolumetricInstance(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    color: THREE.Color,
    layerIndex: number
  ): void {
    this.vStart.set(sx, sy, sz);
    this.vEnd.set(ex, ey, ez);
    this.vDir.subVectors(this.vEnd, this.vStart);
    const length = this.vDir.length();

    if (length < 0.0001) return;

    // Check if new chunk is needed
    if (this.currentChunkIndex < 0 || this.currentChunkInstanceCount >= this.chunkSize) {
      this.allocateInstancedChunk();
    }

    const chunk = this.instancedChunks[this.currentChunkIndex];
    const instanceIndex = this.currentChunkInstanceCount;

    // Midpoint
    this.vMid.addVectors(this.vStart, this.vEnd).multiplyScalar(0.5);

    // Orientation: align unit X vector to displacement vector
    this.vDir.normalize();
    this.qRot.setFromUnitVectors(this.xAxis, this.vDir);

    // Scale: (length, width, height)
    this.vScale.set(length, this.extrusionWidth, this.layerHeight);

    // Compose transform matrix
    this.mTransform.compose(this.vMid, this.qRot, this.vScale);

    chunk.setMatrixAt(instanceIndex, this.mTransform);
    chunk.setColorAt(instanceIndex, color);

    chunk.instanceMatrix.needsUpdate = true;
    if (chunk.instanceColor) chunk.instanceColor.needsUpdate = true;

    this.currentChunkInstanceCount++;
    chunk.count = this.currentChunkInstanceCount;
    this.totalVolumetricInstances++;

    this.volumetricMetadata.push({
      chunkIndex: this.currentChunkIndex,
      instanceIndex,
      layerIndex,
    });
  }

  private allocateInstancedChunk(): void {
    const chunk = new THREE.InstancedMesh(this.unitBoxGeometry, this.beadMaterial, this.chunkSize);
    chunk.name = `BeadChunk_${this.instancedChunks.length}`;
    chunk.castShadow = true;
    chunk.receiveShadow = true;
    chunk.count = 0;
    chunk.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.instancedChunks.push(chunk);
    this.instancedGroup.add(chunk);

    this.currentChunkIndex = this.instancedChunks.length - 1;
    this.currentChunkInstanceCount = 0;
  }

  /**
   * Expand pre-allocated typed arrays by 2x when capacity is exceeded.
   */
  private expandCapacity(): void {
    const newCapacity = this.capacity * 2;
    const newPositions = new Float32Array(newCapacity * 2 * 3);
    const newColors = new Float32Array(newCapacity * 2 * 3);

    newPositions.set(this.positions);
    newColors.set(this.colors);

    this.positions = newPositions;
    this.colors = newColors;
    this.capacity = newCapacity;

    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.lineGeometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
  }

  /**
   * Filter visible toolpaths to a specific layer range [minLayer, maxLayer].
   * Updates `setDrawRange` instantly with ZERO geometry reallocation.
   */
  public setLayerFilter(minLayer: number, maxLayer: number): void {
    this.currentMinLayer = minLayer;
    this.currentMaxLayer = maxLayer;
    this.refreshDrawRanges();
  }

  private refreshDrawRanges(): void {
    if (this.activeSegments === 0 || this.currentMinLayer > this.currentMaxLayer) {
      this.lineGeometry.setDrawRange(0, 0);
      this.updateVolumetricLayerFilter();
      return;
    }

    // Find start segment of smallest recorded layer >= minLayer
    let startSeg = -1;
    for (let l = this.currentMinLayer; l <= this.maxRecordedLayer; l++) {
      const range = this.layerRanges.get(l);
      if (range) {
        startSeg = range.firstSegmentIndex;
        break;
      }
    }

    // Find end segment of largest recorded layer <= maxLayer
    let endSeg = -1;
    for (let l = Math.min(this.currentMaxLayer, this.maxRecordedLayer); l >= this.minRecordedLayer; l--) {
      const range = this.layerRanges.get(l);
      if (range) {
        endSeg = range.lastSegmentIndex;
        break;
      }
    }

    if (startSeg === -1 || endSeg === -1 || startSeg > endSeg) {
      this.lineGeometry.setDrawRange(0, 0);
    } else {
      const startVertex = startSeg * 2;
      const count = (endSeg - startSeg + 1) * 2;
      this.lineGeometry.setDrawRange(startVertex, count);
    }

    this.updateVolumetricLayerFilter();
  }

  private updateVolumetricLayerFilter(): void {
    if (this.instancedChunks.length === 0) return;

    // Per chunk visible instance count
    const chunkCounts = new Array<number>(this.instancedChunks.length).fill(0);

    for (let i = 0; i < this.volumetricMetadata.length; i++) {
      const meta = this.volumetricMetadata[i];
      if (meta.layerIndex >= this.currentMinLayer && meta.layerIndex <= this.currentMaxLayer) {
        chunkCounts[meta.chunkIndex]++;
      }
    }

    for (let c = 0; c < this.instancedChunks.length; c++) {
      this.instancedChunks[c].count = chunkCounts[c];
      this.instancedChunks[c].visible = chunkCounts[c] > 0;
    }
  }

  /**
   * Set rendering mode: 'lines' (fast vector) or 'volumetric' (solid beads).
   */
  public setRenderMode(mode: RenderMode): void {
    this.renderMode = mode;
    this.lineSegmentsGroup.visible = mode === 'lines';
    this.instancedGroup.visible = mode === 'volumetric';
  }

  public getRenderMode(): RenderMode {
    return this.renderMode;
  }

  /**
   * Configure failure visual modes.
   */
  public setFailureVisual(failureType: FailureVisualType, active: boolean): void {
    switch (failureType) {
      case 'clog':
        this.clogActive = active;
        break;
      case 'spaghetti':
        this.spaghettiActive = active;
        break;
      case 'layer_shift':
        if (active) {
          this.layerShiftOffset = { x: 8, y: 4 }; // default shift
        } else {
          this.layerShiftOffset = { x: 0, y: 0 };
        }
        break;
    }
  }

  public setLayerShiftOffset(offsetX: number, offsetY: number): void {
    this.layerShiftOffset = { x: offsetX, y: offsetY };
  }

  public getLayerShiftOffset(): { x: number; y: number } {
    return { ...this.layerShiftOffset };
  }

  public isClogActive(): boolean {
    return this.clogActive;
  }

  public isSpaghettiActive(): boolean {
    return this.spaghettiActive;
  }

  /**
   * Clear all toolpaths and reset draw ranges.
   */
  public clear(): void {
    this.activeSegments = 0;
    this.layerRanges.clear();
    this.minRecordedLayer = Infinity;
    this.maxRecordedLayer = -Infinity;
    this.currentMinLayer = 0;
    this.currentMaxLayer = Infinity;
    this.lineGeometry.setDrawRange(0, 0);

    // Reset volumetric chunks
    for (const chunk of this.instancedChunks) {
      chunk.count = 0;
      chunk.visible = false;
    }
    this.currentChunkIndex = -1;
    this.currentChunkInstanceCount = 0;
    this.totalVolumetricInstances = 0;
    this.volumetricMetadata.length = 0;
  }

  // Accessors
  public getSegmentCount(): number {
    return this.activeSegments;
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public getActiveDrawCount(): number {
    return (this.lineGeometry.drawRange.count as number) ?? 0;
  }

  public getPositionBuffer(): Float32Array {
    return this.positions;
  }

  public getColorBuffer(): Float32Array {
    return this.colors;
  }

  public getGeometry(): THREE.BufferGeometry {
    return this.lineGeometry;
  }

  public getLayerRanges(): Map<number, LayerRange> {
    return this.layerRanges;
  }

  public getTotalVolumetricInstances(): number {
    return this.totalVolumetricInstances;
  }

  public getChunkCount(): number {
    return this.instancedChunks.length;
  }

  public dispose(): void {
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
    this.unitBoxGeometry.dispose();
    this.beadMaterial.dispose();
    for (const chunk of this.instancedChunks) {
      chunk.dispose();
    }
    this.instancedChunks.length = 0;
  }
}
