/**
 * Viewport and 3D Kinematics Type Definitions
 * Strictly adhering to PROJECT.md and DISPATCH.md interface contracts.
 */

import {
  AxisCoordinates,
  IKinematicState,
  ToolpathSegment,
  ToolpathType,
  PrinterDimensions,
  DEFAULT_PRINTER_DIMENSIONS,
} from '../core/kinematics/types';

export {
  type AxisCoordinates,
  type IKinematicState,
  type ToolpathSegment,
  ToolpathType,
  type PrinterDimensions,
  DEFAULT_PRINTER_DIMENSIONS,
};

export type CameraPreset = 'isometric' | 'top' | 'front' | 'nozzle_follow';

export type RenderMode = 'lines' | 'volumetric';

export type FailureVisualType = 'clog' | 'spaghetti' | 'layer_shift' | 'thermal_runaway';

export interface LayerRange {
  firstSegmentIndex: number;
  lastSegmentIndex: number;
}

export interface IPrinterViewportController {
  init(canvas: HTMLCanvasElement): void;
  dispose(): void;
  updateKinematics(kinematics: IKinematicState): void;
  appendExtrusionSegment(segment: ToolpathSegment): void;
  clearToolpaths(): void;
  setLayerFilter(minLayer: number, maxLayer: number): void;
  setRenderMode(mode: RenderMode): void;
  setCameraPreset(preset: CameraPreset): void;
  triggerFailureVisual(failureType: FailureVisualType, active: boolean): void;
}

export interface ViewportContainerProps {
  kinematicState?: IKinematicState;
  activeSegment?: ToolpathSegment | null;
  onViewportReady?: (controller: IPrinterViewportController) => void;
  className?: string;
  initialRenderMode?: RenderMode;
  initialCameraPreset?: CameraPreset;
  hotendTemp?: number;
  bedTemp?: number;
  hotendTarget?: number;
  bedTarget?: number;
}
