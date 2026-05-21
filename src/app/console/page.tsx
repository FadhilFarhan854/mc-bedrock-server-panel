'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Terminal,
  Wifi,
  WifiOff,
  SendHorizonal,
  Loader2,
  Trash2,
} from 'lucide-react';

interface LogLine {
  id: number;
  text: string;
  isError?: boolean;
}

const MAX_LINES = 1_000;

function lineColor(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('error') || t.includes('fatal') || t.includes('[error]'))
    return 'text-red-400';
  if (t.includes('warn') || t.includes('[warn]')) return 'text-yellow-400';
  if (t.includes('[info]') || t.includes('info')) return 'text-blue-300';
  return 'text-slate-300';
}

let idSeq = 0;

export default function ConsolePage() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  const appendLine = useCallback((text: string, isError?: boolean) => {
    setLines((prev) => {
      const next = [...prev, { id: ++idSeq, text, isError }];
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
    });
  }, []);

  // ── SSE connection ───────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource('/api/server/logs');

    es.onopen = () => setConnected(true);

    es.onmessage = (e: MessageEvent) => {
      try {
        const { text, isError } = JSON.parse(e.data as string) as {
          text: string;
          isError?: boolean;
        };
        appendLine(text, isError);
      } catch {
        /* ignore parse errors */
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [appendLine]);

  // ── Auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines]);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    autoScroll.current = el.scrollHeight - el.scrollTop <= el.clientHeight + 80;
  };

  // ── Send command ─────────────────────────────────────────────
  const sendCommand = async () => {
    const cmd = command.trim();
    if (!cmd || sending) return;
    setSending(true);
    setCmdError(null);

    try {
      const res = await fetch('/api/server/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed');
      setCommand('');
    } catch (err) {
      setCmdError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendCommand();
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-panel-border bg-panel-card/80 backdrop-blur shrink-0">
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-slate-400" />
            <h1 className="text-sm font-semibold text-white">Console</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Connection badge */}
            <div
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                connected
                  ? 'text-green-400 bg-green-500/10 border-green-500/20'
                  : 'text-slate-500 bg-slate-800/50 border-slate-700'
              }`}
            >
              {connected ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {connected ? 'Live' : 'Disconnected'}
            </div>

            {/* Clear button */}
            <button
              onClick={() => setLines([])}
              className="p-1.5 rounded-lg border border-panel-border hover:bg-panel-hover text-slate-400 hover:text-white transition-colors"
              title="Clear console"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Log output ── */}
      <div
        ref={logRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-xs leading-5 px-4 py-3 select-text"
        style={{ background: '#060c14' }}
      >
        {lines.length === 0 && (
          <p className="text-slate-600 italic mt-4">
            {connected ? 'Waiting for log output…' : 'Connecting to server…'}
          </p>
        )}
        {lines.map((line) => (
          <div
            key={line.id}
            className={`whitespace-pre-wrap break-all ${
              line.isError ? 'text-red-400' : lineColor(line.text)
            }`}
          >
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Command input ── */}
      <div className="shrink-0 border-t border-panel-border bg-panel-card/80 px-4 py-3">
        {cmdError && (
          <p className="text-xs text-red-400 mb-2">{cmdError}</p>
        )}
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-mono text-sm shrink-0">{'>'}</span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a server command and press Enter…"
            disabled={!connected || sending}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none font-mono disabled:opacity-40"
          />
          <button
            onClick={() => void sendCommand()}
            disabled={!connected || !command.trim() || sending}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
          >
            {sending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SendHorizonal className="w-3.5 h-3.5" />
            )}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
