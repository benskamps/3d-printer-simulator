import React, { useState } from 'react';
import {
  AlertTriangle,
  Flame,
  Navigation,
  Terminal as TerminalIcon,
  AlertOctagon,
  Box,
  RotateCcw,
  Sliders,
  Printer,
  ChevronRight,
} from 'lucide-react';
import { PrinterTelemetryState, PrinterStatus } from '../../core/telemetry/types';
import { ToolpathSegment, IKinematicState } from '../../core/kinematics/types';
import { GCodeModelSummary } from '../../core/gcode/types';
import { NozzleClogMode } from '../../core/failures/types';
import { IPrinterViewportController } from '../../viewport/types';
import { ViewportContainer } from '../../viewport/ViewportContainer';
import { TemperaturePanel } from './TemperaturePanel';
import { JogControlPanel } from './JogControlPanel';
import { PrintStatusPanel } from './PrintStatusPanel';
import { GCodeTerminal } from './GCodeTerminal';
import { FailureControls } from './FailureControls';
import { ModelSelector } from './ModelSelector';

export type DashboardTab = 'control' | 'thermals' | 'terminal' | 'failures' | 'models' | 'all';

export interface FluiddDashboardProps {
  telemetry: PrinterTelemetryState;
  activeSegment?: ToolpathSegment | null;
  kinematicState?: IKinematicState;
  modelSummary?: GCodeModelSummary | null;
  speedMultiplier: number;
  activeModelId: string;
  onViewportReady?: (controller: IPrinterViewportController) => void;
  // Transport actions
  onStartPrint: () => void;
  onPausePrint: () => void;
  onResumePrint: () => void;
  onAbortPrint: () => void;
  onStepPrint: () => void;
  onEmergencyStop: () => void;
  onResetFaults: () => void;
  onSetSpeedMultiplier: (mult: number) => void;
  // Kinematics & Jog
  onJog: (axis: 'X' | 'Y' | 'Z', distance: number) => void;
  onJogXY?: (dx: number, dy: number) => void;
  onHome: (axes: { x?: boolean; y?: boolean; z?: boolean }) => void;
  onExtrude: (amountMm: number) => void;
  onRetract: (amountMm: number) => void;
  onDisableSteppers?: () => void;
  // Thermals
  onSetHotendTarget: (temp: number) => void;
  onSetBedTarget: (temp: number) => void;
  onSetFanSpeed: (duty: number) => void;
  // Terminal
  onSendCommand: (command: string) => void;
  onClearTerminal: () => void;
  // Failures
  onSetNozzleClog: (mode: NozzleClogMode) => void;
  onSetSpaghettiMode: (active: boolean) => void;
  onTriggerLayerShift: (dx: number, dy: number) => void;
  onSetFilamentRunout: (active: boolean) => void;
  onSimulateThermalRunaway: (heater?: 'hotend' | 'bed') => void;
  onResetFailures: () => void;
  // Models
  onSelectSampleModel: (modelId: string) => void;
  onUploadCustomGCode: (fileName: string, gcodeText: string) => void;
}

