import * as THREE from 'three';

/**
 * 3D Mesh representation of the Z-Gantry, X-Carriage, and Extruder Toolhead.
 * - Z-axis gantry translates along Z: [0, +Z_rel]
 * - Toolhead carriage translates along X: [0, +X_rel] on the horizontal Z-gantry rail
 * - Brass nozzle orifice is centered precisely at relative [0, 0, 0] of the carriage
 * - Heater block emits a dynamic red/orange thermal glow when hot
 * - Dynamic molten extrusion bead cursor indicates active filament deposition
 */
export class ToolheadMesh {
  // Gantry group translates along Z
  public readonly group: THREE.Group;
  // Carriage group translates along X
  public readonly carriageGroup: THREE.Group;

  // Visual sub-meshes
  private readonly xRailMesh: THREE.Mesh;
  private readonly carriagePlateMesh: THREE.Mesh;
  private readonly heaterBlockMesh: THREE.Mesh;
  public readonly nozzleMesh: THREE.Group;
  private readonly heatsinkMesh: THREE.Mesh;
  private readonly extruderMotorGroup: THREE.Group;
  private readonly fanDuctMesh: THREE.Mesh;
  private readonly extrusionCursorMesh: THREE.Mesh;

  // Materials
  private readonly aluminumMaterial: THREE.MeshStandardMaterial;
  private readonly metalRodMaterial: THREE.MeshStandardMaterial;
  private readonly brassMaterial: THREE.MeshStandardMaterial;
  private readonly heaterBlockMaterial: THREE.MeshStandardMaterial;
  private readonly heatsinkMaterial: THREE.MeshStandardMaterial;
  private readonly motorBodyMaterial: THREE.MeshStandardMaterial;
  private readonly motorFaceMaterial: THREE.MeshStandardMaterial;
  private readonly fanDuctMaterial: THREE.MeshStandardMaterial;
  private readonly cursorMaterial: THREE.MeshStandardMaterial;

  private currentX: number = 0;
  private currentZ: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ZAxisGantryAssembly';

    this.carriageGroup = new THREE.Group();
    this.carriageGroup.name = 'ToolheadCarriage';

