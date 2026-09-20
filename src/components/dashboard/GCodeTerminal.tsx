import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Trash2, Filter } from 'lucide-react';
import { TerminalEntry } from '../../core/telemetry/types';

export interface GCodeTerminalProps {
  logs: TerminalEntry[];
  onSendCommand: (command: string) => void;
  onClearLogs?: () => void;
  className?: string;
}

export const GCodeTerminal: React.FC<GCodeTerminalProps> = ({
  logs,
  onSendCommand,
  onClearLogs,
  className = '',
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [filterM105, setFilterM105] = useState<boolean>(true);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to bottom on new log entry
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    onSendCommand(trimmed);

    // Append to command history
    setCommandHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;

      const nextIndex =
        historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputText(commandHistory[nextIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;

      const nextIndex = historyIndex + 1;
      if (nextIndex >= commandHistory.length) {
        setHistoryIndex(-1);
        setInputText('');
      } else {
        setHistoryIndex(nextIndex);
        setInputText(commandHistory[nextIndex] || '');
      }
    }
  };

  // Filter logs: hide M105 temperature queries if filter enabled
  const visibleLogs = logs.filter((log) => {
    if (!filterM105) return true;
    const msg = log.message.trim();
    // Filter M105 sent command or standard temperature queries
    if (msg === '> M105' || msg.startsWith('> M105 ')) return false;
    // Filter ok T:... response or pure T:... responses
    if (msg.startsWith('ok T:') || (msg.startsWith('T:') && msg.includes('B:'))) return false;
    return true;
  });

  const getLogStyle = (entry: TerminalEntry): string => {
    if (entry.type === 'command' || entry.message.startsWith('> ')) {
      return 'text-sky-300 font-bold';
    }
    if (entry.type === 'error' || entry.message.startsWith('Error') || entry.message.startsWith('!!')) {
      return 'text-rose-400 font-bold bg-rose-950/20 px-1 rounded';
    }
    if (entry.type === 'echo' || entry.message.startsWith('echo:')) {
      return 'text-amber-300';
    }
    if (entry.message.startsWith('ok')) {
      return 'text-emerald-400';
    }
    return 'text-slate-300';
  };

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-3 text-slate-100 select-none ${className}`}
      data-testid="gcode-terminal"
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-sky-400" />
          <h3 className="font-semibold text-sm tracking-wide text-slate-200">G-Code Serial Console</h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {/* Filter M105 toggle */}
          <label
            className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200 transition-colors"
            title="Hide periodic M105 temperature queries and responses"
          >
            <input
              type="checkbox"
              checked={filterM105}
              onChange={(e) => setFilterM105(e.target.checked)}
              className="accent-sky-500 rounded"
              data-testid="filter-m105-checkbox"
            />
            <span className="flex items-center gap-1">
              <Filter className="w-3 h-3" /> Hide M105
            </span>
          </label>

          {/* Clear console */}
          {onClearLogs && (
            <button
              type="button"
              onClick={onClearLogs}
              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
              title="Clear Console Output"
              data-testid="btn-clear-terminal"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Serial Stream Buffer */}
      <div
        className="w-full h-56 bg-slate-950 rounded-lg border border-slate-800 p-2.5 overflow-y-auto font-mono text-xs flex flex-col gap-1 select-text"
        data-testid="terminal-log-container"
      >
        {visibleLogs.length === 0 ? (
          <div className="text-slate-600 italic select-none py-2">
            Virtual serial stream connected (115200 baud). No messages logged yet.
          </div>
        ) : (
          visibleLogs.map((log) => (
            <div key={log.id} className="leading-relaxed flex items-start gap-2 break-all">
              <span className="text-slate-600 text-[10px] select-none shrink-0 pt-0.5">
                [{log.timestamp}]
              </span>
              <span className={getLogStyle(log)}>{log.message}</span>
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Quick Macro Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono pb-0.5">
        <span className="text-slate-500 text-xs shrink-0">Macros:</span>
        <button
          type="button"
          onClick={() => onSendCommand('M114')}
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0"
          data-testid="macro-m114"
        >
          M114 (Pos)
        </button>
        <button
          type="button"
          onClick={() => onSendCommand('M105')}
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0"
          data-testid="macro-m105"
        >
          M105 (Temp)
        </button>
        <button
          type="button"
          onClick={() => onSendCommand('G28')}
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0"
          data-testid="macro-g28"
        >
          G28 (Home)
        </button>
        <button
          type="button"
          onClick={() => onSendCommand('M84')}
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shrink-0"
          data-testid="macro-m84"
        >
          M84 (Stop Steppers)
        </button>
      </div>

      {/* Command Input Box with Enter Submission & History Navigation */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send G-code command (e.g. G1 X100 Y100 F3000)..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
            data-testid="input-terminal-command"
          />
        </div>
        <button
          type="submit"
          className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors shadow-md shadow-sky-600/20"
          data-testid="btn-send-command"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