export const FluiddDashboard: React.FC<FluiddDashboardProps> = ({
  telemetry,
  activeSegment,
  kinematicState,
  modelSummary,
  speedMultiplier,
  activeModelId,
  onViewportReady,
  onStartPrint,
  onPausePrint,
  onResumePrint,
  onAbortPrint,
  onStepPrint,
  onEmergencyStop,
  onResetFaults,
  onSetSpeedMultiplier,
  onJog,
  onJogXY,
  onHome,
  onExtrude,
  onRetract,
  onDisableSteppers,
  onSetHotendTarget,
  onSetBedTarget,
  onSetFanSpeed,
  onSendCommand,
  onClearTerminal,
  onSetNozzleClog,
  onSetSpaghettiMode,
  onTriggerLayerShift,
  onSetFilamentRunout,
  onSimulateThermalRunaway,
  onResetFailures,
  onSelectSampleModel,
  onUploadCustomGCode,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('control');

  // Status Badge Styling Helper
  const getStatusBadge = (status: PrinterStatus) => {
    switch (status) {
      case 'PRINTING':
        return {
          label: 'PRINTING',
          badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse',
          dotClass: 'bg-emerald-400',
        };
      case 'HEATING':
        return {
          label: 'HEATING',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse',
          dotClass: 'bg-amber-400',
        };
      case 'HOMING':
        return {
          label: 'HOMING',
          badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40 animate-pulse',
          dotClass: 'bg-sky-400',
        };
      case 'PAUSED':
        return {
          label: 'PAUSED',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          dotClass: 'bg-amber-400',
        };
      case 'ERROR':
      case 'HALTED':
        return {
          label: status,
          badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-bounce',
          dotClass: 'bg-rose-500',
        };
      case 'IDLE':
      default:
        return {
          label: 'READY / IDLE',
          badgeClass: 'bg-slate-800 text-emerald-400 border-slate-700',
          dotClass: 'bg-emerald-500',
        };
    }
  };

  const statusInfo = getStatusBadge(telemetry.status);
  const isHalted = telemetry.status === 'HALTED' || telemetry.status === 'ERROR';

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none"
      data-testid="fluidd-dashboard"
    >
      {/* 1. App Header: Brand, Status Badge, File/Progress pill, Emergency Stop & Reset */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shadow-lg sticky top-0 z-30">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 rounded-lg shadow-md shadow-indigo-600/30">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white leading-tight">
                FLUIDD <span className="text-sky-400 font-normal text-xs">// Simulator</span>
              </h1>
              <p className="text-[10px] text-slate-400 leading-none">Virtual Klipper/Marlin Firmware</p>
            </div>
          </div>

          {/* Printer State Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono font-semibold transition-all ${statusInfo.badgeClass}`}
            data-testid="printer-status-badge"
          >
            <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`} />
            <span>{statusInfo.label}</span>
          </div>
        </div>

        {/* Middle: Active File & Mini Progress Bar */}
        <div className="hidden md:flex items-center gap-3 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
          <span className="font-medium text-slate-300 truncate max-w-[160px]" data-testid="header-filename">
            {telemetry.job.filename || 'No File Selected'}
          </span>
          <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, telemetry.job.progressPercent))}%` }}
              data-testid="header-progressbar"
            />
          </div>
          <span className="font-mono text-emerald-400 font-bold" data-testid="header-progress-percent">
            {telemetry.job.progressPercent}%
          </span>
          <span className="text-slate-600">|</span>
          <span className="font-mono text-slate-400" data-testid="header-layer-info">
            L{telemetry.job.currentLayer}/{telemetry.job.totalLayers}
          </span>
        </div>

        {/* Right: Emergency Stop & Clear Faults Buttons */}
        <div className="flex items-center gap-2">
          {/* Printer Reset / Clear Faults button */}
          <button
            type="button"
            onClick={onResetFaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors shadow-sm"
            data-testid="btn-clear-faults"
            title="Clear all printer faults and reset firmware state"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Clear Faults</span>
          </button>

          {/* Prominent Emergency Stop button (M112) */}
          <button
            type="button"
            onClick={onEmergencyStop}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/30 border border-rose-500"
            data-testid="btn-emergency-stop"
            title="EMERGENCY STOP (M112): Instant shutdown of all motion, heaters, and printhead"
          >
            <AlertOctagon className="w-4 h-4 fill-white text-rose-600" />
            <span>EMERGENCY STOP (M112)</span>
          </button>
        </div>
      </header>

      {/* Emergency Halt Banner if active */}
      {isHalted && (
        <div
          className="bg-rose-950 border-b border-rose-800 px-4 py-2 flex items-center justify-between text-rose-200 text-xs font-medium animate-pulse"
          data-testid="halt-alert-banner"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>FIRMWARE HALTED:</strong> {telemetry.statusMessage || 'Emergency stop triggered!'}
            </span>
          </div>
          <button
            type="button"
            onClick={onResetFaults}
            className="px-3 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white font-bold transition-colors"
            data-testid="btn-banner-reset"
          >
            Reset Printer
          </button>
        </div>
      )}

      {/* 2. Main Content Grid (Responsive 2-Column: Left 60% Viewport, Right 40% Control Deck) */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1920px] w-full mx-auto">
        {/* Left Column (Approx 60%): 3D Viewport Container & Quick Stats */}
        <div className="lg:col-span-7 flex flex-col gap-3 min-h-[500px]">
          <div className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
            <ViewportContainer
              kinematicState={kinematicState}
              activeSegment={activeSegment}
              onViewportReady={onViewportReady}
              hotendTemp={telemetry.hotend.actual}
              bedTemp={telemetry.bed.actual}
              hotendTarget={telemetry.hotend.target}
              bedTarget={telemetry.bed.target}
              className="w-full h-full min-h-[520px]"
            />
          </div>

          {/* Quick Model Selector Strip directly below viewport */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-indigo-400" />
              <span className="text-slate-400">Selected Model:</span>
              <span className="font-semibold text-slate-200" data-testid="quick-selected-model">
                {modelSummary?.fileName || 'Calibration Cube 20mm'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('models')}
              className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium transition-colors"
              data-testid="btn-open-model-selector"
            >
              <span>Change / Upload Model</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Column (Approx 40%): Modular Control Deck Panels */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* Deck Tab Selector Bar */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-md overflow-x-auto text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('control')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'control'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              data-testid="tab-control"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Control</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('thermals')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'thermals'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              data-testid="tab-thermals"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Thermals</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('terminal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'terminal'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              data-testid="tab-terminal"
            >
              <TerminalIcon className="w-3.5 h-3.5" />
              <span>Console</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('failures')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'failures'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              data-testid="tab-failures"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Failures</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('models')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'models'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              data-testid="tab-models"
            >
              <Box className="w-3.5 h-3.5" />
              <span>Models</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              data-testid="tab-all"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>All Panels</span>
            </button>
          </div>

          {/* Tab Content Panels */}
          <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-130px)] pr-1">
            {/* Control Tab: Print Status Panel + Jog Control Panel */}
            {(activeTab === 'control' || activeTab === 'all') && (
              <>
                <PrintStatusPanel
                  status={telemetry.status}
                  job={telemetry.job}
                  speedMultiplier={speedMultiplier}
                  onStartPrint={onStartPrint}
                  onPausePrint={onPausePrint}
                  onResumePrint={onResumePrint}
                  onAbortPrint={onAbortPrint}
                  onStepPrint={onStepPrint}
                  onSetSpeedMultiplier={onSetSpeedMultiplier}
                />
                <JogControlPanel
                  currentPosition={telemetry.nominalPosition}
                  isHomed={telemetry.homedAxes}
                  hotendActualTemp={telemetry.hotend.actual}
                  onJog={onJog}
                  onJogXY={onJogXY}
                  onHome={onHome}
                  onExtrude={onExtrude}
                  onRetract={onRetract}
                  onDisableSteppers={onDisableSteppers}
                />
              </>
            )}

            {/* Thermals Tab: Temperature History Chart + Presets + Fan */}
            {(activeTab === 'thermals' || activeTab === 'all') && (
              <TemperaturePanel
                hotend={telemetry.hotend}
                bed={telemetry.bed}
                thermalHistory={telemetry.thermalHistory}
                fanSpeed={telemetry.partCoolingFanSpeed}
                onSetHotendTarget={onSetHotendTarget}
                onSetBedTarget={onSetBedTarget}
                onSetFanSpeed={onSetFanSpeed}
              />
            )}

            {/* Console / Terminal Tab */}
            {(activeTab === 'terminal' || activeTab === 'all') && (
              <GCodeTerminal
                logs={telemetry.terminalLog}
                onSendCommand={onSendCommand}
                onClearLogs={onClearTerminal}
              />
            )}

            {/* Failures Tab */}
            {(activeTab === 'failures' || activeTab === 'all') && (
              <FailureControls
                failures={telemetry.failures}
                onSetNozzleClog={onSetNozzleClog}
                onSetSpaghettiMode={onSetSpaghettiMode}
                onTriggerLayerShift={onTriggerLayerShift}
                onSetFilamentRunout={onSetFilamentRunout}
                onSimulateThermalRunaway={onSimulateThermalRunaway}
                onResetFailures={onResetFailures}
              />
            )}

            {/* Models Tab */}
            {(activeTab === 'models' || activeTab === 'all') && (
              <ModelSelector
                activeModelId={activeModelId}
                activeSummary={modelSummary}
                onSelectSampleModel={onSelectSampleModel}
                onUploadCustomGCode={onUploadCustomGCode}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
