import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IKinematicState, ToolpathSegment } from '../core/kinematics/types';
import {
  CameraPreset,
  FailureVisualType,
  IPrinterViewportController,
  RenderMode,
} from './types';
import { PrinterChassisMesh } from './PrinterChassisMesh';
import { HeatedBedMesh } from './HeatedBedMesh';
import { ToolheadMesh } from './ToolheadMesh';
import { ToolpathBufferManager } from './ToolpathBufferManager';

/**
 * Decoupled Imperative Viewport Engine for 3D Printer Simulation.
 *
 * Directly manages THREE.Scene, THREE.PerspectiveCamera, THREE.WebGLRenderer,
 * OrbitControls, and a decoupled 60fps requestAnimationFrame render loop.
 *
 * Guarantees zero React reconciliation stalls during high-speed G-code playback (up to 100x).
 */
export class ThreePrinterViewport implements IPrinterViewportController {
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer | null = null;
  public controls: OrbitControls | null = null;

  // Scene Graph Entities
  public chassisMesh!: PrinterChassisMesh;
  public heatedBedMesh!: HeatedBedMesh;
  public toolheadMesh!: ToolheadMesh;
  public toolpathBufferManager!: ToolpathBufferManager;

  // Environment & Lights
  private ambientLight!: THREE.AmbientLight;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private floorGrid!: THREE.GridHelper;
  private axesHelper!: THREE.AxesHelper;

  // State
  public canvas: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isDisposed: boolean = false;
  private activeCameraPreset: CameraPreset = 'isometric';
  private currentKinematics: IKinematicState | null = null;

  // Thermal runaway visual alert
  private thermalRunawayAlertActive: boolean = false;
  private alertPulseTimer: number = 0;

  constructor() {
    // Three.js uses Z as UP for CAD / 3D printing
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
  }

  /**
   * Initialize the 3D viewport canvas, scene graph, lighting, and camera.
   */
  public init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.isDisposed = false;

