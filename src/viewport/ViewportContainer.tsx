import React, { useEffect, useRef, useState } from 'react';
import { Camera, Layers, Box, Eye, Flame, Compass } from 'lucide-react';
import {
  CameraPreset,
  RenderMode,
  ViewportContainerProps,
} from './types';
import { ThreePrinterViewport } from './ThreePrinterViewport';

/**
 * React Wrapper Container for the Three.js 3D Printer Viewport.
 * Features canvas embedding, responsive resizing, and overlay controls for:
 * - Camera Presets (Isometric, Top-Down, Front, Nozzle Follow)
 * - Render Mode Toggle (Fast Vector Lines vs Volumetric Solid Beads)
 * - Instant Layer Slicing Range Slider
 * - Live kinematic coordinate and temperature overlay
 */
export const ViewportContainer: React.FC<ViewportContainerProps> = ({
  kinematicState,
  activeSegment,
  onViewportReady,
  className = '',
  initialRenderMode = 'lines',
  initialCameraPreset = 'isometric',
  hotendTemp = 21,
  bedTemp = 21,
  hotendTarget = 0,
  bedTarget = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<ThreePrinterViewport | null>(null);

  const [activePreset, setActivePreset] = useState<CameraPreset>(initialCameraPreset);
  const [renderMode, setRenderMode] = useState<RenderMode>(initialRenderMode);

  const totalLayers = kinematicState?.totalLayers && kinematicState.totalLayers > 0
    ? kinematicState.totalLayers
    : 1;

  const [minLayer, setMinLayer] = useState<number>(0);
  const [maxLayer, setMaxLayer] = useState<number>(totalLayers);

  // Initialize Three.js Viewport engine on mount
  useEffect(() => {
    if (!canvasRef.current) return;

    const viewport = new ThreePrinterViewport();
    viewport.init(canvasRef.current);
    viewport.setRenderMode(initialRenderMode);
    viewport.setCameraPreset(initialCameraPreset);

    viewportRef.current = viewport;

    if (onViewportReady) {
      onViewportReady(viewport);
    }

    return () => {
      viewport.dispose();
      viewportRef.current = null;
    };
  }, []);

  // Update kinematics when prop changes
  useEffect(() => {
    if (viewportRef.current && kinematicState) {
      viewportRef.current.updateKinematics(kinematicState);
    }
  }, [kinematicState]);

  // Update temperatures for thermal visual feedback
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.updateTemperatures(hotendTemp, bedTemp, hotendTarget, bedTarget);
    }
  }, [hotendTemp, bedTemp, hotendTarget, bedTarget]);

  // Append new extrusion segment if provided
  useEffect(() => {
    if (viewportRef.current && activeSegment) {
      viewportRef.current.appendExtrusionSegment(activeSegment);
    }
  }, [activeSegment]);

  // Handle camera preset changes
  const handlePresetChange = (preset: CameraPreset) => {
    setActivePreset(preset);
    if (viewportRef.current) {
      viewportRef.current.setCameraPreset(preset);
    }
  };

  // Handle render mode toggle
  const handleModeToggle = (mode: RenderMode) => {
    setRenderMode(mode);
    if (viewportRef.current) {
      viewportRef.current.setRenderMode(mode);
    }
  };

  // Handle layer scrubbing
  const handleMaxLayerChange = (newMax: number) => {
    setMaxLayer(newMax);
    if (viewportRef.current) {
      viewportRef.current.setLayerFilter(minLayer, newMax);
    }
  };

  const handleShowAllLayers = () => {
    setMinLayer(0);
    setMaxLayer(totalLayers);
    if (viewportRef.current) {
      viewportRef.current.setLayerFilter(0, totalLayers);
    }
  };

  const handleShowCurrentLayerOnly = () => {
    const cur = kinematicState?.activeLayer ?? 0;
    setMinLayer(cur);
    setMaxLayer(cur);
    if (viewportRef.current) {
      viewportRef.current.setLayerFilter(cur, cur);
    }
  };

  const posX = kinematicState?.currentPosition.x.toFixed(1) ?? '0.0';
  const posY = kinematicState?.currentPosition.y.toFixed(1) ?? '0.0';
  const posZ = kinematicState?.currentPosition.z.toFixed(2) ?? '0.00';
  const activeLayer = kinematicState?.activeLayer ?? 0;

  return (
    <div
      className={`relative w-full h-full min-h-[420px] bg-slate-950 overflow-hidden select-none ${className}`}
      data-testid="viewport-container"
    >
      {/* Decoupled WebGL 3D Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block outline-none cursor-grab active:cursor-grabbing"
        data-testid="viewport-canvas"
      />

      {/* Top-Left: Camera Presets & Navigation Overlay */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 p-1 bg-slate-900/80 backdrop-blur-md rounded-lg border border-slate-700/60 shadow-lg text-xs">
        <div className="flex items-center gap-1 px-2 py-1 text-slate-400 font-medium">
          <Camera className="w-3.5 h-3.5 text-sky-400" />
          <span>Camera</span>
        </div>
        <button
          type="button"
          onClick={() => handlePresetChange('isometric')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            activePreset === 'isometric'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
          data-testid="preset-iso"
        >
          ISO
        </button>
        <button
          type="button"
          onClick={() => handlePresetChange('top')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            activePreset === 'top'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
          data-testid="preset-top"
        >
          Top
        </button>
        <button
          type="button"
          onClick={() => handlePresetChange('front')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            activePreset === 'front'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
          data-testid="preset-front"
        >
          Front
        </button>
        <button
          type="button"
          onClick={() => handlePresetChange('nozzle_follow')}
          className={`px-2 py-1 rounded font-medium transition-colors ${
            activePreset === 'nozzle_follow'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
          data-testid="preset-follow"
        >
          Follow
        </button>
      </div>

      {/* Top-Right: Render Mode & Coordinate Telemetry Overlay */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2 text-xs">
        {/* Render Mode Toggle */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 backdrop-blur-md rounded-lg border border-slate-700/60 shadow-lg">
          <button
            type="button"
            onClick={() => handleModeToggle('lines')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors ${
              renderMode === 'lines'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
            data-testid="mode-lines"
            title="Fast Vector LineSegments (Single Draw Call)"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Fast Line</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle('volumetric')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors ${
              renderMode === 'volumetric'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:bg-slate-800'
            }`}
            data-testid="mode-volumetric"
            title="Photorealistic Volumetric Beads (InstancedMesh)"
          >
            <Box className="w-3.5 h-3.5" />
            <span>Solid Bead</span>
          </button>
        </div>

        {/* Live Coordinate Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-lg border border-slate-700/60 shadow-lg font-mono text-slate-300">
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          <span>X: <strong className="text-white">{posX}</strong></span>
          <span>Y: <strong className="text-white">{posY}</strong></span>
          <span>Z: <strong className="text-white">{posZ}</strong></span>
        </div>

        {/* Live Thermal Indicator Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-lg border border-slate-700/60 shadow-lg text-slate-300 font-mono">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>
            E: <strong className={hotendTemp >= 170 ? 'text-amber-400' : 'text-slate-200'}>
              {hotendTemp.toFixed(0)}°C
            </strong>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            B: <strong className={bedTemp >= 50 ? 'text-orange-400' : 'text-slate-200'}>
              {bedTemp.toFixed(0)}°C
            </strong>
          </span>
        </div>
      </div>

      {/* Bottom: Layer Slicing & Scrubbing Slider Overlay */}
      <div className="absolute bottom-3 left-3 right-3 z-10 p-2.5 bg-slate-900/85 backdrop-blur-md rounded-lg border border-slate-700/60 shadow-lg flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-slate-300 font-medium shrink-0">
          <Layers className="w-4 h-4 text-sky-400" />
          <span>Layer Slice:</span>
          <span className="font-mono text-sky-300">
            {minLayer} – {maxLayer} <span className="text-slate-500">/ {totalLayers}</span>
          </span>
        </div>

        {/* Range Slider for Scrubbing Layers */}
        <input
          type="range"
          min={0}
          max={totalLayers}
          value={maxLayer}
          onChange={(e) => handleMaxLayerChange(Number(e.target.value))}
          className="w-full accent-sky-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg appearance-none"
          data-testid="layer-slider"
        />

        {/* Quick Filter Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleShowAllLayers}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            data-testid="btn-all-layers"
          >
            All
          </button>
          <button
            type="button"
            onClick={handleShowCurrentLayerOnly}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            data-testid="btn-current-layer"
          >
            Layer {activeLayer}
          </button>
        </div>
      </div>
    </div>
  );
};
