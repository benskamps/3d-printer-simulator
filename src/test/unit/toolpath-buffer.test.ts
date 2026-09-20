import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ToolpathBufferManager,
  TOOLPATH_COLORS,
} from '../../viewport/ToolpathBufferManager';
import { HeatedBedMesh } from '../../viewport/HeatedBedMesh';
import { ToolheadMesh } from '../../viewport/ToolheadMesh';
import { PrinterChassisMesh } from '../../viewport/PrinterChassisMesh';
import { ThreePrinterViewport } from '../../viewport/ThreePrinterViewport';
import { ToolpathSegment, ToolpathType } from '../../core/kinematics/types';

describe('ToolpathBufferManager — High Performance Hybrid Extrusion Buffer', () => {
  let manager: ToolpathBufferManager;

  const createSegment = (overrides?: Partial<ToolpathSegment>): ToolpathSegment => ({
    startX: 10,
    startY: 20,
    startZ: 0.2,
    endX: 30,
    endY: 40,
    endZ: 0.2,
    extrusionLength: 1.5,
    feedrate: 3000,
    type: ToolpathType.WALL_OUTER,
    layerIndex: 1,
    commandIndex: 1,
    ...overrides,
  });

  beforeEach(() => {
    manager = new ToolpathBufferManager({
      initialCapacity: 100,
      chunkSize: 50,
      extrusionWidth: 0.45,
      layerHeight: 0.2,
    });
  });

  describe('1. Initial Allocation and Defaults', () => {
    it('allocates typed arrays matching initial capacity', () => {
      expect(manager.getCapacity()).toBe(100);
      expect(manager.getSegmentCount()).toBe(0);
      expect(manager.getActiveDrawCount()).toBe(0);

      const positions = manager.getPositionBuffer();
      const colors = manager.getColorBuffer();

      // 100 segments * 2 vertices * 3 coords = 600 floats
      expect(positions).toBeInstanceOf(Float32Array);
      expect(positions.length).toBe(600);
      expect(colors).toBeInstanceOf(Float32Array);
      expect(colors.length).toBe(600);
    });

    it('defaults to fast vector lines render mode', () => {
      expect(manager.getRenderMode()).toBe('lines');
    });

    it('provides BufferGeometry with position and color attributes', () => {
      const geo = manager.getGeometry();
      expect(geo).toBeInstanceOf(THREE.BufferGeometry);
      expect(geo.getAttribute('position')).toBeDefined();
      expect(geo.getAttribute('color')).toBeDefined();
      expect(geo.drawRange.count).toBe(0);
    });
  });

  describe('2. Segment Addition & Vertex Buffer Writing', () => {
    it('correctly writes start and end coordinates into position buffer', () => {
      const seg = createSegment({
        startX: 12.5,
        startY: 25.0,
        startZ: 0.28,
        endX: 50.0,
        endY: 75.5,
        endZ: 0.28,
      });

      manager.appendSegment(seg);

      expect(manager.getSegmentCount()).toBe(1);
      // 1 segment = 2 vertices = drawRange count 2
      expect(manager.getActiveDrawCount()).toBe(2);

      const pos = manager.getPositionBuffer();
      // Start vertex (X, Y, Z)
      expect(pos[0]).toBeCloseTo(12.5);
      expect(pos[1]).toBeCloseTo(25.0);
      expect(pos[2]).toBeCloseTo(0.28);

      // End vertex (X, Y, Z)
      expect(pos[3]).toBeCloseTo(50.0);
      expect(pos[4]).toBeCloseTo(75.5);
      expect(pos[5]).toBeCloseTo(0.28);
    });

    it('assigns correct colors per ToolpathType', () => {
      const types = [
        ToolpathType.WALL_OUTER,
        ToolpathType.WALL_INNER,
        ToolpathType.INFILL,
        ToolpathType.SOLID_SURFACE,
        ToolpathType.SUPPORT,
        ToolpathType.SKIRT_BRIM,
        ToolpathType.TRAVEL,
      ];

      for (let i = 0; i < types.length; i++) {
        manager.appendSegment(createSegment({ type: types[i] }));
        const expectedColor = TOOLPATH_COLORS[types[i]];
        const col = manager.getColorBuffer();
        const offset = i * 6;

        expect(col[offset]).toBeCloseTo(expectedColor.r);
        expect(col[offset + 1]).toBeCloseTo(expectedColor.g);
        expect(col[offset + 2]).toBeCloseTo(expectedColor.b);
      }

      expect(manager.getSegmentCount()).toBe(types.length);
    });

    it('updates geometry drawRange to activeSegments * 2', () => {
      for (let i = 0; i < 15; i++) {
        manager.appendSegment(createSegment());
      }
      expect(manager.getSegmentCount()).toBe(15);
      expect(manager.getActiveDrawCount()).toBe(30);
    });
  });

  describe('3. Dynamic Capacity Expansion', () => {
    it('dynamically doubles buffer capacity when initial limit is exceeded', () => {
      const tinyManager = new ToolpathBufferManager({ initialCapacity: 4 });
      expect(tinyManager.getCapacity()).toBe(4);

      // Add 4 segments (capacity limit reached)
      for (let i = 0; i < 4; i++) {
        tinyManager.appendSegment(createSegment({ startX: i, endX: i + 1 }));
      }
      expect(tinyManager.getCapacity()).toBe(4);
      expect(tinyManager.getSegmentCount()).toBe(4);

      // 5th segment triggers expansion: 4 -> 8
      tinyManager.appendSegment(createSegment({ startX: 100, endX: 101 }));
      expect(tinyManager.getCapacity()).toBe(8);
      expect(tinyManager.getSegmentCount()).toBe(5);
      expect(tinyManager.getActiveDrawCount()).toBe(10);

      // Verify that previously written segments remain bit-exact after expansion
      const pos = tinyManager.getPositionBuffer();
      for (let i = 0; i < 4; i++) {
        const offset = i * 6;
        expect(pos[offset]).toBe(i);
        expect(pos[offset + 3]).toBe(i + 1);
      }

      // Verify newly appended 5th segment
      expect(pos[24]).toBe(100);
      expect(pos[27]).toBe(101);

      // Add 4 more segments: should expand from 8 to 16
      for (let i = 0; i < 4; i++) {
        tinyManager.appendSegment(createSegment());
      }
      expect(tinyManager.getCapacity()).toBe(16);
      expect(tinyManager.getSegmentCount()).toBe(9);
    });
  });

  describe('4. Volumetric Bead Mode (InstancedMesh)', () => {
    it('creates volumetric bead instances for extrusion moves', () => {
      manager.appendSegment(
        createSegment({
          startX: 0,
          startY: 0,
          startZ: 0.2,
          endX: 10,
          endY: 0,
          endZ: 0.2,
          extrusionLength: 1.0,
          type: ToolpathType.WALL_OUTER,
        })
      );

      expect(manager.getTotalVolumetricInstances()).toBe(1);
      expect(manager.getChunkCount()).toBe(1);
    });

    it('does not create volumetric beads for travel moves (E=0 or TRAVEL)', () => {
      manager.appendSegment(
        createSegment({
          type: ToolpathType.TRAVEL,
          extrusionLength: 0,
        })
      );

      expect(manager.getSegmentCount()).toBe(1); // Added to line buffer
      expect(manager.getTotalVolumetricInstances()).toBe(0); // Excluded from volumetric beads
    });

    it('allocates additional chunks when chunkSize is exceeded', () => {
      const chunkManager = new ToolpathBufferManager({ chunkSize: 10, initialCapacity: 100 });
      for (let i = 0; i < 25; i++) {
        chunkManager.appendSegment(createSegment({ extrusionLength: 0.5 }));
      }

      expect(chunkManager.getTotalVolumetricInstances()).toBe(25);
      // 25 instances with chunk size 10 -> 3 chunks (10, 10, 5)
      expect(chunkManager.getChunkCount()).toBe(3);
    });

    it('toggles render mode between lines and volumetric', () => {
      manager.setRenderMode('volumetric');
      expect(manager.getRenderMode()).toBe('volumetric');

      manager.setRenderMode('lines');
      expect(manager.getRenderMode()).toBe('lines');
    });
  });

  describe('5. Layer Filtering & Instant Scrubbing', () => {
    beforeEach(() => {
      // Add 5 segments per layer for layers 0, 1, 2, 3
      for (let layer = 0; layer < 4; layer++) {
        for (let s = 0; s < 5; s++) {
          manager.appendSegment(createSegment({ layerIndex: layer }));
        }
      }
    });

    it('tracks layer boundaries in layerRanges map', () => {
      const ranges = manager.getLayerRanges();
      expect(ranges.size).toBe(4);

      expect(ranges.get(0)).toEqual({ firstSegmentIndex: 0, lastSegmentIndex: 4 });
      expect(ranges.get(1)).toEqual({ firstSegmentIndex: 5, lastSegmentIndex: 9 });
      expect(ranges.get(2)).toEqual({ firstSegmentIndex: 10, lastSegmentIndex: 14 });
      expect(ranges.get(3)).toEqual({ firstSegmentIndex: 15, lastSegmentIndex: 19 });
    });

    it('updates drawRange for a single-layer filter without reallocation', () => {
      const bufferBefore = manager.getPositionBuffer();

      // Filter to layer 2 only
      manager.setLayerFilter(2, 2);

      // Layer 2 has 5 segments (indices 10 to 14) -> vertices 20 to 29 (10 vertices)
      const geo = manager.getGeometry();
      expect(geo.drawRange.start).toBe(20);
      expect(geo.drawRange.count).toBe(10);

      // Zero geometry reallocation: typed array reference is identical
      expect(manager.getPositionBuffer()).toBe(bufferBefore);
    });

    it('updates drawRange for a range of layers [1, 3]', () => {
      manager.setLayerFilter(1, 3);

      // Layers 1 through 3 span segments 5 through 19 (15 segments = 30 vertices)
      const geo = manager.getGeometry();
      expect(geo.drawRange.start).toBe(10);
      expect(geo.drawRange.count).toBe(30);
    });

    it('handles inverted or non-existent layer ranges by setting drawRange count to 0', () => {
      manager.setLayerFilter(5, 2); // inverted
      expect(manager.getActiveDrawCount()).toBe(0);

      manager.setLayerFilter(50, 60); // beyond recorded layers
      expect(manager.getActiveDrawCount()).toBe(0);
    });

    it('resets to all layers when range covers min to max', () => {
      manager.setLayerFilter(0, 100);
      const geo = manager.getGeometry();
      expect(geo.drawRange.start).toBe(0);
      expect(geo.drawRange.count).toBe(40); // 20 segments * 2 vertices
    });
  });

  describe('6. Hardware Failure Visual Effects', () => {
    it('skips extrusion segment creation during nozzle clog (air printing)', () => {
      manager.setFailureVisual('clog', true);
      expect(manager.isClogActive()).toBe(true);

      // Extrusion move should be skipped
      manager.appendSegment(createSegment({ extrusionLength: 2.0 }));
      expect(manager.getSegmentCount()).toBe(0);

      // Travel move should still record normally
      manager.appendSegment(createSegment({ extrusionLength: 0, type: ToolpathType.TRAVEL }));
      expect(manager.getSegmentCount()).toBe(1);

      // Turn off clog: subsequent extrusion should record
      manager.setFailureVisual('clog', false);
      manager.appendSegment(createSegment({ extrusionLength: 2.0 }));
      expect(manager.getSegmentCount()).toBe(2);
    });

    it('generates multi-segment procedural curling noodles during spaghetti mode', () => {
      manager.setFailureVisual('spaghetti', true);
      expect(manager.isSpaghettiActive()).toBe(true);

      manager.appendSegment(
        createSegment({
          startX: 100,
          startY: 100,
          startZ: 10,
          endX: 110,
          endY: 100,
          endZ: 10,
          extrusionLength: 5.0,
        })
      );

      // A single nominal segment should produce multiple brownian noodle segments (> 1)
      expect(manager.getSegmentCount()).toBeGreaterThan(1);
    });

    it('applies hardware layer shift offset to vertices', () => {
      manager.setLayerShiftOffset(12.0, 6.0);
      expect(manager.getLayerShiftOffset()).toEqual({ x: 12.0, y: 6.0 });

      manager.appendSegment(
        createSegment({
          startX: 10,
          startY: 20,
          startZ: 0.2,
          endX: 30,
          endY: 40,
          endZ: 0.2,
        })
      );

      const pos = manager.getPositionBuffer();
      // Start vertex: 10 + 12 = 22, 20 + 6 = 26
      expect(pos[0]).toBeCloseTo(22.0);
      expect(pos[1]).toBeCloseTo(26.0);
      expect(pos[2]).toBeCloseTo(0.2);

      // End vertex: 30 + 12 = 42, 40 + 6 = 46
      expect(pos[3]).toBeCloseTo(42.0);
      expect(pos[4]).toBeCloseTo(46.0);
      expect(pos[5]).toBeCloseTo(0.2);
    });
  });

  describe('7. Clear and Lifecycle', () => {
    it('resets segment count, drawRange, and layer ranges on clear', () => {
      manager.appendSegment(createSegment({ layerIndex: 0 }));
      manager.appendSegment(createSegment({ layerIndex: 1 }));
      expect(manager.getSegmentCount()).toBe(2);

      manager.clear();

      expect(manager.getSegmentCount()).toBe(0);
      expect(manager.getActiveDrawCount()).toBe(0);
      expect(manager.getLayerRanges().size).toBe(0);
      expect(manager.getTotalVolumetricInstances()).toBe(0);

      // Can add new segments starting at index 0 after clear
      manager.appendSegment(createSegment({ startX: 99, endX: 100 }));
      expect(manager.getSegmentCount()).toBe(1);
      expect(manager.getPositionBuffer()[0]).toBe(99);
    });

    it('disposes resources cleanly', () => {
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});

describe('3D Kinematics Hierarchy & Scene Graph', () => {
  it('enforces that printedFilamentContainer is a direct child of HeatedBedMesh', () => {
    const bed = new HeatedBedMesh();
    const container = bed.getFilamentContainer();

    expect(container).toBeInstanceOf(THREE.Group);
    expect(container.parent).toBe(bed.group);
  });

  it('translates filament container synchronously when heated bed moves in Y', () => {
    const bed = new HeatedBedMesh();
    const filamentContainer = bed.getFilamentContainer();

    // Attach mock toolpath to container
    const testMesh = new THREE.Mesh();
    testMesh.position.set(110, 110, 0.2);
    filamentContainer.add(testMesh);

    // Initial bed position: Y=0 -> position.y = 0
    bed.updatePosition(0);
    expect(bed.group.position.y).toBe(0);

    // Bed moves to Y=110mm -> world Y of bed moves to -110mm
    bed.updatePosition(110);
    expect(bed.group.position.y).toBe(-110);

    // Update bed matrix world
    bed.group.updateMatrixWorld(true);

    const worldPos = new THREE.Vector3();
    testMesh.getWorldPosition(worldPos);

    // Local mesh is at (110, 110, 0.2). With bed at -110, world Y is: 110 + (-110) = 0!
    // This places the printed feature directly under the nozzle at (110, 0, 0.2)!
    expect(worldPos.x).toBeCloseTo(110);
    expect(worldPos.y).toBeCloseTo(0);
    expect(worldPos.z).toBeCloseTo(0.2);
  });

  it('updates toolhead X carriage and Z gantry independently', () => {
    const toolhead = new ToolheadMesh();

    toolhead.updateKinematics(85, 42.5, true, 0.8);

    expect(toolhead.getX()).toBe(85);
    expect(toolhead.getZ()).toBe(42.5);
    expect(toolhead.group.position.z).toBe(42.5);
    expect(toolhead.carriageGroup.position.x).toBe(85);
  });

  it('initializes PrinterChassisMesh with aluminum extrusions and rubber feet', () => {
    const chassis = new PrinterChassisMesh();
    expect(chassis.group).toBeInstanceOf(THREE.Group);
    expect(chassis.group.children.length).toBeGreaterThan(5);
    chassis.dispose();
  });

  it('initializes ThreePrinterViewport and handles headless operation', () => {
    const viewport = new ThreePrinterViewport();

    // Mock HTMLCanvasElement
    const mockCanvas = {
      clientWidth: 800,
      clientHeight: 600,
      addEventListener: () => {},
      removeEventListener: () => {},
      parentElement: null,
    } as unknown as HTMLCanvasElement;

    expect(() => viewport.init(mockCanvas)).not.toThrow();

    // Verify scene graph components are wired
    expect(viewport.chassisMesh).toBeDefined();
    expect(viewport.heatedBedMesh).toBeDefined();
    expect(viewport.toolheadMesh).toBeDefined();
    expect(viewport.toolpathBufferManager).toBeDefined();

    // Verify kinematics update
    viewport.updateKinematics({
      currentPosition: { x: 50, y: 60, z: 15, e: 10 },
      targetPosition: { x: 50, y: 60, z: 15, e: 10 },
      feedrate: 3000,
      isHomed: { x: true, y: true, z: true },
      isRelativePositioning: false,
      isRelativeExtruder: false,
      steppersEnabled: true,
      fanSpeed: 0.5,
      speedOverride: 100,
      flowOverride: 100,
      layerShiftOffset: { x: 0, y: 0 },
      activeLayer: 2,
      totalLayers: 50,
      isExtruding: true,
    });

    expect(viewport.heatedBedMesh.getPosition()).toBe(60);
    expect(viewport.toolheadMesh.getX()).toBe(50);
    expect(viewport.toolheadMesh.getZ()).toBe(15);

    // Verify camera preset switching
    expect(() => viewport.setCameraPreset('top')).not.toThrow();
    expect(() => viewport.setCameraPreset('front')).not.toThrow();
    expect(() => viewport.setCameraPreset('nozzle_follow')).not.toThrow();
    expect(() => viewport.setCameraPreset('isometric')).not.toThrow();

    // Verify render mode toggle
    expect(() => viewport.setRenderMode('volumetric')).not.toThrow();
    expect(() => viewport.setRenderMode('lines')).not.toThrow();

    // Verify failure visual triggering
    expect(() => viewport.triggerFailureVisual('clog', true)).not.toThrow();
    expect(() => viewport.triggerFailureVisual('thermal_runaway', true)).not.toThrow();

    // Verify disposal
    expect(() => viewport.dispose()).not.toThrow();
  });
});
