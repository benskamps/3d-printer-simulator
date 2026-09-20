import * as THREE from 'three';

/**
 * 3D Mesh representation of the Heated Bed Assembly.
 * Translates along the Y-axis ([0, -Y_rel]).
 *
 * CRITICAL SCENE GRAPH HIERARCHY:
 * The `printedFilamentContainer` (THREE.Group) MUST be parented to this Heated Bed Assembly
 * so that when the bed translates along the Y-axis during printing moves, all deposited
 * toolpath filament geometry moves synchronously with it in world 3D space.
 */
export class HeatedBedMesh {
  public readonly group: THREE.Group;
  public readonly printedFilamentContainer: THREE.Group;

  // Visual sub-meshes
  private readonly carriageGroup: THREE.Group;
  private readonly bedPlateMesh: THREE.Mesh;
  private readonly peiSheetMesh: THREE.Mesh;
  private readonly gridMesh: THREE.LineSegments;
  private readonly cornerKnobs: THREE.Mesh[] = [];

  // Materials
  private readonly carriageMaterial: THREE.MeshStandardMaterial;
  private readonly bedPlateMaterial: THREE.MeshStandardMaterial;
  private readonly peiMaterial: THREE.MeshStandardMaterial;
  private readonly gridMaterial: THREE.LineBasicMaterial;
  private readonly knobMaterial: THREE.MeshStandardMaterial;
  private readonly springMaterial: THREE.MeshStandardMaterial;

  private currentY: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'HeatedBedAssembly';

