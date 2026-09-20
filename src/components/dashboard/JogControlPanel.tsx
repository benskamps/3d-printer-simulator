import React, { useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  Home,
  PowerOff,
  AlertTriangle,
  CheckCircle2,
  Navigation,
} from 'lucide-react';
import { Coordinates } from '../../core/telemetry/types';

export type StepDistance = 0.1 | 1.0 | 10.0 | 100.0;

export interface JogControlPanelProps {
  currentPosition: Coordinates;
  isHomed: { x: boolean; y: boolean; z: boolean };
  hotendActualTemp: number;
  steppersEnabled?: boolean;
  onJog: (axis: 'X' | 'Y' | 'Z', distance: number) => void;
  onJogXY?: (deltaX: number, deltaY: number) => void;
  onHome: (axes: { x?: boolean; y?: boolean; z?: boolean }) => void;
  onExtrude: (amountMm: number) => void;
  onRetract: (amountMm: number) => void;
  onDisableSteppers?: () => void;
  className?: string;
}

export const JogControlPanel: React.FC<JogControlPanelProps> = ({
  currentPosition,
  isHomed,
  hotendActualTemp,
  steppersEnabled = true,
  onJog,
  onJogXY,
  onHome,
  onExtrude,
  onRetract,
  onDisableSteppers,
  className = '',
}) => {
  const [step, setStep] = useState<StepDistance>(10.0);
  const stepDistances: StepDistance[] = [0.1, 1.0, 10.0, 100.0];

  const isColdExtrusionBlocked = hotendActualTemp < 170.0;

  const handleJogXY = (dx: number, dy: number) => {
    if (onJogXY) {
      onJogXY(dx, dy);
    } else {
      if (dx !== 0) onJog('X', dx);
      if (dy !== 0) onJog('Y', dy);
    }
  };

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4 text-slate-100 select-none ${className}`}
      data-testid="jog-control-panel"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-sm tracking-wide text-slate-200">Kinematics &amp; Motion Jog</h3>
        </div>
        {onDisableSteppers && (
          <button
            type="button"
            onClick={onDisableSteppers}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
              steppersEnabled
                ? 'bg-slate-800 hover:bg-rose-900/40 hover:text-rose-300 text-slate-400 border-slate-700/60'
                : 'bg-rose-950/40 text-rose-400 border-rose-800/60'
            }`}
            data-testid="btn-disable-steppers"
            title="Disable Stepper Motors (M84)"
          >
            <PowerOff className="w-3.5 h-3.5" />
            <span>{steppersEnabled ? 'Motors Off' : 'Motors Disabled'}</span>
          </button>
        )}
      </div>

      {/* Step Increment Selector */}
      <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg p-1.5">
        <span className="text-xs text-slate-400 font-medium px-2">Step Size:</span>
        <div className="flex items-center gap-1">
          {stepDistances.map((dist) => (
            <button
              key={dist}
              type="button"
              onClick={() => setStep(dist)}
              className={`px-3 py-1 rounded text-xs font-mono font-medium transition-all ${
                step === dist
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
              }`}
              data-testid={`step-${dist}`}
            >
              {dist} mm
            </button>
          ))}
        </div>
      </div>

      {/* Motion Controls Grid: XY Ring on Left, Z Column on Right */}
      <div className="grid grid-cols-12 gap-3 items-center">
        {/* XY 8-Way Directional Jog Ring (8 cols) */}
        <div className="col-span-8 flex flex-col items-center justify-center p-2 bg-slate-950/50 rounded-xl border border-slate-800/70">
          <div className="grid grid-cols-3 gap-1.5 w-full max-w-[200px]">
            {/* Row 1: NW, North (Y+), NE */}
            <button
              type="button"
              onClick={() => handleJogXY(-step, step)}
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex items-center justify-center border border-slate-700/50"
              data-testid="jog-nw"
              title={`North-West (-${step}X, +${step}Y)`}
            >
              <ArrowUpLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onJog('Y', step)}
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex flex-col items-center justify-center border border-slate-700/50"
              data-testid="jog-y-plus"
              title={`Y+ (+${step}mm)`}
            >
              <ArrowUp className="w-4 h-4" />
              <span className="text-[9px] font-mono text-indigo-300 mt-0.5">+Y</span>
            </button>
            <button
              type="button"
              onClick={() => handleJogXY(step, step)}
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex items-center justify-center border border-slate-700/50"
              data-testid="jog-ne"
              title={`North-East (+${step}X, +${step}Y)`}
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>

            {/* Row 2: West (X-), Home XY, East (X+) */}
            <button
              type="button"
              onClick={() => onJog('X', -step)}
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex flex-col items-center justify-center border border-slate-700/50"
              data-testid="jog-x-minus"
              title={`X- (-${step}mm)`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-[9px] font-mono text-indigo-300 mt-0.5">-X</span>
            </button>
            <button
              type="button"
              onClick={() => onHome({ x: true, y: true })}
              className="p-2.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-600 active:scale-95 text-indigo-300 hover:text-white transition-all flex flex-col items-center justify-center border border-indigo-700/60 shadow-inner"
              data-testid="btn-home-xy"
              title="Home XY (G28 X Y)"
            >
              <Home className="w-4 h-4" />
              <span className="text-[9px] font-mono font-bold mt-0.5">XY</span>
            </button>
            <button
              type="button"
              onClick={() => onJog('X', step)}
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex flex-col items-center justify-center border border-slate-700/50"
              data-testid="jog-x-plus"
              title={`X+ (+${step}mm)`}
            >
              <ArrowRight className="w-4 h-4" />
              <span className="text-[9px] font-mono text-indigo-300 mt-0.5">+X</span>
            </button>

            {/* Row 3: SW, South (Y-), SE */}
            <button
              type="button"
              onClick={() => handleJogXY(-step, -step)}
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex items-center justify-center border border-slate-700/50"
              data-testid="jog-sw"
              title={`South-West (-${step}X, -${step}Y)`}
            >
              <ArrowDownLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onJog('Y', -step)}
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex flex-col items-center justify-center border border-slate-700/50"
              data-testid="jog-y-minus"
              title={`Y- (-${step}mm)`}
            >
              <ArrowDown className="w-4 h-4" />
              <span className="text-[9px] font-mono text-indigo-300 mt-0.5">-Y</span>
            </button>
            <button
              type="button"
              onClick={() => handleJogXY(step, -step)}
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex items-center justify-center border border-slate-700/50"
              data-testid="jog-se"
              title={`South-East (+${step}X, -${step}Y)`}
            >
              <ArrowDownRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Z Axis Stepper Column (4 cols) */}
        <div className="col-span-4 flex flex-col items-center justify-center p-2 bg-slate-950/50 rounded-xl border border-slate-800/70 gap-1.5 h-full">
          <button
            type="button"
            onClick={() => onJog('Z', step)}
            className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex flex-col items-center justify-center border border-slate-700/50"
            data-testid="jog-z-plus"
            title={`Z Up (+${step}mm)`}
          >
            <ArrowUp className="w-4 h-4" />
            <span className="text-[9px] font-mono text-indigo-300 mt-0.5">+Z ({step})</span>
          </button>
          <button
            type="button"
            onClick={() => onHome({ z: true })}
            className="w-full py-2 rounded-lg bg-indigo-950/70 hover:bg-indigo-600 active:scale-95 text-indigo-300 hover:text-white transition-all flex flex-col items-center justify-center border border-indigo-700/60 shadow-inner"
            data-testid="btn-home-z"
            title="Home Z (G28 Z)"
          >
            <Home className="w-4 h-4" />
            <span className="text-[9px] font-mono font-bold mt-0.5">Z</span>
          </button>
          <button
            type="button"
            onClick={() => onJog('Z', -step)}
            className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-indigo-600/70 active:scale-95 text-slate-300 hover:text-white transition-all flex flex-col items-center justify-center border border-slate-700/50"
            data-testid="jog-z-minus"
            title={`Z Down (-${step}mm)`}
          >
            <ArrowDown className="w-4 h-4" />
            <span className="text-[9px] font-mono text-indigo-300 mt-0.5">-Z ({step})</span>
          </button>
        </div>
      </div>

      {/* Axis Homing Toolbar & Coordinates Feedback */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => onHome({ x: true, y: true, z: true })}
            className="px-2 py-1.5 rounded bg-indigo-700/80 hover:bg-indigo-600 text-white font-medium text-xs flex items-center justify-center gap-1 transition-colors"
            data-testid="btn-home-all"
            title="Home All Axes (G28)"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Home All</span>
          </button>
          <button
            type="button"
            onClick={() => onHome({ x: true })}
            className={`px-2 py-1.5 rounded text-xs font-mono font-medium transition-colors border ${
              isHomed.x
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/50'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            data-testid="btn-home-x"
          >
            Home X
          </button>
          <button
            type="button"
            onClick={() => onHome({ y: true })}
            className={`px-2 py-1.5 rounded text-xs font-mono font-medium transition-colors border ${
              isHomed.y
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/50'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            data-testid="btn-home-y"
          >
            Home Y
          </button>
          <button
            type="button"
            onClick={() => onHome({ z: true })}
            className={`px-2 py-1.5 rounded text-xs font-mono font-medium transition-colors border ${
              isHomed.z
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/50'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            data-testid="btn-home-z-toolbar"
          >
            Home Z
          </button>
        </div>

        {/* Live Coordinate Pill Readout */}
        <div className="grid grid-cols-4 gap-1.5 text-xs font-mono text-center">
          <div className="bg-slate-950/80 border border-slate-800 rounded p-1">
            <span className="text-slate-500">X: </span>
            <span className="text-slate-200 font-bold" data-testid="jog-pos-x">
              {currentPosition.x.toFixed(1)}
            </span>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded p-1">
            <span className="text-slate-500">Y: </span>
            <span className="text-slate-200 font-bold" data-testid="jog-pos-y">
              {currentPosition.y.toFixed(1)}
            </span>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded p-1">
            <span className="text-slate-500">Z: </span>
            <span className="text-slate-200 font-bold" data-testid="jog-pos-z">
              {currentPosition.z.toFixed(2)}
            </span>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded p-1">
            <span className="text-slate-500">E: </span>
            <span className="text-slate-200 font-bold" data-testid="jog-pos-e">
              {currentPosition.e.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Extrude / Retract Manual Filament Controls with Cold Extrusion Protection */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">Extruder Stepper (E Axis)</span>
          {isColdExtrusionBlocked ? (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/80 text-[11px] font-medium"
              data-testid="cold-extrusion-warning"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Cold Extrusion Blocked (&lt; 170°C)</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 text-[11px] font-medium"
              data-testid="extruder-ready-badge"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Extruder Ready (≥ 170°C)</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {/* Retract 10mm */}
          <button
            type="button"
            onClick={() => onRetract(10)}
            className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium transition-colors border border-slate-700"
            data-testid="btn-retract-10"
            title="Retract 10mm filament"
          >
            Retract 10
          </button>
          {/* Retract 5mm */}
          <button
            type="button"
            onClick={() => onRetract(5)}
            className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium transition-colors border border-slate-700"
            data-testid="btn-retract-5"
            title="Retract 5mm filament"
          >
            Retract 5
          </button>
          {/* Extrude 5mm */}
          <button
            type="button"
            onClick={() => onExtrude(5)}
            disabled={isColdExtrusionBlocked}
            className={`px-2 py-1.5 rounded text-xs font-mono font-medium transition-all border ${
              isColdExtrusionBlocked
                ? 'bg-slate-900/60 text-slate-600 border-slate-800 cursor-not-allowed opacity-60'
                : 'bg-indigo-600/80 hover:bg-indigo-600 text-white border-indigo-500 shadow-sm'
            }`}
            data-testid="btn-extrude-5"
            title={
              isColdExtrusionBlocked
                ? 'Extrusion blocked: Hotend must reach 170°C'
                : 'Extrude 5mm filament'
            }
          >
            Extrude 5
          </button>
          {/* Extrude 10mm */}
          <button
            type="button"
            onClick={() => onExtrude(10)}
            disabled={isColdExtrusionBlocked}
            className={`px-2 py-1.5 rounded text-xs font-mono font-medium transition-all border ${
              isColdExtrusionBlocked
                ? 'bg-slate-900/60 text-slate-600 border-slate-800 cursor-not-allowed opacity-60'
                : 'bg-indigo-600/80 hover:bg-indigo-600 text-white border-indigo-500 shadow-sm'
            }`}
            data-testid="btn-extrude-10"
            title={
              isColdExtrusionBlocked
                ? 'Extrusion blocked: Hotend must reach 170°C'
                : 'Extrude 10mm filament'
            }
          >
            Extrude 10
          </button>
        </div>
      </div>
    </div>
  );
};
