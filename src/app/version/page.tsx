'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Tag,
  RefreshCw,
  RotateCcw,
  Loader2,
  AlertCircle,
  Package,
  CheckCircle2,
  Info,
  ArrowUpCircle,
} from 'lucide-react';
import type { VersionInfo } from '@/app/api/server/version/route';

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/** Badge style for the VERSION env var value */
function versionEnvBadge(v: string): { label: string; cls: string } {
  if (v === 'LATEST')
    return { label: 'LATEST', cls: 'text-green-400 bg-green-500/10 border-green-500/20' };
  if (v === 'PREVIEW')
    return { label: 'PREVIEW', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' };
  return { label: v, cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
}

export default function VersionPage() {
  const [info, setInfo]         = useState<VersionInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartDone, setRestartDone] = useState(false);

  // ── Load ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/server/version');
      const json = (await res.json()) as VersionInfo & { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setInfo(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Restart to upgrade ───────────────────────────────────────
  const restart = async () => {
    setRestarting(true);
    setRestartDone(false);
    try {
      const res = await fetch('/api/server/action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'restart' }),
      });
      if (!res.ok) throw new Error('Restart failed');
      setRestartDone(true);
      // Reload version info after a short delay
      setTimeout(() => void load(), 5_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restart failed');
    } finally {
      setRestarting(false);
    }
  };

  const canAutoUpgrade = info?.versionEnv === 'LATEST' || info?.versionEnv === 'PREVIEW';
  const badge = info ? versionEnvBadge(info.versionEnv) : null;

  return (
    <div className="min-h-screen">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-panel-border bg-panel-card/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Tag className="w-4 h-4 text-slate-400" />
            <h1 className="text-sm font-semibold text-white">Version</h1>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="p-1.5 rounded-lg border border-panel-border hover:bg-panel-hover text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Restart done */}
        {restartDone && (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-300 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Restart triggered. The server will download the latest version on startup.
          </div>
        )}

        {/* Loading */}
        {loading && !info && (
          <div className="space-y-4 animate-pulse">
            <div className="h-36 bg-panel-card rounded-xl border border-panel-border" />
            <div className="h-24 bg-panel-card rounded-xl border border-panel-border" />
            <div className="h-40 bg-panel-card rounded-xl border border-panel-border" />
          </div>
        )}

        {info && (
          <>
            {/* ── Version info card ── */}
            <div className="bg-panel-card border border-panel-border rounded-xl p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Installed version */}
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                    Installed Version
                  </p>
                  <p className="text-3xl font-bold text-white font-mono">
                    {info.versionInstalled ?? '—'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Read from <code className="font-mono text-slate-500">/data/version</code>
                  </p>
                </div>

                {/* VERSION env var */}
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-2">
                    VERSION Setting
                  </p>
                  {badge && (
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm font-mono font-semibold px-3 py-1.5 rounded-lg border ${badge.cls}`}
                    >
                      <Tag className="w-3.5 h-3.5" />
                      {badge.label}
                    </span>
                  )}
                  <p className="text-xs text-slate-600 mt-2">
                    Set via <code className="font-mono text-slate-500">VERSION</code> env var on the
                    container
                  </p>
                </div>
              </div>

              {/* Package backup keep */}
              <div className="pt-4 border-t border-panel-border flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-0.5">
                    Package Backup Retention
                  </p>
                  <p className="text-sm text-slate-300">
                    Keep{' '}
                    <span className="font-bold text-white">{info.packageBackupKeep}</span>{' '}
                    previous server package{info.packageBackupKeep !== '1' ? 's' : ''} for rollback
                  </p>
                </div>
                <span className="text-[11px] font-mono text-slate-500 bg-panel-bg border border-panel-border px-2 py-1 rounded">
                  PACKAGE_BACKUP_KEEP={info.packageBackupKeep}
                </span>
              </div>
            </div>

            {/* ── Upgrade action ── */}
            <div className="bg-panel-card border border-panel-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpCircle className={`w-4 h-4 ${canAutoUpgrade ? 'text-green-400' : 'text-slate-500'}`} />
                    <p className="text-sm font-medium text-white">
                      {canAutoUpgrade ? 'Auto-Upgrade Available' : 'Pinned Version'}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {canAutoUpgrade
                      ? `Restarting the container will download and install the latest ${info.versionEnv === 'PREVIEW' ? 'preview' : 'stable'} version automatically.`
                      : `Server is pinned to version ${info.versionEnv}. To change, update the VERSION env var in your docker-compose and recreate the container.`}
                  </p>
                </div>
                {canAutoUpgrade && (
                  <button
                    onClick={() => void restart()}
                    disabled={restarting}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {restarting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    Restart & Upgrade
                  </button>
                )}
              </div>
            </div>

            {/* ── Available packages ── */}
            <div className="bg-panel-card border border-panel-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-panel-border">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-500" />
                  <p className="text-xs text-slate-500 uppercase tracking-widest">
                    Server Packages in /data
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400 bg-panel-bg border border-panel-border px-2 py-0.5 rounded-full">
                  {info.packages.length}
                </span>
              </div>

              {info.packages.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-600">
                  No server packages found in /data.
                </p>
              ) : (
                <ul className="divide-y divide-panel-border">
                  {info.packages.map((pkg, idx) => (
                    <li
                      key={pkg.filename}
                      className="flex items-center justify-between px-5 py-3 hover:bg-panel-hover/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Package className={`w-4 h-4 shrink-0 ${idx === 0 ? 'text-green-400' : 'text-slate-600'}`} />
                        <div>
                          <p className="text-sm text-white font-mono">{pkg.version}</p>
                          <p className="text-[11px] text-slate-500">{pkg.filename}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {idx === 0 && (
                          <span className="text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                        <span className="text-xs text-slate-500">{formatBytes(pkg.sizeBytes)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── How to change version ── */}
            <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1.5">
                <p className="font-medium text-blue-200">Changing the VERSION setting</p>
                <p className="text-blue-400/80">
                  The <code className="font-mono">VERSION</code> env var is set at container creation
                  time and cannot be changed on a running container. To change it, update your{' '}
                  <code className="font-mono">docker-compose.yml</code> and run:
                </p>
                <pre className="mt-2 bg-panel-bg/60 rounded-lg px-3 py-2 font-mono text-blue-300/80 text-[11px] overflow-x-auto">
{`docker compose up -d --force-recreate`}
                </pre>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