    // Materials
    this.carriageMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e242d, // Black anodized aluminum carriage plate
      roughness: 0.4,
      metalness: 0.7,
    });

    this.bedPlateMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Brushed aluminum heater plate
      roughness: 0.35,
      metalness: 0.85,
    });

    this.peiMaterial = new THREE.MeshStandardMaterial({
      color: 0x242831, // Textured golden-dark PEI powder coating
      roughness: 0.65,
      metalness: 0.2,
    });

    this.gridMaterial = new THREE.LineBasicMaterial({
      color: 0x475569, // Subtle slate grid lines
      transparent: true,
      opacity: 0.6,
    });

    this.knobMaterial = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Amber/brass knurled thumbscrew
      roughness: 0.3,
      metalness: 0.85,
    });

    this.springMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0, // Polished chrome spring
      roughness: 0.2,
      metalness: 0.95,
    });

    // 1. Under-bed Y-Carriage (H-plate riding on center 2040 extrusion)
    this.carriageGroup = new THREE.Group();
    this.carriageGroup.name = 'YCarriage';
    this.buildCarriage();
    this.group.add(this.carriageGroup);

    // 2. Heated Aluminum Bed Plate (235 x 235 x 3 mm) centered on (110, 110)
    // Printable area is 220 x 220 mm from X=0..220, Y=0..220.
    // Bed plate extends 7.5mm on each side (from -7.5 to 227.5).
    const bedGeo = new THREE.BoxGeometry(235, 235, 3);
    this.bedPlateMesh = new THREE.Mesh(bedGeo, this.bedPlateMaterial);
    this.bedPlateMesh.name = 'HeaterPlate';
    this.bedPlateMesh.position.set(110, 110, -2.5);
    this.bedPlateMesh.castShadow = true;
    this.bedPlateMesh.receiveShadow = true;
    this.group.add(this.bedPlateMesh);

    // 3. Textured PEI Spring Steel Build Sheet (235 x 235 x 1 mm)
    // Top surface sits precisely at Z = 0
    const peiGeo = new THREE.BoxGeometry(235, 235, 1);
    this.peiSheetMesh = new THREE.Mesh(peiGeo, this.peiMaterial);
    this.peiSheetMesh.name = 'PEIBuildSheet';
    this.peiSheetMesh.position.set(110, 110, -0.5);
    this.peiSheetMesh.receiveShadow = true;
    this.group.add(this.peiSheetMesh);

    // 4. 220x220 mm Grid Markings on PEI surface (Z = 0.05 mm)
    this.gridMesh = this.buildBedGrid(220, 220, 20);
    this.gridMesh.name = 'BedGrid';
    this.gridMesh.position.set(0, 0, 0.05);
    this.group.add(this.gridMesh);

    // 5. Four Corner Leveling Knobs & Springs
    this.buildCornerLevelingKnobs();

    // 6. Deposited Filament Toolpaths Container (MANDATORY PARENTING)
    this.printedFilamentContainer = new THREE.Group();
    this.printedFilamentContainer.name = 'PrintedFilamentContainer';
    // Local coordinates in printedFilamentContainer match nominal printer (X, Y, Z) directly!
    this.group.add(this.printedFilamentContainer);
  }

  private buildCarriage(): void {
    // Center carriage plate
    const plateGeo = new THREE.BoxGeometry(170, 170, 4);
    const plate = new THREE.Mesh(plateGeo, this.carriageMaterial);
    plate.position.set(110, 110, -18);
    plate.castShadow = true;
    this.carriageGroup.add(plate);

    // V-slot wheels (4 guide wheels underneath)
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
      metalness: 0.1,
    });
    const wheelGeo = new THREE.CylinderGeometry(12, 12, 11, 16);
    const wheelPositions: [number, number][] = [
      [85, 45],
      [135, 45],
      [85, 175],
      [135, 175],
    ];
    for (const [wx, wy] of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, wy, -25);
      this.carriageGroup.add(wheel);
    }
  }

  private buildCornerLevelingKnobs(): void {
    const knobLocations: [number, number][] = [
      [10, 10],
      [210, 10],
      [10, 210],
      [210, 210],
    ];

    const knobGeo = new THREE.CylinderGeometry(16, 18, 8, 24);
    const springGeo = new THREE.CylinderGeometry(6, 6, 12, 16);

    for (const [kx, ky] of knobLocations) {
      // Thumbscrew knob
      const knob = new THREE.Mesh(knobGeo, this.knobMaterial);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(kx, ky, -12);
      this.group.add(knob);
      this.cornerKnobs.push(knob);

      // Compression spring
      const spring = new THREE.Mesh(springGeo, this.springMaterial);
      spring.rotation.x = Math.PI / 2;
      spring.position.set(kx, ky, -6);
      this.group.add(spring);
    }
  }

  private buildBedGrid(width: number, height: number, spacing: number): THREE.LineSegments {
    const vertices: number[] = [];

    // Outer border of printable area
    vertices.push(0, 0, 0, width, 0, 0);
    vertices.push(width, 0, 0, width, height, 0);
    vertices.push(width, height, 0, 0, height, 0);
    vertices.push(0, height, 0, 0, 0, 0);

    // Internal grid lines
    for (let x = spacing; x < width; x += spacing) {
      vertices.push(x, 0, 0, x, height, 0);
    }
    for (let y = spacing; y < height; y += spacing) {
      vertices.push(0, y, 0, width, y, 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return new THREE.LineSegments(geometry, this.gridMaterial);
  }

  /**
   * Update the physical Y position of the heated bed.
   * In a bed-slinger, moving to coordinate Y translates the bed to -Y relative to the gantry.
   *
   * @param y Coordinate in mm (0 to 220)
   */
  public updatePosition(y: number): void {
    this.currentY = y;
    this.group.position.y = y === 0 ? 0 : -y;
  }

  /**
   * Return the current physical Y coordinate.
   */
  public getPosition(): number {
    return this.currentY;
  }

  /**
   * Returns the container group for printed filament.
   * Any geometry added to this group will move synchronously with the bed.
   */
  public getFilamentContainer(): THREE.Group {
    return this.printedFilamentContainer;
  }

  /**
   * Update visual heating feedback based on temperature.
   */
  public updateTemperature(actualTemp: number, _targetTemp?: number): void {
    if (actualTemp > 45) {
      // Subtle warm amber glow on bed plate edge when hot
      const intensity = Math.min(1, (actualTemp - 45) / 55);
      this.bedPlateMaterial.emissive.setRGB(0.18 * intensity, 0.05 * intensity, 0.0);
    } else {
      this.bedPlateMaterial.emissive.setRGB(0, 0, 0);
    }
  }

  public dispose(): void {
    this.carriageMaterial.dispose();
    this.bedPlateMaterial.dispose();
    this.peiMaterial.dispose();
    this.gridMaterial.dispose();
    this.knobMaterial.dispose();
    this.springMaterial.dispose();
  }
}
