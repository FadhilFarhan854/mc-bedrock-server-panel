import { Box, Hash, Package, Calendar } from 'lucide-react';
import type { ServerInfo } from '@/types';

export function ContainerInfoCard({ info }: { info: ServerInfo }) {
  const startedLabel = info.startedAt
    ? new Date(info.startedAt).toLocaleString()
    : '—';

  return (
    <div className="bg-panel-card border border-panel-border rounded-xl px-5 py-4">
      <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-3">
        Container Info
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Detail icon={<Box className="w-3.5 h-3.5" />} label="Name" value={info.containerName} />
        <Detail icon={<Hash className="w-3.5 h-3.5" />} label="ID" value={info.containerId} mono />
        <Detail icon={<Package className="w-3.5 h-3.5" />} label="Image" value={info.image} />
        <Detail
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Started"
          value={startedLabel}
        />
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-slate-500 shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">
          {label}
        </p>
        <p
          className={`text-sm text-slate-200 truncate ${mono ? 'font-mono' : ''}`}
          title={value}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
