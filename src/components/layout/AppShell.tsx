'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Server } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ToastContainer, type ToastItem } from '@/components/notifications/Toast';

let toastSeq = 0;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const isLoginPage = pathname === '/login';

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts]           = useState<ToastItem[]>([]);
  const prevStatus                    = useRef<string | null>(null);

  // ── Toast helpers ─────────────────────────────────────────────
  const addToast = useCallback((msg: string, type: ToastItem['type']) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, message: msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5_000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Browser notification permission ──────────────────────────
  useEffect(() => {
    if (isLoginPage) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, [isLoginPage]);

  // ── Server status polling for notifications ───────────────────
  useEffect(() => {
    if (isLoginPage) return;

    const poll = async () => {
      try {
        const res = await fetch('/api/server/status');
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        const status = data.status ?? 'unknown';
        const prev   = prevStatus.current;

        if (prev !== null && prev !== status) {
          const nowRunning  = status === 'running';
          const wasRunning  = prev === 'running';

          if (wasRunning && !nowRunning) {
            addToast(`Server stopped (${status})`, 'error');
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('⚠️ Minecraft Server Stopped', {
                body: `Container status changed to: ${status}`,
              });
            }
          } else if (!wasRunning && nowRunning) {
            addToast('Server is now running!', 'success');
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('✅ Minecraft Server Online', {
                body: 'Server started successfully.',
              });
            }
          }
        }

        prevStatus.current = status;
      } catch {
        /* ignore network errors */
      }
    };

    void poll();
    const id = setInterval(() => void poll(), 10_000);
    return () => clearInterval(id);
  }, [isLoginPage, addToast]);

  if (isLoginPage) return <>{children}</>;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex min-h-screen">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 min-w-0 overflow-auto">
          {/* Mobile top bar */}
          <div className="md:hidden sticky top-0 z-10 border-b border-panel-border bg-panel-card/90 backdrop-blur px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 rounded-lg border border-panel-border hover:bg-panel-hover text-slate-400 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-green-400" />
              <span className="text-sm font-bold text-white">Bedrock Panel</span>
            </div>
          </div>

          {children}
        </div>
      </div>
    </>
  );
}
