import React from 'react';
import {
  AlertOctagon,
  Flame,
  Zap,
  Scissors,
  MoveRight,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { FailureConfig, NozzleClogMode } from '../../core/failures/types';

export interface FailureControlsProps {
  failures: FailureConfig;
  onSetNozzleClog: (mode: NozzleClogMode) => void;
  onSetSpaghettiMode: (active: boolean) => void;
  onTriggerLayerShift: (offsetX: number, offsetY: number) => void;
  onSetFilamentRunout: (active: boolean) => void;
  onSimulateThermalRunaway: (heater?: 'hotend' | 'bed') => void;
  onResetFailures: () => void;
  className?: string;
}

export const FailureControls: React.FC<FailureControlsProps> = ({
  failures,
  onSetNozzleClog,
  onSetSpaghettiMode,
  onTriggerLayerShift,
  onSetFilamentRunout,
  onSimulateThermalRunaway,
  onResetFailures,
  className = '',
}) => {
  const isAnyFailureActive =
    failures.nozzleClog !== 'NONE' ||
    failures.spaghettiMode ||
    failures.layerShift.x !== 0 ||
    failures.layerShift.y !== 0 ||
    failures.filamentRunout ||
    failures.thermalRunawaySimulated;

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4 text-slate-100 select-none ${className}`}
      data-testid="failure-controls"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-sm tracking-wide text-slate-200">
            Hardware Failure Injection
          </h3>
        </div>
        <button
          type="button"
          onClick={onResetFailures}
          disabled={!isAnyFailureActive}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors border ${
            isAnyFailureActive
              ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border-rose-800'
              : 'bg-slate-800/40 text-slate-600 border-slate-800 cursor-not-allowed'
          }`}
          data-testid="btn-reset-failures"
          title="Reset all failure states to nominal operation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset All</span>
        </button>
      </div>

      {/* 1. Nozzle Clog Simulation */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-300 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Nozzle Clog Mode</span>
          </span>
          <span
            className={`font-mono text-[11px] px-2 py-0.5 rounded ${
              failures.nozzleClog === 'FULL'
                ? 'bg-rose-950/70 text-rose-300 border border-rose-800'
                : failures.nozzleClog === 'PARTIAL'
                ? 'bg-amber-950/70 text-amber-300 border border-amber-800'
                : 'bg-slate-800 text-slate-400'
            }`}
            data-testid="badge-nozzle-clog"
          >
            {failures.nozzleClog}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onSetNozzleClog('NONE')}
            className={`py-1.5 rounded text-xs font-medium transition-all border ${
              failures.nozzleClog === 'NONE'
                ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
            data-testid="btn-clog-none"
          >
            Normal (0%)
          </button>
          <button
            type="button"
            onClick={() => onSetNozzleClog('PARTIAL')}
            className={`py-1.5 rounded text-xs font-medium transition-all border ${
              failures.nozzleClog === 'PARTIAL'
                ? 'bg-amber-600/30 text-amber-300 border-amber-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
            data-testid="btn-clog-partial"
            title="Throttles extrusion to 25% nominal volume"
          >
            Partial (25%)
          </button>
          <button
            type="button"
            onClick={() => onSetNozzleClog('FULL')}
            className={`py-1.5 rounded text-xs font-medium transition-all border ${
              failures.nozzleClog === 'FULL'
                ? 'bg-rose-600/30 text-rose-300 border-rose-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
            data-testid="btn-clog-full"
            title="Halts extrusion deposit completely (air printing)"
          >
            Full Clog
          </button>
        </div>
      </div>

      {/* 2. Bed Adhesion & Spaghetti Mode */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-medium text-xs text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Bed Adhesion / Spaghetti Mode</span>
          </span>
          <span className="text-[11px] text-slate-500 mt-0.5">
            Detaches model and extrudes chaotic looping noodles
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSetSpaghettiMode(!failures.spaghettiMode)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-all border ${
            failures.spaghettiMode
              ? 'bg-amber-600/40 text-amber-200 border-amber-500 shadow-md shadow-amber-900/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          }`}
          data-testid="btn-toggle-spaghetti"
        >
          {failures.spaghettiMode ? 'Active (Spaghetti)' : 'Normal'}
        </button>
      </div>

      {/* 3. Layer Shift Injection */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-300 flex items-center gap-1.5">
            <MoveRight className="w-4 h-4 text-sky-400" />
            <span>Open-Loop Layer Shift</span>
          </span>
          <span
            className="font-mono text-[11px] text-sky-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800"
            data-testid="text-layer-shift-offset"
          >
            {`Offset: X ${failures.layerShift.x >= 0 ? `+${failures.layerShift.x}` : failures.layerShift.x}mm, Y ${failures.layerShift.y >= 0 ? `+${failures.layerShift.y}` : failures.layerShift.y}mm`}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onTriggerLayerShift(10, 0)}
            className="py-1.5 rounded text-xs font-mono font-medium bg-slate-800 hover:bg-sky-600/30 hover:text-sky-300 hover:border-sky-500 text-slate-300 border border-slate-700 transition-all"
            data-testid="btn-shift-x"
            title="Inject +10mm step loss on X axis"
          >
            Shift X +10mm
          </button>
          <button
            type="button"
            onClick={() => onTriggerLayerShift(0, 10)}
            className="py-1.5 rounded text-xs font-mono font-medium bg-slate-800 hover:bg-sky-600/30 hover:text-sky-300 hover:border-sky-500 text-slate-300 border border-slate-700 transition-all"
            data-testid="btn-shift-y"
            title="Inject +10mm step loss on Y axis"
          >
            Shift Y +10mm
          </button>
          <button
            type="button"
            onClick={() => onTriggerLayerShift(-failures.layerShift.x, -failures.layerShift.y)}
            disabled={failures.layerShift.x === 0 && failures.layerShift.y === 0}
            className={`py-1.5 rounded text-xs font-medium transition-all border ${
              failures.layerShift.x !== 0 || failures.layerShift.y !== 0
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                : 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed'
            }`}
            data-testid="btn-reset-shift"
          >
            Reset Shift
          </button>
        </div>
      </div>

      {/* 4. Filament Runout Sensor Trip */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-medium text-xs text-slate-300 flex items-center gap-1.5">
            <Scissors className="w-4 h-4 text-rose-400" />
            <span>Filament Runout Sensor</span>
          </span>
          <span className="text-[11px] text-slate-500 mt-0.5">
            Triggers M600 pause macro and parks toolhead at (10, 10)
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSetFilamentRunout(!failures.filamentRunout)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-all border ${
            failures.filamentRunout
              ? 'bg-rose-600/40 text-rose-200 border-rose-500 shadow-md shadow-rose-900/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          }`}
          data-testid="btn-toggle-runout"
        >
          {failures.filamentRunout ? 'Empty (Trip)' : 'Filament Loaded'}
        </button>
      </div>

      {/* 5. Simulate Thermal Runaway Open-Loop */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-medium text-xs text-rose-300 flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-rose-500" />
            <span>Thermal Runaway Simulation</span>
          </span>
          <span className="text-[11px] text-slate-500 mt-0.5">
            Cuts heater response to trigger firmware safety watchdog
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSimulateThermalRunaway('hotend')}
          className="px-3 py-1.5 rounded text-xs font-medium bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-800 transition-all shadow-md shadow-rose-950/40"
          data-testid="btn-simulate-thermal-runaway"
        >
          Simulate Fault
        </button>
      </div>
    </div>
  );
};
