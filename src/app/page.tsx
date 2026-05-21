'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Server, AlertCircle } from 'lucide-react';
import type { ServerInfo, ServerAction } from '@/types';
import { ServerStatusCard } from '@/components/dashboard/ServerStatusCard';
import { StatsGrid } from '@/components/dashboard/StatsGrid';
import { ActionButtons } from '@/components/dashboard/ActionButtons';
import { ContainerInfoCard } from '@/components/dashboard/ContainerInfoCard';

const REFRESH_INTERVAL = 5_000; // 5 seconds

export default function DashboardPage() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Fetch status ────────────────────────────────────────────────
  const fetchStatus = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const res = await fetch('/api/server/status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch status');
      setServerInfo(data as ServerInfo);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(() => fetchStatus(), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // ── Container actions ───────────────────────────────────────────
  const handleAction = async (action: ServerAction) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/server/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Action failed');
      // Give Docker a moment then refresh
      setTimeout(() => fetchStatus(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-200">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-panel-border bg-panel-card/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center border border-green-500/30 shrink-0">
              <Server className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">
                Bedrock Panel
              </h1>
              {serverInfo && (
                <p className="text-[11px] text-slate-500 leading-tight">
                  {serverInfo.containerName}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[11px] text-slate-600 hidden sm:block">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => fetchStatus(true)}
              className="p-2 rounded-lg border border-panel-border hover:bg-panel-hover transition-colors"
              title="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Connection Error</p>
              <p className="text-xs text-red-300/70 mt-0.5 font-mono">{error}</p>
              <p className="text-xs text-red-300/50 mt-1">
                Make sure Docker is running and{' '}
                <code className="font-mono">CONTAINER_NAME</code> in{' '}
                <code className="font-mono">.env.local</code> is correct.
              </p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !serverInfo && <LoadingSkeleton />}

        {/* Dashboard */}
        {serverInfo && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <ServerStatusCard info={serverInfo} />
              </div>
              <div>
                <StatsGrid info={serverInfo} />
              </div>
            </div>

            <ActionButtons
              info={serverInfo}
              onAction={handleAction}
              loading={actionLoading}
            />

            <ContainerInfoCard info={serverInfo} />
          </>
        )}
      </main>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-52 bg-panel-card rounded-xl border border-panel-border" />
        <div className="h-52 bg-panel-card rounded-xl border border-panel-border" />
      </div>
      <div className="h-14 bg-panel-card rounded-xl border border-panel-border" />
      <div className="h-20 bg-panel-card rounded-xl border border-panel-border" />
    </div>
  );
}
