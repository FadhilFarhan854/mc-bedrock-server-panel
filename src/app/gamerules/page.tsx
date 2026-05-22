'use client';

import { useEffect, useState } from 'react';
import { Gamepad2, Save, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';

// ── Gamerule definitions ──────────────────────────────────────────
interface GameruleDef {
  key:         string;
  label:       string;
  description: string;
  type:        'boolean' | 'number';
  default:     string;
  min?:        number;
  max?:        number;
  group:       string;
}

const GAMERULES: GameruleDef[] = [
  // Player
  { key: 'keepInventory',             label: 'Keep Inventory on Death',    description: 'Player keeps items and XP when they die',                     type: 'boolean', default: 'false', group: 'Player'  },
  { key: 'doImmediateRespawn',        label: 'Immediate Respawn',           description: 'Skip the death screen, respawn instantly',                     type: 'boolean', default: 'false', group: 'Player'  },
  { key: 'naturalRegeneration',       label: 'Natural Regeneration',        description: 'Players regain health when hunger is full',                    type: 'boolean', default: 'true',  group: 'Player'  },
  { key: 'fallDamage',                label: 'Fall Damage',                 description: 'Players take damage from falling',                             type: 'boolean', default: 'true',  group: 'Player'  },
  { key: 'fireDamage',                label: 'Fire Damage',                 description: 'Players take damage from fire and lava',                       type: 'boolean', default: 'true',  group: 'Player'  },
  { key: 'drowningDamage',            label: 'Drowning Damage',             description: 'Players take damage from drowning',                            type: 'boolean', default: 'true',  group: 'Player'  },
  // World
  { key: 'showcoordinates',           label: 'Show Coordinates in HUD',     description: 'Players can see their XYZ coordinates',                        type: 'boolean', default: 'false', group: 'World'   },
  { key: 'doDaylightCycle',           label: 'Day/Night Cycle',             description: 'Time progresses normally',                                     type: 'boolean', default: 'true',  group: 'World'   },
  { key: 'doWeatherCycle',            label: 'Weather Changes',             description: 'Weather changes over time (rain, thunder)',                    type: 'boolean', default: 'true',  group: 'World'   },
  { key: 'doFireTick',                label: 'Fire Spread',                 description: 'Fire spreads to adjacent flammable blocks',                    type: 'boolean', default: 'true',  group: 'World'   },
  { key: 'randomTickSpeed',           label: 'Random Tick Speed',           description: 'Speed of random block updates, plant growth, etc. (default 1)',type: 'number',  default: '1',     group: 'World', min: 0, max: 4096 },
  { key: 'playerssleepingpercentage', label: 'Sleeping % to Skip Night',    description: 'Percentage of players who must sleep to skip night (0–100)',   type: 'number',  default: '100',   group: 'World', min: 0, max: 100  },
  // Mobs
  { key: 'doMobSpawning',             label: 'Mob Spawning',                description: 'Hostile and passive mobs spawn naturally',                     type: 'boolean', default: 'true',  group: 'Mobs'    },
  { key: 'mobGriefing',               label: 'Mob Griefing',                description: 'Mobs can modify blocks (creeper/ghast explosions, endermen)',  type: 'boolean', default: 'true',  group: 'Mobs'    },
  { key: 'doEntityDrops',             label: 'Entity Drops',                description: 'Mobs drop items when killed',                                  type: 'boolean', default: 'true',  group: 'Mobs'    },
  // Blocks
  { key: 'doTileDrops',               label: 'Block Drops',                 description: 'Blocks drop items when broken',                                type: 'boolean', default: 'true',  group: 'Blocks'  },
  { key: 'tntExplodes',               label: 'TNT Explodes',                description: 'TNT can be lit and explode',                                   type: 'boolean', default: 'true',  group: 'Blocks'  },
];

const GROUPS = ['Player', 'World', 'Mobs', 'Blocks'];
const STORAGE_KEY = 'bedrock_gamerules_v1';

// ── Types ─────────────────────────────────────────────────────────
type Values = Record<string, string>;
type ApplyStatus = Record<string, 'idle' | 'sending' | 'ok' | 'error'>;

// ── Helpers ───────────────────────────────────────────────────────
function loadSaved(): Values {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Values;
  } catch {
    return {};
  }
}