    // 1. Create Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1d); // Deep dark slate
    this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.0008);

    // 2. Setup Camera (Z is UP)
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;
    this.camera = new THREE.PerspectiveCamera(42, width / height, 1, 3000);
    this.camera.up.set(0, 0, 1);

    // 3. Initialize WebGL Renderer (with headless fallback guard)
    if (typeof canvas.getContext === 'function') {
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        });
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
      } catch (e) {
        console.warn('ThreePrinterViewport: WebGLRenderer not available, running headlessly.', e);
        this.renderer = null;
      }
    } else {
      this.renderer = null;
    }

    // 4. OrbitControls
    if (this.renderer && typeof OrbitControls !== 'undefined') {
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxPolarAngle = Math.PI / 2 + 0.12; // Prevent going completely below ground
      this.controls.minDistance = 40;
      this.controls.maxDistance = 1800;
    }

    // 5. Studio Lighting
    this.setupLighting();

    // 6. Environment Grids
    this.setupEnvironment();

    // 7. Kinematic Scene Graph Hierarchy
    this.setupSceneGraph();

    // 8. Apply Initial Camera Preset
    this.setCameraPreset('isometric');

    // 9. Resize Observer
    this.setupResizeObserver(canvas);

    // 10. Start 60fps Decoupled Render Loop
    this.startRenderLoop();
  }

  private setupLighting(): void {
    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(this.ambientLight);

    // Directional Key Light (casting soft shadows)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.keyLight.position.set(280, -320, 420);
    this.keyLight.target.position.set(110, 0, 60);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 50;
    this.keyLight.shadow.camera.far = 1200;
    this.keyLight.shadow.camera.left = -280;
    this.keyLight.shadow.camera.right = 280;
    this.keyLight.shadow.camera.top = 280;
    this.keyLight.shadow.camera.bottom = -280;
    this.keyLight.shadow.bias = -0.0005;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // Directional Fill Light
    this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    this.fillLight.position.set(-220, 240, 260);
    this.scene.add(this.fillLight);

    // Hemisphere Light (sky / ground bounce)
    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.4);
    this.scene.add(this.hemiLight);
  }

  private setupEnvironment(): void {
    // Workshop floor grid under printer chassis
    this.floorGrid = new THREE.GridHelper(900, 45, 0x334155, 0x1e293b);
    this.floorGrid.rotation.x = Math.PI / 2; // Orient horizontally on XY plane
    this.floorGrid.position.set(110, 110, -53); // Under chassis rubber feet
    this.scene.add(this.floorGrid);

    // Subtle origin axes helper at printer origin (0, 0, 0)
    this.axesHelper = new THREE.AxesHelper(35);
    this.axesHelper.position.set(0, 0, 0.1);
    this.scene.add(this.axesHelper);
  }

  private setupSceneGraph(): void {
    // 1. Chassis Frame (Fixed base)
    this.chassisMesh = new PrinterChassisMesh();
    this.scene.add(this.chassisMesh.group);

    // 2. Heated Bed Assembly (Translates along Y: [0, -Y_rel])
    this.heatedBedMesh = new HeatedBedMesh();
    this.chassisMesh.group.add(this.heatedBedMesh.group);

    // 3. Toolhead & Z-Gantry Assembly (Gantry translates Z, Carriage translates X)
    this.toolheadMesh = new ToolheadMesh();
    this.chassisMesh.group.add(this.toolheadMesh.group);

    // 4. Hybrid Toolpath Buffer Manager
    // CRITICAL: Parented directly to HeatedBedMesh.printedFilamentContainer
    this.toolpathBufferManager = new ToolpathBufferManager();
    const filamentContainer = this.heatedBedMesh.getFilamentContainer();
    filamentContainer.add(this.toolpathBufferManager.rootGroup);
  }

  private setupResizeObserver(canvas: HTMLCanvasElement): void {
    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.isDisposed || !this.renderer || entries.length === 0) return;
      const entry = entries[0];
      const width = entry.contentRect.width || canvas.clientWidth;
      const height = entry.contentRect.height || canvas.clientHeight;

      if (width > 0 && height > 0) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
      }
    });

    const targetElement = canvas.parentElement || canvas;
    this.resizeObserver.observe(targetElement);
  }

  private startRenderLoop(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      return;
    }

    const loop = (timestamp: number) => {
      if (this.isDisposed) return;

      this.onRenderFrame(timestamp);

      if (this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private onRenderFrame(_timestamp: number): void {
    // 1. Update OrbitControls damping
    if (this.controls) {
      this.controls.update();
    }

    // 2. Dynamic Nozzle Follow Camera Mode
    if (this.activeCameraPreset === 'nozzle_follow' && this.controls && this.currentKinematics) {
      const nozzleWorld = this.toolheadMesh.getNozzleWorldPosition();
      this.controls.target.lerp(nozzleWorld, 0.08);
      const desiredPos = new THREE.Vector3(
        nozzleWorld.x + 55,
        nozzleWorld.y - 65,
        nozzleWorld.z + 40
      );
      this.camera.position.lerp(desiredPos, 0.08);
    }

    // 3. Thermal runaway emergency visual alert pulse
    if (this.thermalRunawayAlertActive) {
      this.alertPulseTimer += 0.08;
      const pulse = Math.sin(this.alertPulseTimer) * 0.5 + 0.5;
      this.scene.background = new THREE.Color().setRGB(0.04 + 0.15 * pulse, 0.06, 0.12);
    }
  }

  // --- IPrinterViewportController Implementation ---

  /**
   * Update kinematic position of Heated Bed, Z Gantry, and Toolhead Carriage.
   */
  public updateKinematics(kinematics: IKinematicState): void {
    this.currentKinematics = kinematics;

    const x = kinematics.currentPosition.x;
    const y = kinematics.currentPosition.y;
    const z = kinematics.currentPosition.z;

    // 1. Update Heated Bed (Translates in Y: [0, -Y_rel])
    this.heatedBedMesh.updatePosition(y);

    // 2. Update Toolhead (Gantry translates Z, Carriage translates X)
    this.toolheadMesh.updateKinematics(x, z, kinematics.isExtruding, kinematics.fanSpeed);
  }

  /**
   * Append an extruded toolpath segment to the 3D buffer.
   */
  public appendExtrusionSegment(segment: ToolpathSegment): void {
    this.toolpathBufferManager.appendSegment(segment);
  }

  /**
   * Clear all deposited toolpaths.
   */
  public clearToolpaths(): void {
    this.toolpathBufferManager.clear();
  }

  /**
   * Filter visible toolpaths to a specific layer range [minLayer, maxLayer].
   */
  public setLayerFilter(minLayer: number, maxLayer: number): void {
    this.toolpathBufferManager.setLayerFilter(minLayer, maxLayer);
  }

  /**
   * Toggle between Fast Vector Mode ('lines') and Volumetric Bead Mode ('volumetric').
   */
  public setRenderMode(mode: RenderMode): void {
    this.toolpathBufferManager.setRenderMode(mode);
  }

  /**
   * Set viewport camera preset view.
   */
  public setCameraPreset(preset: CameraPreset): void {
    this.activeCameraPreset = preset;
    if (!this.controls) return;

    switch (preset) {
      case 'isometric':
        this.camera.position.set(340, -320, 290);
        this.controls.target.set(110, 0, 60);
        break;
      case 'top':
        this.camera.position.set(110, -5, 520);
        this.controls.target.set(110, 0, 0);
        break;
      case 'front':
        this.camera.position.set(110, -420, 110);
        this.controls.target.set(110, 0, 80);
        break;
      case 'nozzle_follow':
        if (this.currentKinematics) {
          const nozzle = this.toolheadMesh.getNozzleWorldPosition();
          this.camera.position.set(nozzle.x + 55, nozzle.y - 65, nozzle.z + 40);
          this.controls.target.copy(nozzle);
        }
        break;
    }

    this.controls.update();
  }

  /**
   * Trigger hardware failure visual effect.
   */
  public triggerFailureVisual(failureType: FailureVisualType, active: boolean): void {
    this.toolpathBufferManager.setFailureVisual(failureType, active);

    if (failureType === 'thermal_runaway') {
      this.thermalRunawayAlertActive = active;
      if (!active) {
        this.scene.background = new THREE.Color(0x0a0f1d);
      }
    }
  }

  /**
   * Update temperatures for thermal glow visualization.
   */
  public updateTemperatures(
    hotendTemp: number,
    bedTemp: number,
    hotendTarget: number = 0,
    bedTarget: number = 0
  ): void {
    this.toolheadMesh.updateTemperature(hotendTemp, hotendTarget);
    this.heatedBedMesh.updateTemperature(bedTemp, bedTarget);
  }

  /**
   * Dispose all Three.js scene objects, buffers, materials, textures, and event listeners.
   */
  public dispose(): void {
    this.isDisposed = true;

    if (this.animationFrameId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.animationFrameId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    if (this.toolpathBufferManager) {
      this.toolpathBufferManager.dispose();
    }

    if (this.chassisMesh) {
      this.chassisMesh.dispose();
    }

    if (this.heatedBedMesh) {
      this.heatedBedMesh.dispose();
    }

    if (this.toolheadMesh) {
      this.toolheadMesh.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
