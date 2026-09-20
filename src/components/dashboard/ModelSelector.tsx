import React, { useState, useRef } from 'react';
import { Box, Upload, FileCode, Clock, Layers, Check } from 'lucide-react';
import { SAMPLE_MODELS, SampleModelInfo } from '../../core/gcode/sampleModels';
import { GCodeModelSummary } from '../../core/gcode/types';

export interface ModelSelectorProps {
  activeModelId?: string;
  activeSummary?: GCodeModelSummary | null;
  onSelectSampleModel: (modelId: string) => void;
  onUploadCustomGCode: (fileName: string, gcodeText: string) => void;
  className?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  activeModelId = 'quick_pad',
  activeSummary,
  onSelectSampleModel,
  onUploadCustomGCode,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.gcode') && !file.name.endsWith('.g') && !file.name.endsWith('.txt')) {
      alert('Please upload a valid .gcode file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        onUploadCustomGCode(file.name, text);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const modelsList: SampleModelInfo[] = Object.values(SAMPLE_MODELS);

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-4 text-slate-100 select-none ${className}`}
      data-testid="model-selector"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Box className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-sm tracking-wide text-slate-200">
            Model Library &amp; G-Code Ingestion
          </h3>
        </div>
      </div>

      {/* Built-in Pre-sliced Models */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-slate-400 font-medium">Built-in Pre-Sliced Models:</span>
        <div className="grid grid-cols-3 gap-2">
          {modelsList.map((model) => {
            const isSelected = activeModelId === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onSelectSampleModel(model.id)}
                className={`p-3 rounded-lg border flex flex-col items-start gap-1.5 transition-all text-left ${
                  isSelected
                    ? 'bg-indigo-950/70 border-indigo-500 shadow-md shadow-indigo-900/20'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
                data-testid={`model-card-${model.id}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-xs text-slate-200 truncate">
                    {model.name}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-0.5">
                    <Layers className="w-3 h-3 text-sky-400" />
                    {model.layerCount} layers
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3 text-amber-400" />
                    {model.estimatedTime}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {model.dimensions}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Drag & Drop File Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
          isDragging
            ? 'border-sky-400 bg-sky-950/30'
            : 'border-slate-700 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/70'
        }`}
        data-testid="dropzone-gcode"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".gcode,.g,.txt"
          onChange={handleFileInputChange}
          className="hidden"
          data-testid="input-gcode-file"
        />
        <Upload className="w-6 h-6 text-sky-400" />
        <div className="text-center">
          <p className="text-xs font-medium text-slate-200">
            Click or Drag &amp; Drop custom <code className="text-sky-300">.gcode</code> file here
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Supports Cura, PrusaSlicer, Bambu Studio</p>
        </div>
      </div>

      {/* Active Model Pre-Computation Summary Card */}
      {activeSummary && (
        <div
          className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-col gap-2"
          data-testid="model-summary-card"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span className="truncate max-w-[200px]" data-testid="summary-filename">
                {activeSummary.fileName}
              </span>
            </span>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
              Parsed
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs font-mono">
            <div className="bg-slate-900 border border-slate-800/80 rounded p-1.5 flex flex-col">
              <span className="text-[10px] text-slate-500 font-sans">Dimensions</span>
              <span className="text-slate-200 font-bold truncate" data-testid="summary-dimensions">
                {`${(activeSummary.boundingBox.maxX - activeSummary.boundingBox.minX).toFixed(0)}x${(activeSummary.boundingBox.maxY - activeSummary.boundingBox.minY).toFixed(0)}x${(activeSummary.boundingBox.maxZ - activeSummary.boundingBox.minZ).toFixed(1)}`}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800/80 rounded p-1.5 flex flex-col">
              <span className="text-[10px] text-slate-500 font-sans">Layers</span>
              <span className="text-slate-200 font-bold" data-testid="summary-layers">
                {activeSummary.totalLayers}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800/80 rounded p-1.5 flex flex-col">
              <span className="text-[10px] text-slate-500 font-sans">Est. Time</span>
              <span className="text-slate-200 font-bold truncate" data-testid="summary-time">
                {Math.round(activeSummary.estimatedPrintTimeSeconds / 60)}m
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800/80 rounded p-1.5 flex flex-col">
              <span className="text-[10px] text-slate-500 font-sans">Filament</span>
              <span className="text-slate-200 font-bold truncate" data-testid="summary-filament">
                {(activeSummary.totalFilamentMm / 1000).toFixed(2)}m
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
