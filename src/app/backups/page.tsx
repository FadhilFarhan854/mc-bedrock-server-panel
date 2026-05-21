'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  HardDrive,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  ArchiveX,
  Archive,
  Clock,
} from 'lucide-react';
import type { BackupItem } from '@/app/api/server/backups/route';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  // ── Load list ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/server/backups');
      const json = (await res.json()) as { backups?: BackupItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setBackups(json.backups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Create backup ──────────────────────────────────────────────
  const createBackup = async () => {
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const res  = await fetch('/api/server/backups', { method: 'POST' });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Backup failed');
      setSuccess('Backup created successfully.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setCreating(false);
    }
  };

  // ── Delete backup ──────────────────────────────────────────────
  const deleteBackup = async (filename: string) => {
    setDeleting(filename);
    setError(null);
    setSuccess(null);
    try {
      const res  = await fetch('/api/server/backups', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ filename }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Delete failed');
      setBackups((prev) => prev.filter((b) => b.filename !== filename));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const totalSize = backups.reduce((sum, b) => sum + b.sizeBytes, 0);

  return (
    <div className="min-h-screen">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-panel-border bg-panel-card/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <h1 className="text-sm font-semibold text-white">Backups</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              disabled={loading || creating}
              className="p-1.5 rounded-lg border border-panel-border hover:bg-panel-hover text-slate-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => void createBackup()}
              disabled={creating || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              {creating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Create Backup
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        {/* Creating progress banner */}
        {creating && (
          <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium">Creating backup…</p>
              <p className="text-xs text-blue-400/60 mt-0.5">
                This may take a moment for large worlds. Please wait.
              </p>
            </div>
          </div>
        )}

        {/* Success */}
        {success && !creating && (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-300 text-sm">
            <Archive className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Stats row */}
        {!loading && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-panel-card border border-panel-border rounded-xl px-5 py-4">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">
                Total Backups
              </p>
              <p className="text-2xl font-bold text-white">{backups.length}</p>
            </div>
            <div className="bg-panel-card border border-panel-border rounded-xl px-5 py-4">
              <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">
                Total Size
              </p>
              <p className="text-2xl font-bold text-white">{formatBytes(totalSize)}</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-panel-card rounded-xl border border-panel-border" />
            ))}
          </div>
        )}

        {/* Backup list */}
        {!loading && (
          <div className="bg-panel-card border border-panel-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-panel-border">
              <p className="text-xs text-slate-500 uppercase tracking-widest">World Backups</p>
            </div>

            {backups.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-14 text-slate-600">
                <ArchiveX className="w-10 h-10" />
                <p className="text-sm">No backups yet.</p>
                <p className="text-xs">Click &ldquo;Create Backup&rdquo; to snapshot your world.</p>
              </div>
            ) : (
              <ul className="divide-y divide-panel-border">
                {backups.map((b) => (
                  <li
                    key={b.filename}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-panel-hover/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Archive className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-white font-mono truncate">{b.filename}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Clock className="w-3 h-3" />
                            {formatDate(b.createdAt)}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {formatBytes(b.sizeBytes)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => void deleteBackup(b.filename)}
                      disabled={deleting === b.filename || creating}
                      className="ml-3 shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                      title={`Delete ${b.filename}`}
                    >
                      {deleting === b.filename ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Notes */}
        {!loading && (
          <div className="space-y-1.5 text-xs text-slate-600">
            <p>
              Backups are stored at <code className="font-mono text-slate-500">/data/backups/</code>{' '}
              inside the container (mounted volume).
            </p>
            <p>
              A <code className="font-mono text-slate-500">save hold</code> /{' '}
              <code className="font-mono text-slate-500">save resume</code> sequence is sent
              automatically to reduce the chance of inconsistent world data.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