function defaultValues(): Values {
  return Object.fromEntries(GAMERULES.map((r) => [r.key, r.default]));
}

// ── Page ──────────────────────────────────────────────────────────
export default function GamrulesPage() {
  const [values,  setValues]  = useState<Values>({});
  const [status,  setStatus]  = useState<ApplyStatus>({});
  const [applying, setApplying] = useState(false);
  const [globalMsg, setGlobalMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const saved = loadSaved();
    const merged = { ...defaultValues(), ...saved };
    setValues(merged);
  }, []);

  const set = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setGlobalMsg(null);
  };

  // ── Apply all gamerules ──────────────────────────────────────────
  const applyAll = async () => {
    setApplying(true);
    setGlobalMsg(null);

    const newStatus: ApplyStatus = {};
    let anyError = false;

    for (const rule of GAMERULES) {
      const val = values[rule.key] ?? rule.default;
      newStatus[rule.key] = 'sending';
      setStatus({ ...newStatus });

      try {
        const res = await fetch('/api/server/command', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ command: `gamerule ${rule.key} ${val}` }),
        });
        newStatus[rule.key] = res.ok ? 'ok' : 'error';
        if (!res.ok) anyError = true;
      } catch {
        newStatus[rule.key] = 'error';
        anyError = true;
      }

      setStatus({ ...newStatus });
    }

    // Persist to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));

    setApplying(false);
    setGlobalMsg(
      anyError
        ? { type: 'error', text: 'Some gamerules failed — server may not be running.' }
        : { type: 'ok',    text: 'All gamerules applied successfully.' },
    );

    // Clear per-rule status after 4s
    setTimeout(() => setStatus({}), 4_000);
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Gamerules</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Applied via <code className="text-slate-400">gamerule &lt;name&gt; &lt;value&gt;</code> command — server must be running
          </p>
        </div>
        <button
          onClick={applyAll}
          disabled={applying}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          {applying
            ? <><Loader2 className="w-4 h-4 animate-spin" />Applying…</>
            : <><Save className="w-4 h-4" />Apply All</>}
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300 leading-relaxed">
          Gamerules take effect immediately and are saved in world data — they persist across server restarts.
          Last applied values are remembered by your browser.
        </p>
      </div>

      {/* Global feedback */}
      {globalMsg && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
          globalMsg.type === 'ok'
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {globalMsg.type === 'ok'
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {globalMsg.text}
        </div>
      )}

      {/* Gamerule groups */}
      {GROUPS.map((group) => {
        const rules = GAMERULES.filter((r) => r.group === group);
        return (
          <div key={group} className="bg-panel-card rounded-xl border border-panel-border overflow-hidden">
            <div className="px-5 py-3 border-b border-panel-border bg-panel-bg/40">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Gamepad2 className="w-3.5 h-3.5" />
                {group}
              </h2>
            </div>

            <div className="divide-y divide-panel-border/50">
              {rules.map((rule) => {
                const val     = values[rule.key] ?? rule.default;
                const st      = status[rule.key] ?? 'idle';
                const isOn    = val === 'true';

                return (
                  <div key={rule.key} className="flex items-center justify-between px-5 py-4 gap-4 hover:bg-panel-hover/30 transition-colors">
                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{rule.label}</span>
                        {st === 'sending' && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
                        {st === 'ok'      && <CheckCircle className="w-3 h-3 text-green-400" />}
                        {st === 'error'   && <AlertCircle className="w-3 h-3 text-red-400" />}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>
                      <code className="text-xs text-slate-600">{rule.key}</code>
                    </div>

                    {/* Control */}
                    {rule.type === 'boolean' ? (
                      <button
                        onClick={() => set(rule.key, isOn ? 'false' : 'true')}
                        className={`relative w-11 h-6 rounded-full border transition-colors shrink-0 ${
                          isOn
                            ? 'bg-green-500 border-green-400'
                            : 'bg-panel-bg border-panel-border'
                        }`}
                        aria-label={`Toggle ${rule.label}`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                            isOn ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    ) : (
                      <input
                        type="number"
                        min={rule.min}
                        max={rule.max}
                        value={val}
                        onChange={(e) => set(rule.key, e.target.value)}
                        className="w-24 bg-panel-bg border border-panel-border rounded-lg px-3 py-1.5 text-sm text-white text-center focus:outline-none focus:border-green-500/50 shrink-0"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
