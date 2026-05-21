import { Users, Clock, Network } from 'lucide-react';
import type { ServerInfo } from '@/types';

export function StatsGrid({ info }: { info: ServerInfo }) {
  const { online, max } = info.players;
  const pct = max > 0 ? Math.min((online / max) * 100, 100) : 0;

  const barColor =
    pct >= 90
      ? 'bg-red-500'
      : pct >= 60
      ? 'bg-yellow-500'
      : 'bg-blue-500';

  return (
    <div className="bg-panel-card border border-panel-border rounded-xl p-5 h-full flex flex-col gap-5">
      {/* ── Players ── */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Users className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] text-slate-500 uppercase tracking-widest">
            Players
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-white">{online}</span>
          <span className="text-slate-500 text-sm">/ {max}</span>
        </div>
        <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* ── Uptime ── */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Clock className="w-3.5 h-3.5 text-green-400" />
          <span className="text-[11px] text-slate-500 uppercase tracking-widest">
            Uptime
          </span>
        </div>
        <p className="text-lg font-semibold text-white">
          {info.running ? (info.uptime ?? '—') : '—'}
        </p>
      </div>

      {/* ── Ports ── */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Network className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[11px] text-slate-500 uppercase tracking-widest">
            Ports (UDP)
          </span>
        </div>
        <div className="space-y-1">
          <PortRow
            label="IPv4"
            port={info.portBindings[`${info.port}/udp`] ?? info.port}
          />
          <PortRow
            label="IPv6"
            port={info.portBindings[`${info.portV6}/udp`] ?? info.portV6}
          />
        </div>
      </div>
    </div>
  );
}

function PortRow({ label, port }: { label: string; port: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-mono text-slate-200">{port}</span>
    </div>
  );
}
