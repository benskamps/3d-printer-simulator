import React from 'react';
import { Layers } from 'lucide-react';

export interface LayerScrubberProps {
  currentLayer: number;
  totalLayers: number;
  minLayer: number;
  maxLayer: number;
  onRangeChange: (min: number, max: number) => void;
  className?: string;
}

export const LayerScrubber: React.FC<LayerScrubberProps> = ({
  currentLayer,
  totalLayers,
  minLayer,
  maxLayer,
  onRangeChange,
  className = '',
}) => {
  const safeTotal = Math.max(1, totalLayers);

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    onRangeChange(minLayer, Math.max(minLayer, val));
  };

  const handleShowAll = () => {
    onRangeChange(0, safeTotal);
  };

  const handleShowCurrentOnly = () => {
    onRangeChange(currentLayer, currentLayer);
  };

  return (
    <div
      className={`bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg flex items-center gap-3 text-xs text-slate-100 select-none ${className}`}
      data-testid="layer-scrubber"
    >
      <div className="flex items-center gap-1.5 shrink-0 text-slate-300 font-medium">
        <Layers className="w-4 h-4 text-sky-400" />
        <span>Layer Filter:</span>
        <span className="font-mono text-sky-300" data-testid="scrubber-range-text">
          {minLayer} – {maxLayer} <span className="text-slate-500">/ {safeTotal}</span>
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={safeTotal}
        value={maxLayer}
        onChange={handleMaxChange}
        className="w-full accent-sky-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
        data-testid="scrubber-slider"
      />

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleShowAll}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          data-testid="btn-scrubber-all"
        >
          All
        </button>
        <button
          type="button"
          onClick={handleShowCurrentOnly}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          data-testid="btn-scrubber-current"
        >
          Layer {currentLayer}
        </button>
      </div>
    </div>
  );
};
