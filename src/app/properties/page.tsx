'use client';

import { useCallback, useEffect, useState } from 'react';
import { Settings, Save, RotateCcw, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

// ── Schema ────────────────────────────────────────────────────────────────────
interface PropDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: string[];
  group: string;
}

const SCHEMA: PropDef[] = [
  // Server
  { key: 'server-name',        label: 'Server Name',          type: 'text',    group: 'Server'      },
  { key: 'level-name',         label: 'Level Name',           type: 'text',    group: 'Server'      },
  { key: 'gamemode',           label: 'Gamemode',             type: 'select',  options: ['survival', 'creative', 'adventure'], group: 'Server' },
  { key: 'difficulty',         label: 'Difficulty',           type: 'select',  options: ['peaceful', 'easy', 'normal', 'hard'], group: 'Server' },
  { key: 'max-players',        label: 'Max Players',          type: 'number',  group: 'Server'      },
  { key: 'allow-cheats',       label: 'Allow Cheats',         type: 'boolean', group: 'Server'      },
  { key: 'force-gamemode',     label: 'Force Gamemode',       type: 'boolean', group: 'Server'      },
  // Network
  { key: 'server-port',        label: 'Server Port (IPv4)',   type: 'number',  group: 'Network'     },
  { key: 'server-portv6',      label: 'Server Port (IPv6)',   type: 'number',  group: 'Network'     },
  { key: 'online-mode',        label: 'Online Mode',          type: 'boolean', group: 'Network'     },
  { key: 'allow-list',         label: 'Allow List',           type: 'boolean', group: 'Network'     },
  { key: 'enable-lan-visibility', label: 'LAN Visibility',   type: 'boolean', group: 'Network'     },
  // Performance
  { key: 'view-distance',      label: 'View Distance',        type: 'number',  group: 'Performance' },
  { key: 'tick-distance',      label: 'Tick Distance',        type: 'number',  group: 'Performance' },
  { key: 'player-idle-timeout',label: 'Idle Timeout (min)',   type: 'number',  group: 'Performance' },
  { key: 'max-threads',        label: 'Max Threads',          type: 'number',  group: 'Performance' },
];

const GROUPS = ['Server', 'Network', 'Performance'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fieldClass(base: string) {
  return `${base} bg-panel-bg border border-panel-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-colors`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PropertiesPage() {
  const [values, setValues]   = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);

  // ── Load properties ──────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/server/properties');
      const data = await res.json() as { parsed?: Record<string, string>; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      const parsed = data.parsed ?? {};
      setOriginal(parsed);
      // Seed form values for known keys only
      const seed: Record<string, string> = {};
      for (const def of SCHEMA) seed[def.key] = parsed[def.key] ?? '';
      setValues(seed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading properties');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Detect changes ───────────────────────────────────────────────
  const isDirty = SCHEMA.some(({ key }) => values[key] !== (original[key] ?? ''));

  // ── Save ─────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/server/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: values }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setOriginal({ ...original, ...values });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Restart server ───────────────────────────────────────────────
  const restart = async () => {
    setRestarting(true);
    try {
      await fetch('/api/server/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });
    } finally {
      setRestarting(false);
    }
  };

  const set = (key: string, val: string) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-panel-border bg-panel-card/80 backdrop-blur">
        <div className="max-w-4xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-slate-400" />
            <h1 className="text-sm font-semibold text-white">Server Properties</h1>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <CheckCircle className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              onClick={() => void save()}
              disabled={saving || loading || !isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-4">
        {/* Restart notice */}
        {saved && (
          <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
            <p className="text-sm text-yellow-300">
              Changes saved. Restart the server for them to take effect.
            </p>
            <button
              onClick={() => void restart()}
              disabled={restarting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors shrink-0 ml-4"
            >
              {restarting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              Restart Now
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-panel-card rounded-xl border border-panel-border" />
            ))}
          </div>
        )}

        {/* Note */}
        {!loading && (
          <p className="text-xs text-slate-600">
            Note: properties controlled by Docker environment variables will revert to their env
            var value on the next container restart.
          </p>
        )}

        {/* Property groups */}
        {!loading &&
          GROUPS.map((group) => (
            <section
              key={group}
              className="bg-panel-card border border-panel-border rounded-xl p-5"
            >
              <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-4">{group}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SCHEMA.filter((d) => d.group === group).map((def) => (
                  <Field
                    key={def.key}
                    def={def}
                    value={values[def.key] ?? ''}
                    onChange={(v) => set(def.key, v)}
                  />
                ))}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}

// ── Field component ───────────────────────────────────────────────────────────
function Field({
  def,
  value,
  onChange,
}: {
  def: PropDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1.5">
        {def.label}
        <span className="ml-1.5 text-slate-600 font-mono text-[10px]">{def.key}</span>
      </label>

      {def.type === 'boolean' && (
        <button
          type="button"
          onClick={() => onChange(value === 'true' ? 'false' : 'true')}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            value === 'true' ? 'bg-green-600' : 'bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              value === 'true' ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      )}

      {def.type === 'select' && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass('w-full px-3 py-2')}
        >
          {def.options?.map((opt) => (
            <option key={opt} value={opt} className="bg-panel-card">
              {opt}
            </option>
          ))}
        </select>
      )}

      {(def.type === 'text' || def.type === 'number') && (
        <input
          type={def.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass('w-full px-3 py-2')}
        />
      )}
    </div>
  );
}
