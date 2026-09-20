import React from 'react';
import {
  Play,
  Pause,
  Square,
  StepForward,
  Clock,
  Layers,
  Gauge,
  Activity,
  Package,
} from 'lucide-react';
import { PrinterStatus, PrintJobMetrics } from '../../core/telemetry/types';

export interface PrintStatusPanelProps {
  status: PrinterStatus;
  job: PrintJobMetrics;
  speedMultiplier: number;
  onStartPrint: () => void;
  onPausePrint: () => void;
  onResumePrint: () => void;
  onAbortPrint: () => void;
  onStepPrint?: () => void;
  onSetSpeedMultiplier: (multiplier: number) => void;
  className?: string;
}

export const PrintStatusPanel: React.FC<PrintStatusPanelProps> = ({
  status,
  job,
  speedMultiplier,
  onStartPrint,
  onPausePrint,
  onResumePrint,
  onAbortPrint,
  onStepPrint,
  onSetSpeedMultiplier,
  className = '',
}) => {
  const formatTime = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const speedMultipliers = [1, 5, 20, 100];

  const isPrinting = status === 'PRINTING';
  const isPaused = status === 'PAUSED';
  const isHalted = status === 'HALTED' || status === 'ERROR';

  // Calculate filament consumption
  const filamentMeters = (job.filamentUsedMm / 1000).toFixed(2);
  // Standard 1.75mm PLA: cross-section area ~ 2.405 mm2, density ~ 1.24 g/cm3 => ~0.00298 g/mm
  const filamentGrams =
    job.filamentUsedGrams > 0
      ? job.filamentUsedGrams.toFixed(1)
      : (job.filamentUsedMm * 0.003).toFixed(1);

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4 text-slate-100 select-none ${className}`}
      data-testid="print-status-panel"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h3 className="font-semibold text-sm tracking-wide text-slate-200">Print Job Telemetry</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 truncate max-w-[140px]" title={job.filename || 'No file'}>
            {job.filename || 'No Job Active'}
          </span>
        </div>
      </div>

      {/* Progress Bar & Percentage */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Job Completion:</span>
          <span className="font-mono text-emerald-400 font-bold text-sm" data-testid="progress-percentage">
            {job.progressPercent}%
          </span>
        </div>
        <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 rounded-full transition-all duration-300 shadow-sm"
            style={{ width: `${Math.max(0, Math.min(100, job.progressPercent))}%` }}
            data-testid="progress-bar-fill"
          />
        </div>
      </div>

      {/* Metrics 4-Grid: Layer, Elapsed, ETA, Filament */}
      <div className="grid grid-cols-2 gap-2.5 text-xs">
        {/* Layer Count */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-slate-400">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Layer</span>
          </div>
          <div className="font-mono text-base font-bold text-slate-100" data-testid="metric-layer">
            {job.currentLayer} <span className="text-xs text-slate-500 font-normal">/ {job.totalLayers}</span>
          </div>
        </div>

        {/* Time Elapsed */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Elapsed</span>
          </div>
          <div className="font-mono text-base font-bold text-slate-100" data-testid="metric-elapsed">
            {formatTime(job.elapsedSeconds)}
          </div>
        </div>

        {/* Remaining Time (ETA) */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>ETA Remaining</span>
          </div>
          <div className="font-mono text-base font-bold text-slate-100" data-testid="metric-eta">
            {formatTime(job.estimatedRemainingSeconds)}
          </div>
        </div>

        {/* Filament Consumed */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-slate-400">
            <Package className="w-3.5 h-3.5 text-rose-400" />
            <span>Filament</span>
          </div>
          <div className="font-mono text-base font-bold text-slate-100" data-testid="metric-filament">
            {`${filamentMeters}m `}<span className="text-xs text-slate-500 font-normal">{`(${filamentGrams}g)`}</span>
          </div>
        </div>
      </div>

      {/* Speed Multiplier Selector */}
      <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg p-1.5">
        <div className="flex items-center gap-1.5 px-2 text-xs text-slate-400">
          <Gauge className="w-4 h-4 text-sky-400" />
          <span>Playback Speed:</span>
        </div>
        <div className="flex items-center gap-1">
          {speedMultipliers.map((mult) => (
            <button
              key={mult}
              type="button"
              onClick={() => onSetSpeedMultiplier(mult)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${
                speedMultiplier === mult
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
              }`}
              data-testid={`speed-${mult}x`}
            >
              {mult}x
            </button>
          ))}
        </div>
      </div>

      {/* Transport Controls: Start / Pause / Resume / Step / Abort */}
      <div className="grid grid-cols-4 gap-2 pt-1">
        {/* Play / Pause / Resume Button (Span 2) */}
        {!isPrinting && !isPaused && (
          <button
            type="button"
            onClick={onStartPrint}
            disabled={isHalted}
            className={`col-span-2 py-2 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 transition-all ${
              isHalted
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
            }`}
            data-testid="btn-start-print"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Print</span>
          </button>
        )}

        {isPrinting && (
          <button
            type="button"
            onClick={onPausePrint}
            className="col-span-2 py-2 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 transition-all"
            data-testid="btn-pause-print"
          >
            <Pause className="w-4 h-4 fill-current" />
            <span>Pause Print</span>
          </button>
        )}

        {isPaused && (
          <button
            type="button"
            onClick={onResumePrint}
            className="col-span-2 py-2 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all"
            data-testid="btn-resume-print"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Resume Print</span>
          </button>
        )}

        {/* Single-Step Forward Button */}
        <button
          type="button"
          onClick={onStepPrint}
          disabled={isPrinting || isHalted}
          className={`py-2 rounded-lg font-medium text-xs flex items-center justify-center gap-1 transition-all border ${
            isPrinting || isHalted
              ? 'bg-slate-800/40 text-slate-600 border-slate-800 cursor-not-allowed'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
          data-testid="btn-step-print"
          title="Step Forward 1 Command Block"
        >
          <StepForward className="w-4 h-4" />
          <span>Step</span>
        </button>

        {/* Abort Print Button */}
        <button
          type="button"
          onClick={onAbortPrint}
          disabled={!isPrinting && !isPaused}
          className={`py-2 rounded-lg font-medium text-xs flex items-center justify-center gap-1 transition-all border ${
            !isPrinting && !isPaused
              ? 'bg-slate-800/40 text-slate-600 border-slate-800 cursor-not-allowed'
              : 'bg-rose-900/60 hover:bg-rose-800 text-rose-200 border-rose-700 shadow-md shadow-rose-900/20'
          }`}
          data-testid="btn-abort-print"
          title="Abort Current Job"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>Abort</span>
        </button>
      </div>
    </div>
  );
};
