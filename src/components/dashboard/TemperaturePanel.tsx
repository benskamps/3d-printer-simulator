import React, { useState } from 'react';
import { Flame, Fan, Thermometer } from 'lucide-react';
import { HeaterTelemetry, ThermalHistoryPoint } from '../../core/thermal/types';

export interface TemperaturePanelProps {
  hotend: HeaterTelemetry;
  bed: HeaterTelemetry;
  thermalHistory: ThermalHistoryPoint[];
  fanSpeed: number; // 0.0 to 1.0
  onSetHotendTarget: (targetTemp: number) => void;
  onSetBedTarget: (targetTemp: number) => void;
  onSetFanSpeed: (fanDutyCycle: number) => void;
  className?: string;
}

export const TemperaturePanel: React.FC<TemperaturePanelProps> = ({
  hotend,
  bed,
  thermalHistory,
  fanSpeed,
  onSetHotendTarget,
  onSetBedTarget,
  onSetFanSpeed,
  className = '',
}) => {
  const [customHotendTarget, setCustomHotendTarget] = useState<string>(
    hotend.target > 0 ? hotend.target.toString() : '200'
  );
  const [customBedTarget, setCustomBedTarget] = useState<string>(
    bed.target > 0 ? bed.target.toString() : '60'
  );

  // SVG Chart Dimensions
  const svgWidth = 460;
  const svgHeight = 160;
  const padding = { top: 15, right: 15, bottom: 25, left: 35 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;
  const maxTempScale = 280;

  // Generate SVG path for a history metric
  const generatePath = (
    data: ThermalHistoryPoint[],
    key: 'hotendActual' | 'hotendTarget' | 'bedActual' | 'bedTarget'
  ): string => {
    if (data.length === 0) return '';
    const points = data.map((d, index) => {
      const x = padding.left + (index / Math.max(1, data.length - 1)) * graphWidth;
      const val = Math.max(0, Math.min(maxTempScale, d[key]));
      const y = padding.top + graphHeight - (val / maxTempScale) * graphHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  };

  const hotendActualPath = generatePath(thermalHistory, 'hotendActual');
  const hotendTargetPath = generatePath(thermalHistory, 'hotendTarget');
  const bedActualPath = generatePath(thermalHistory, 'bedActual');
  const bedTargetPath = generatePath(thermalHistory, 'bedTarget');

  // One-click presets
  const presets = [
    { label: 'Off', hotend: 0, bed: 0 },
    { label: 'PLA', hotend: 200, bed: 60 },
    { label: 'PETG', hotend: 240, bed: 80 },
    { label: 'ABS', hotend: 250, bed: 100 },
  ];

  const handleApplyHotend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = parseFloat(customHotendTarget);
    if (!isNaN(val) && val >= 0 && val <= 300) {
      onSetHotendTarget(val);
    }
  };

  const handleApplyBed = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = parseFloat(customBedTarget);
    if (!isNaN(val) && val >= 0 && val <= 130) {
      onSetBedTarget(val);
    }
  };

  const handlePresetClick = (hotendT: number, bedT: number) => {
    setCustomHotendTarget(hotendT.toString());
    setCustomBedTarget(bedT.toString());
    onSetHotendTarget(hotendT);
    onSetBedTarget(bedT);
  };

  const fanPercentage = Math.round(fanSpeed * 100);

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4 text-slate-100 select-none ${className}`}
      data-testid="temperature-panel"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Thermometer className="w-5 h-5 text-rose-500" />
          <h3 className="font-semibold text-sm tracking-wide text-slate-200">Thermal Telemetry</h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span className="text-slate-400">Hotend</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
            <span className="text-slate-400">Bed</span>
          </div>
        </div>
      </div>

      {/* SVG Dual-Line Temperature History Chart */}
      <div className="relative w-full bg-slate-950/80 rounded-lg border border-slate-800/80 p-2 overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-36 overflow-visible"
          data-testid="thermal-chart-svg"
        >
          {/* Background Grid Lines & Y-Axis Labels */}
          {[0, 50, 100, 150, 200, 250].map((t) => {
            const y = padding.top + graphHeight - (t / maxTempScale) * graphHeight;
            return (
              <g key={`grid-${t}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke="#334155"
                  strokeWidth="0.75"
                  strokeDasharray="2 4"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3.5}
                  fill="#64748b"
                  fontSize="9"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {t}°
                </text>
              </g>
            );
          })}

          {/* Time axis label */}
          <text
            x={padding.left}
            y={svgHeight - 6}
            fill="#64748b"
            fontSize="9"
            fontFamily="monospace"
          >
            -60s
          </text>
          <text
            x={svgWidth - padding.right}
            y={svgHeight - 6}
            fill="#64748b"
            fontSize="9"
            textAnchor="end"
            fontFamily="monospace"
          >
            Now
          </text>

          {/* Bed Target line (dashed sky) */}
          {bedTargetPath && (
            <path
              d={bedTargetPath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity={0.7}
              data-testid="chart-bed-target"
            />
          )}

          {/* Bed Actual line (solid sky) */}
          {bedActualPath && (
            <path
              d={bedActualPath}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-testid="chart-bed-actual"
            />
          )}

          {/* Hotend Target line (dashed rose) */}
          {hotendTargetPath && (
            <path
              d={hotendTargetPath}
              fill="none"
              stroke="#fb7185"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity={0.7}
              data-testid="chart-hotend-target"
            />
          )}

          {/* Hotend Actual line (solid rose) */}
          {hotendActualPath && (
            <path
              d={hotendActualPath}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-testid="chart-hotend-actual"
            />
          )}
        </svg>
      </div>

      {/* Numerical Readouts and Target Setters */}
      <div className="grid grid-cols-2 gap-3">
        {/* Hotend Card */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-400 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" /> Hotend
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                hotend.isHeating
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse'
                  : 'text-slate-500'
              }`}
            >
              {hotend.isHeating ? 'Heating' : 'Idle'}
            </span>
          </div>
          <div className="flex items-baseline justify-between font-mono">
            <span className="text-2xl font-bold text-slate-100" data-testid="hotend-actual">
              {`${hotend.actual.toFixed(1)}°C`}
            </span>
            <span className="text-xs text-slate-400" data-testid="hotend-target">
              {`/ ${hotend.target.toFixed(0)}°C`}
            </span>
          </div>
          <form onSubmit={handleApplyHotend} className="flex gap-1.5 mt-1">
            <input
              type="number"
              min={0}
              max={285}
              value={customHotendTarget}
              onChange={(e) => setCustomHotendTarget(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-rose-500"
              placeholder="Target °C"
              data-testid="input-hotend-target"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-medium rounded transition-colors"
              data-testid="btn-set-hotend"
            >
              Set
            </button>
          </form>
        </div>

        {/* Bed Card */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-sky-400 flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5" /> Heated Bed
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                bed.isHeating
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse'
                  : 'text-slate-500'
              }`}
            >
              {bed.isHeating ? 'Heating' : 'Idle'}
            </span>
          </div>
          <div className="flex items-baseline justify-between font-mono">
            <span className="text-2xl font-bold text-slate-100" data-testid="bed-actual">
              {`${bed.actual.toFixed(1)}°C`}
            </span>
            <span className="text-xs text-slate-400" data-testid="bed-target">
              {`/ ${bed.target.toFixed(0)}°C`}
            </span>
          </div>
          <form onSubmit={handleApplyBed} className="flex gap-1.5 mt-1">
            <input
              type="number"
              min={0}
              max={115}
              value={customBedTarget}
              onChange={(e) => setCustomBedTarget(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
              placeholder="Target °C"
              data-testid="input-bed-target"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-sky-600/80 hover:bg-sky-600 text-white text-xs font-medium rounded transition-colors"
              data-testid="btn-set-bed"
            >
              Set
            </button>
          </form>
        </div>
      </div>

      {/* One-Click Presets */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 font-medium">Presets:</span>
        <div className="grid grid-cols-4 gap-1.5 flex-1">
          {presets.map((preset) => {
            const isSelected =
              Math.round(hotend.target) === preset.hotend &&
              Math.round(bed.target) === preset.bed;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePresetClick(preset.hotend, preset.bed)}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50'
                }`}
                data-testid={`preset-${preset.label.toLowerCase()}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Part Cooling Fan Slider & Controls */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 font-medium">
            <Fan className={`w-4 h-4 text-cyan-400 ${fanPercentage > 0 ? 'animate-spin' : ''}`} />
            <span>Part Cooling Fan</span>
          </div>
          <span className="font-mono text-cyan-400 font-semibold" data-testid="fan-percentage">
            {`${fanPercentage}% (${Math.round(fanSpeed * 255)} PWM)`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={fanPercentage}
            onChange={(e) => onSetFanSpeed(Number(e.target.value) / 100)}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
            data-testid="fan-slider"
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSetFanSpeed(0)}
              className="px-2 py-0.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              data-testid="btn-fan-off"
            >
              0%
            </button>
            <button
              type="button"
              onClick={() => onSetFanSpeed(0.5)}
              className="px-2 py-0.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              data-testid="btn-fan-50"
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => onSetFanSpeed(1.0)}
              className="px-2 py-0.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              data-testid="btn-fan-100"
            >
              100%
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
