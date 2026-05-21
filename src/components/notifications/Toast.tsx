'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

const TYPE_STYLE: Record<
  ToastItem['type'],
  { bar: string; icon: React.ReactNode; text: string; bg: string }
> = {
  success: {
    bar:  'bg-green-500',
    icon: <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />,
    text: 'text-green-100',
    bg:   'bg-[#0a1f12] border-green-500/30',
  },
  error: {
    bar:  'bg-red-500',
    icon: <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
    text: 'text-red-100',
    bg:   'bg-[#1a0a0a] border-red-500/30',
  },
  warning: {
    bar:  'bg-yellow-500',
    icon: <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />,
    text: 'text-yellow-100',
    bg:   'bg-[#1a1500] border-yellow-500/30',
  },
  info: {
    bar:  'bg-blue-500',
    icon: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
    text: 'text-blue-100',
    bg:   'bg-[#0a0f1a] border-blue-500/30',
  },
};

// ── Single toast ──────────────────────────────────────────────────
function Toast({
  toast,
  onRemove,
}: {
  toast: ToastItem;
  onRemove: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);
  const s = TYPE_STYLE[toast.type];

  // Slide-in after mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`
        relative flex items-center gap-3 min-w-72 max-w-sm
        border rounded-xl px-4 py-3 shadow-xl
        transition-all duration-300 ease-out
        ${s.bg}
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6'}
      `}
    >
      {/* Left accent bar */}
      <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${s.bar}`} />

      {s.icon}

      <p className={`flex-1 text-sm ${s.text}`}>{toast.message}</p>

      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-slate-500 hover:text-white transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Container (rendered by AppShell) ─────────────────────────────
export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastItem[];
  onRemove: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
}
