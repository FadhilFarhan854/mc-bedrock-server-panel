'use client';

import { Play, Square, RotateCcw, Loader2 } from 'lucide-react';
import type { ServerInfo, ServerAction } from '@/types';

interface ActionButtonsProps {
  info: ServerInfo;
  onAction: (action: ServerAction) => Promise<void>;
  loading: boolean;
}

export function ActionButtons({ info, onAction, loading }: ActionButtonsProps) {
  const isRunning = info.running;
  const isRestarting = info.status === 'restarting';

  return (
    <div className="bg-panel-card border border-panel-border rounded-xl px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] text-slate-500 uppercase tracking-widest shrink-0 mr-1">
          Actions
        </p>

        {/* Start */}
        <ActionBtn
          label="Start"
          icon={<Play className="w-4 h-4" />}
          loadingIcon={<Loader2 className="w-4 h-4 animate-spin" />}
          onClick={() => onAction('start')}
          disabled={loading || isRunning || isRestarting}
          loading={loading && !isRunning}
          colorClass="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 hover:border-green-500/50"
        />

        {/* Stop */}
        <ActionBtn
          label="Stop"
          icon={<Square className="w-4 h-4" />}
          loadingIcon={<Loader2 className="w-4 h-4 animate-spin" />}
          onClick={() => onAction('stop')}
          disabled={loading || !isRunning}
          loading={loading && isRunning && !isRestarting}
          colorClass="bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30 hover:border-red-500/50"
        />

        {/* Restart */}
        <ActionBtn
          label="Restart"
          icon={<RotateCcw className="w-4 h-4" />}
          loadingIcon={<Loader2 className="w-4 h-4 animate-spin" />}
          onClick={() => onAction('restart')}
          disabled={loading || !isRunning}
          loading={loading && isRestarting}
          colorClass="bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30 hover:border-blue-500/50"
        />
      </div>
    </div>
  );
}

interface ActionBtnProps {
  label: string;
  icon: React.ReactNode;
  loadingIcon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  colorClass: string;
}

function ActionBtn({
  label,
  icon,
  loadingIcon,
  onClick,
  disabled,
  loading,
  colorClass,
}: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
        border transition-all duration-150
        disabled:opacity-40 disabled:cursor-not-allowed
        ${colorClass}`}
    >
      {loading ? loadingIcon : icon}
      {label}
    </button>
  );
}
