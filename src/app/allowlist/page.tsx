'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Users,
} from 'lucide-react';
import type { AllowlistPlayer } from '@/app/api/server/allowlist/route';

interface AllowlistData {
  players: AllowlistPlayer[];
  enabled: boolean;
}

export default function AllowlistPage() {
  const [data, setData] = useState<AllowlistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-player form state
  const [name, setName] = useState('');
  const [xuid, setXuid] = useState('');
  const [ignoresLimit, setIgnoresLimit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Per-row remove loading
  const [removing, setRemoving] = useState<string | null>(null);

  // Toggle loading
  const [toggling, setToggling] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/server/allowlist');
      const json = (await res.json()) as AllowlistData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Toggle allow-list on/off ────────────────────────────────────
  const toggle = async () => {
    if (!data) return;
    setToggling(true);
    try {
      const res = await fetch('/api/server/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: { 'allow-list': data.enabled ? 'false' : 'true' } }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      setData((prev) => prev ? { ...prev, enabled: !prev.enabled } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setToggling(false);
    }
  };

  // ── Add player ─────────────────────────────────────────────────
  const addPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/server/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), xuid: xuid.trim() || undefined, ignoresPlayerLimit: ignoresLimit }),
      });
      const json = (await res.json()) as { players?: AllowlistPlayer[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to add');
      setData((prev) => prev ? { ...prev, players: json.players ?? prev.players } : prev);
      setName('');
      setXuid('');
      setIgnoresLimit(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setAdding(false);
    }
  };

  // ── Remove player ──────────────────────────────────────────────
  const removePlayer = async (playerName: string) => {
    setRemoving(playerName);
    try {
      const res = await fetch('/api/server/allowlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName }),
      });
      const json = (await res.json()) as { players?: AllowlistPlayer[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to remove');
      setData((prev) => prev ? { ...prev, players: json.players ?? prev.players } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setRemoving(null);
    }
  };

  const inputClass =
    'bg-panel-bg border border-panel-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-colors';

  return (
    <div className="min-h-screen">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-panel-border bg-panel-card/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-slate-400" />
            <h1 className="text-sm font-semibold text-white">Allow List</h1>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="p-1.5 rounded-lg border border-panel-border hover:bg-panel-hover text-slate-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && !data && (
          <div className="space-y-4 animate-pulse">
            <div className="h-16 bg-panel-card rounded-xl border border-panel-border" />
            <div className="h-28 bg-panel-card rounded-xl border border-panel-border" />
            <div className="h-48 bg-panel-card rounded-xl border border-panel-border" />
          </div>
        )}

        {data && (
          <>
            {/* ── Status card ── */}
            <div className="bg-panel-card border border-panel-border rounded-xl px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {data.enabled ? (
                  <ShieldCheck className="w-5 h-5 text-green-400" />
                ) : (
                  <ShieldOff className="w-5 h-5 text-slate-500" />
                )}
                <div>
                  <p className="text-sm font-medium text-white">
                    Allow List is{' '}
                    <span className={data.enabled ? 'text-green-400' : 'text-slate-500'}>
                      {data.enabled ? 'ON' : 'OFF'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {data.enabled
                      ? 'Only listed players can join the server.'
                      : 'All players can join. Enable to restrict access.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void toggle()}
                disabled={toggling}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  data.enabled
                    ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                    : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'
                } disabled:opacity-40`}
              >
                {toggling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : data.enabled ? (
                  <ShieldOff className="w-3.5 h-3.5" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                {data.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>

            {/* ── Add player form ── */}
            <div className="bg-panel-card border border-panel-border rounded-xl p-5">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-4">
                Add Player
              </p>
              <form onSubmit={(e) => void addPlayer(e)} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">
                      Player Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Steve"
                      required
                      className={`w-full ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">
                      XUID{' '}
                      <span className="text-slate-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={xuid}
                      onChange={(e) => setXuid(e.target.value)}
                      placeholder="e.g. 2535416396512342"
                      className={`w-full ${inputClass}`}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={ignoresLimit}
                    onChange={(e) => setIgnoresLimit(e.target.checked)}
                    className="w-4 h-4 rounded accent-green-500"
                  />
                  <span className="text-xs text-slate-400">
                    Ignores player limit (can join when server is full)
                  </span>
                </label>

                {addError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {addError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={adding || !name.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {adding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  Add to Allowlist
                </button>
              </form>
            </div>

            {/* ── Player list ── */}
            <div className="bg-panel-card border border-panel-border rounded-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-panel-border">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <p className="text-xs text-slate-500 uppercase tracking-widest">
                    Players
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400 bg-panel-bg border border-panel-border px-2 py-0.5 rounded-full">
                  {data.players.length}
                </span>
              </div>

              {data.players.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-600 text-sm">
                  No players in the allowlist yet.
                </div>
              ) : (
                <ul className="divide-y divide-panel-border">
                  {data.players.map((player) => (
                    <li
                      key={player.name}
                      className="flex items-center justify-between px-5 py-3 hover:bg-panel-hover/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">{player.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {player.xuid && (
                            <span className="text-[11px] text-slate-500 font-mono">
                              XUID: {player.xuid}
                            </span>
                          )}
                          {player.ignoresPlayerLimit && (
                            <span className="text-[11px] text-yellow-500/80">
                              Bypasses limit
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => void removePlayer(player.name)}
                        disabled={removing === player.name}
                        className="ml-3 shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                        title={`Remove ${player.name}`}
                      >
                        {removing === player.name ? (
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

            {/* Note */}
            <p className="text-xs text-slate-600">
              Changes are applied immediately via{' '}
              <code className="font-mono text-slate-500">allowlist reload</code> without
              requiring a server restart.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
