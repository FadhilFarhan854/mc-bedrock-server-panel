import { Layers, Gamepad2, Shield, Mountain } from 'lucide-react';
import type { ServerInfo } from '@/types';

const STATUS_CONFIG: Record<
  string,
  { dot: string; badge: string; label: string }
> = {
  running: {
    dot: 'bg-green-400',
    badge: 'bg-green-500/20 text-green-400 border-green-500/30',
    label: 'Running',
  },
  stopped: {
    dot: 'bg-red-400',
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: 'Stopped',
  },
  exited: {
    dot: 'bg-red-400',
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: 'Exited',
  },
  paused: {
    dot: 'bg-yellow-400',
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    label: 'Paused',
  },
  restarting: {
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    label: 'Restarting',
  },
  dead: {
    dot: 'bg-red-700',
    badge: 'bg-red-900/20 text-red-600 border-red-900/30',
    label: 'Dead',
  },
  created: {
    dot: 'bg-slate-400',
    badge: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    label: 'Created',
  },
};

const HEALTH_STYLE: Record<string, { color: string; label: string }> = {
  healthy:   { color: 'text-green-400',  label: '✓ Healthy' },
  unhealthy: { color: 'text-red-400',    label: '✗ Unhealthy' },
  starting:  { color: 'text-yellow-400', label: '◎ Starting' },
  none:      { color: 'text-slate-600',  label: '' },
};

export function ServerStatusCard({ info }: { info: ServerInfo }) {
  const s = STATUS_CONFIG[info.status] ?? STATUS_CONFIG.created;
  const h = HEALTH_STYLE[info.health] ?? HEALTH_STYLE.none;

  return (
    <div className="bg-panel-card border border-panel-border rounded-xl p-5 h-full flex flex-col">
      {/* ── Status row ── */}
      <div className="flex items-center gap-2 mb-5">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot} ${
            info.status === 'running' ? 'animate-pulse-slow' : ''
          }`}
        />
        <span
          className={`text-xs font-mono uppercase px-2 py-0.5 rounded border ${s.badge}`}
        >
          {s.label}
        </span>
        {h.label && (
          <span className={`text-xs ml-1 ${h.color}`}>{h.label}</span>
        )}
      </div>

      {/* ── Server name ── */}
      <div className="mb-5">
        <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">
          Server Name
        </p>
        <h2 className="text-2xl font-bold text-white truncate">
          {info.serverName || 'Bedrock Level'}
        </h2>
      </div>

      {/* ── Properties grid ── */}
      <div className="grid grid-cols-2 gap-y-4 gap-x-4 mt-auto">
        <InfoRow
          icon={<Layers className="w-3.5 h-3.5" />}
          label="Version"
          value={info.serverVersion}
        />
        <InfoRow
          icon={<Gamepad2 className="w-3.5 h-3.5" />}
          label="Gamemode"
          value={capitalize(info.gamemode)}
        />
        <InfoRow
          icon={<Shield className="w-3.5 h-3.5" />}
          label="Difficulty"
          value={capitalize(info.difficulty)}
        />
        <InfoRow
          icon={<Mountain className="w-3.5 h-3.5" />}
          label="Level"
          value={info.levelName}
        />
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-500 shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm font-medium text-slate-200 truncate">
          {value || '—'}
        </p>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}