    // Materials
    this.aluminumMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b323c,
      roughness: 0.35,
      metalness: 0.85,
    });

    this.metalRodMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.25,
      metalness: 0.95,
    });

    this.brassMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Warm polished brass
      roughness: 0.25,
      metalness: 0.9,
    });

    this.heaterBlockMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Aluminum block
      roughness: 0.3,
      metalness: 0.85,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });

    this.heatsinkMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Blue anodized aluminum heatsink fins
      roughness: 0.3,
      metalness: 0.8,
    });

    this.motorBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e242d,
      roughness: 0.6,
      metalness: 0.4,
    });

    this.motorFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.3,
      metalness: 0.8,
    });

    this.fanDuctMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Injection molded black fan shroud
      roughness: 0.7,
      metalness: 0.1,
    });

    this.cursorMaterial = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: new THREE.Color(0xf97316),
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.1,
    });

    // 1. Build Z-Gantry horizontal rail (2020 extrusion spanning X)
    // Spans from X = -45 to X = 265 at Y = 0
    const railGeo = new THREE.BoxGeometry(310, 20, 20);
    this.xRailMesh = new THREE.Mesh(railGeo, this.aluminumMaterial);
    this.xRailMesh.position.set(110, 0, 10);
    this.xRailMesh.castShadow = true;
    this.group.add(this.xRailMesh);

    // X Stepper motor (mounted on left of gantry rail)
    const xMotor = this.createMotor();
    xMotor.position.set(-45, 0, 10);
    this.group.add(xMotor);

    // X Belt idler pulley (right side)
    const idlerGeo = new THREE.CylinderGeometry(7, 7, 12, 16);
    const idler = new THREE.Mesh(idlerGeo, this.metalRodMaterial);
    idler.rotation.x = Math.PI / 2;
    idler.position.set(260, 0, 10);
    this.group.add(idler);

    // 2. Build Toolhead Carriage Assembly
    // Carriage plate riding along the X rail
    const plateGeo = new THREE.BoxGeometry(50, 4, 50);
    this.carriagePlateMesh = new THREE.Mesh(plateGeo, this.aluminumMaterial);
    this.carriagePlateMesh.position.set(0, -12, 20);
    this.carriageGroup.add(this.carriagePlateMesh);

    // 3. Brass Nozzle Tip (Orifice at relative [0, 0, 0])
    // Consists of a cylindrical hex body and a conical tip pointing down to Z = 0
    const nozzleGroup = new THREE.Group();

    // Conical tip: apex at Z = 0, base at Z = 3, radius 0.4mm at tip, 2.5mm at base
    const coneGeo = new THREE.ConeGeometry(2.5, 3, 16);
    const coneMesh = new THREE.Mesh(coneGeo, this.brassMaterial);
    coneMesh.rotation.x = Math.PI; // Point apex downward
    coneMesh.position.set(0, 0, 1.5);
    nozzleGroup.add(coneMesh);

    // Hex / cylindrical body from Z = 3 to Z = 6
    const hexGeo = new THREE.CylinderGeometry(3.5, 3.5, 3, 6);
    const hexMesh = new THREE.Mesh(hexGeo, this.brassMaterial);
    hexMesh.rotation.x = Math.PI / 2;
    hexMesh.position.set(0, 0, 4.5);
    nozzleGroup.add(hexMesh);

    this.nozzleMesh = nozzleGroup;
    this.carriageGroup.add(nozzleGroup);

    // 4. Heater Block (Aluminum block directly above nozzle: Z = 6 to Z = 16)
    const blockGeo = new THREE.BoxGeometry(16, 20, 10);
    this.heaterBlockMesh = new THREE.Mesh(blockGeo, this.heaterBlockMaterial);
    this.heaterBlockMesh.position.set(0, 0, 11);
    this.heaterBlockMesh.castShadow = true;
    this.carriageGroup.add(this.heaterBlockMesh);

    // 5. Aluminum Heatsink Fins (Z = 16 to Z = 42)
    const heatsinkGeo = new THREE.CylinderGeometry(11, 11, 26, 16);
    this.heatsinkMesh = new THREE.Mesh(heatsinkGeo, this.heatsinkMaterial);
    this.heatsinkMesh.rotation.x = Math.PI / 2;
    this.heatsinkMesh.position.set(0, 0, 29);
    this.carriageGroup.add(this.heatsinkMesh);

    // 6. Extruder NEMA 17 Stepper Motor (mounted above heatsink, Z = 45 to Z = 79)
    this.extruderMotorGroup = this.createMotor();
    this.extruderMotorGroup.position.set(0, 16, 55);
    this.carriageGroup.add(this.extruderMotorGroup);

    // 7. Part Cooling Fan Duct (pointing downward toward nozzle orifice)
    const ductGeo = new THREE.BoxGeometry(22, 18, 24);
    this.fanDuctMesh = new THREE.Mesh(ductGeo, this.fanDuctMaterial);
    this.fanDuctMesh.position.set(16, -8, 14);
    this.carriageGroup.add(this.fanDuctMesh);

    // 8. Dynamic Molten Extrusion Cursor Bead at nozzle orifice [0, 0, 0]
    const cursorGeo = new THREE.SphereGeometry(0.35, 12, 12);
    this.extrusionCursorMesh = new THREE.Mesh(cursorGeo, this.cursorMaterial);
    this.extrusionCursorMesh.position.set(0, 0, 0.2);
    this.extrusionCursorMesh.scale.set(0.001, 0.001, 0.001); // hidden when not extruding
    this.carriageGroup.add(this.extrusionCursorMesh);

    // Add carriage to gantry
    this.group.add(this.carriageGroup);
  }

  private createMotor(): THREE.Group {
    const motor = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(42, 42, 34), this.motorBodyMaterial);
    motor.add(body);
    const face = new THREE.Mesh(new THREE.BoxGeometry(42, 42, 3), this.motorFaceMaterial);
    face.position.set(0, 0, 18);
    motor.add(face);
    return motor;
  }

  /**
   * Update kinematic position of the toolhead and gantry.
   *
   * @param x X coordinate in mm (0 to 220)
   * @param z Z coordinate in mm (0 to 250)
   * @param isExtruding True if filament is currently being deposited
   * @param fanSpeed Part cooling fan duty cycle (0.0 to 1.0)
   */
  public updateKinematics(x: number, z: number, isExtruding: boolean, _fanSpeed: number = 0): void {
    this.currentX = x;
    this.currentZ = z;

    // Translate Z gantry vertically
    this.group.position.z = z;

    // Translate X carriage horizontally on gantry rail
    this.carriageGroup.position.x = x;

    // Update dynamic extrusion cursor
    if (isExtruding) {
      this.extrusionCursorMesh.scale.set(1.2, 1.2, 1.2);
      this.cursorMaterial.emissiveIntensity = 1.0;
    } else {
      this.extrusionCursorMesh.scale.set(0.001, 0.001, 0.001);
      this.cursorMaterial.emissiveIntensity = 0.2;
    }
  }

  /**
   * Update visual thermal glow of heater block based on temperature.
   *
   * @param actualTemp Hotend measured temperature (°C)
   * @param targetTemp Hotend commanded target setpoint (°C)
   */
  public updateTemperature(actualTemp: number, _targetTemp?: number): void {
    if (actualTemp > 50) {
      // Glow shifts from deep dark red (50°C) to vivid red-orange (200°C) to yellow-white (260°C+)
      const t = Math.min(1.0, Math.max(0, (actualTemp - 50) / 210));
      const r = 0.4 + 0.6 * t;
      const g = 0.05 + 0.35 * Math.pow(t, 2);
      const b = 0.01 + 0.15 * Math.pow(t, 3);
      this.heaterBlockMaterial.emissive.setRGB(r, g, b);
      this.heaterBlockMaterial.emissiveIntensity = 0.3 + 0.7 * t;
    } else {
      this.heaterBlockMaterial.emissive.setRGB(0, 0, 0);
      this.heaterBlockMaterial.emissiveIntensity = 0;
    }
  }

  /**
   * Returns current world position of the nozzle orifice tip.
   */
  public getNozzleWorldPosition(): THREE.Vector3 {
    const pos = new THREE.Vector3();
    this.carriageGroup.getWorldPosition(pos);
    return pos;
  }

  public getX(): number {
    return this.currentX;
  }

  public getZ(): number {
    return this.currentZ;
  }

  public dispose(): void {
    this.aluminumMaterial.dispose();
    this.metalRodMaterial.dispose();
    this.brassMaterial.dispose();
    this.heaterBlockMaterial.dispose();
    this.heatsinkMaterial.dispose();
    this.motorBodyMaterial.dispose();
    this.motorFaceMaterial.dispose();
    this.fanDuctMaterial.dispose();
    this.cursorMaterial.dispose();
  }
}
