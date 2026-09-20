import * as THREE from 'three';

/**
 * 3D Mesh representation of the fixed 3D Printer Chassis Frame.
 * Features realistic 2020/2040 V-slot aluminum extrusions, rubber feet,
 * vertical Z pillars, lead screws, and stepper motor mounts.
 */
export class PrinterChassisMesh {
  public readonly group: THREE.Group;

  // Materials
  private readonly aluminumMaterial: THREE.MeshStandardMaterial;
  private readonly rubberMaterial: THREE.MeshStandardMaterial;
  private readonly metalRodMaterial: THREE.MeshStandardMaterial;
  private readonly motorBodyMaterial: THREE.MeshStandardMaterial;
  private readonly motorFaceMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'PrinterChassis';

    // PBR Materials
    this.aluminumMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b323c, // Dark anodized aluminum
      roughness: 0.35,
      metalness: 0.85,
    });

    this.rubberMaterial = new THREE.MeshStandardMaterial({
      color: 0x111317, // Soft black rubber
      roughness: 0.9,
      metalness: 0.05,
    });

    this.metalRodMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8, // Polished steel lead screw
      roughness: 0.25,
      metalness: 0.95,
    });

    this.motorBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e242d, // Black stepper motor stator
      roughness: 0.6,
      metalness: 0.4,
    });

    this.motorFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Brushed aluminum faceplate
      roughness: 0.3,
      metalness: 0.8,
    });

    this.buildChassis();
  }

  private buildChassis(): void {
    // 1. Base Frame Extrusions (2040 V-slot, 40mm high x 20mm wide)
    // The print bed is 220x220 mm centered around X=110, Y=110.
    // Base spans X from -45 to 265 (width = 310mm), Y from -50 to 270 (depth = 320mm).
    const baseZ = -30; // Z height of base extrusions

    // Left base beam (2040 extrusion along Y)
    const leftBeam = this.createBox(20, 320, 40, this.aluminumMaterial);
    leftBeam.position.set(-35, 110, baseZ);
    this.group.add(leftBeam);

    // Right base beam (2040 extrusion along Y)
    const rightBeam = this.createBox(20, 320, 40, this.aluminumMaterial);
    rightBeam.position.set(255, 110, baseZ);
    this.group.add(rightBeam);

    // Center Y-axis rail (2040 extrusion along Y for bed carriage)
    const centerRail = this.createBox(40, 340, 20, this.aluminumMaterial);
    centerRail.position.set(110, 110, baseZ + 10);
    this.group.add(centerRail);

    // Front crossbeam (2020 extrusion along X)
    const frontBeam = this.createBox(310, 20, 20, this.aluminumMaterial);
    frontBeam.position.set(110, -40, baseZ);
    this.group.add(frontBeam);

    // Rear crossbeam (2020 extrusion along X)
    const rearBeam = this.createBox(310, 20, 20, this.aluminumMaterial);
    rearBeam.position.set(110, 260, baseZ);
    this.group.add(rearBeam);

    // 2. Rubber Feet (4 corners)
    const footZ = baseZ - 23;
    const footLocations: [number, number][] = [
      [-35, -40],
      [255, -40],
      [-35, 260],
      [255, 260],
    ];
    for (const [fx, fy] of footLocations) {
      const foot = this.createCylinder(12, 10, 8, this.rubberMaterial);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(fx, fy, footZ);
      this.group.add(foot);
    }

    // 3. Vertical Z Pillars (2040 V-slot pillars from base up to Z=290)
    const pillarHeight = 310;
    const pillarZ = baseZ + 20 + pillarHeight / 2;

    // Left Z Tower
    const leftTower = this.createBox(40, 20, pillarHeight, this.aluminumMaterial);
    leftTower.position.set(-35, 0, pillarZ);
    this.group.add(leftTower);

    // Right Z Tower
    const rightTower = this.createBox(40, 20, pillarHeight, this.aluminumMaterial);
    rightTower.position.set(255, 0, pillarZ);
    this.group.add(rightTower);

    // Top Crossbar (2020 extrusion connecting towers)
    const topBar = this.createBox(310, 20, 20, this.aluminumMaterial);
    topBar.position.set(110, 0, baseZ + 20 + pillarHeight + 10);
    this.group.add(topBar);

    // 4. Z Lead Screws & Motors
    // Left lead screw (8mm threaded rod)
    const leadScrewHeight = 290;
    const screwZ = baseZ + 20 + leadScrewHeight / 2;

    const leftScrew = this.createCylinder(4, 4, leadScrewHeight, this.metalRodMaterial);
    leftScrew.rotation.x = Math.PI / 2;
    leftScrew.position.set(-20, 0, screwZ);
    this.group.add(leftScrew);

    // Right lead screw (dual Z setup)
    const rightScrew = this.createCylinder(4, 4, leadScrewHeight, this.metalRodMaterial);
    rightScrew.rotation.x = Math.PI / 2;
    rightScrew.position.set(240, 0, screwZ);
    this.group.add(rightScrew);

    // Z Stepper Motor (Left)
    const zMotorLeft = this.createStepperMotor();
    zMotorLeft.position.set(-20, 0, baseZ + 5);
    this.group.add(zMotorLeft);

    // Y Stepper Motor (Rear of center rail)
    const yMotor = this.createStepperMotor();
    yMotor.rotation.x = -Math.PI / 2;
    yMotor.position.set(110, 275, baseZ + 10);
    this.group.add(yMotor);

    // Y Belt Idler Pulley (Front of center rail)
    const yIdler = this.createCylinder(8, 8, 14, this.metalRodMaterial);
    yIdler.rotation.x = Math.PI / 2;
    yIdler.position.set(110, -45, baseZ + 10);
    this.group.add(yIdler);
  }

  private createStepperMotor(): THREE.Group {
    const motorGroup = new THREE.Group();

    // NEMA 17 body (42 x 42 x 34 mm)
    const body = this.createBox(42, 42, 34, this.motorBodyMaterial);
    motorGroup.add(body);

    // Aluminum faceplate
    const face = this.createBox(42, 42, 4, this.motorFaceMaterial);
    face.position.set(0, 0, 19);
    motorGroup.add(face);

    // Motor shaft / coupler
    const coupler = this.createCylinder(7, 7, 18, this.metalRodMaterial);
    coupler.rotation.x = Math.PI / 2;
    coupler.position.set(0, 0, 28);
    motorGroup.add(coupler);

    return motorGroup;
  }

  private createBox(w: number, d: number, h: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, d, h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createCylinder(rTop: number, rBot: number, h: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, 16);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  public dispose(): void {
    this.aluminumMaterial.dispose();
    this.rubberMaterial.dispose();
    this.metalRodMaterial.dispose();
    this.motorBodyMaterial.dispose();
    this.motorFaceMaterial.dispose();
  }
}
