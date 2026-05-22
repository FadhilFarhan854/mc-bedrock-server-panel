'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Globe, Package, Cpu, UploadCloud, Trash2,
  RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────
interface WorldsData {
  worlds:        string[];
  resourcePacks: string[];
  behaviorPacks: string[];
}

type UploadType = 'world' | 'resource' | 'behavior';

interface SectionUploadState {
  file:       File | null;
  worldName:  string;
  uploading:  boolean;
  error:      string;
  success:    string;
}

// ── Helpers ──────────────────────────────────────────────────────
const ALLOWED = '.mcworld,.mcpack,.mcaddon,.mctemplate,.zip';

// Packs that ship with the Bedrock Dedicated Server (built-in / default)
const BUILTIN_PACK_RE = /^(vanilla|editor|chemistry|experimental_)/i;
function isBuiltinPack(name: string): boolean {
  return BUILTIN_PACK_RE.test(name);
}

function freshUpload(): SectionUploadState {
  return { file: null, worldName: '', uploading: false, error: '', success: '' };
}

// ── Sub-components ───────────────────────────────────────────────
function SectionHeader({
  icon: Icon, label, count, accent,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-8 h-8 ${accent} rounded-lg flex items-center justify-center border border-current/20`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-white">{label}</h2>
        <p className="text-xs text-slate-500">{count} installed</p>
      </div>
    </div>
  );
}

function ItemRow({
  name,
  onDelete,
  deleting,
}: {
  name: string;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-panel-hover/50 group">
      <span className="text-sm text-slate-300 font-mono truncate flex-1 mr-2">{name}</span>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
      >
        {deleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        Delete
      </button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
export default function WorldsPage() {
  const [data,       setData]       = useState<WorldsData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Per-section upload state
  const [uploads, setUploads] = useState<Record<UploadType, SectionUploadState>>({
    world:    freshUpload(),
    resource: freshUpload(),
    behavior: freshUpload(),
  });

  // Per-section upload form visibility
  const [showForm, setShowForm] = useState<Record<UploadType, boolean>>({
    world: false, resource: false, behavior: false,
  });

  // Deleting item tracking: `${type}:${name}`
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  // Show built-in packs toggle per section
  const [showBuiltin, setShowBuiltin] = useState<Record<'resource' | 'behavior', boolean>>({
    resource: false,
    behavior: false,
  });

  // File input refs
  const fileRefs = {
    world:    useRef<HTMLInputElement>(null),
    resource: useRef<HTMLInputElement>(null),
    behavior: useRef<HTMLInputElement>(null),
  };

  // ── Data loading ───────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch('/api/server/worlds');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  // ── Upload handler ─────────────────────────────────────────────
  const handleUpload = async (type: UploadType) => {
    const state = uploads[type];
    if (!state.file) return;

    setUploads((prev) => ({
      ...prev,
      [type]: { ...prev[type], uploading: true, error: '', success: '' },
    }));

    try {
      // Build URL params (avoid FormData — Next.js App Router has parsing issues with multipart)
      const params = new URLSearchParams({ type });
      if (type === 'world' && state.worldName) {
        params.set('worldName', state.worldName);
      }

      const res = await fetch(`/api/server/worlds?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Filename': encodeURIComponent(state.file.name),
        },
        body: state.file,   // send raw binary — no FormData parsing needed
      });
      const json = (await res.json()) as { success?: boolean; error?: string; destination?: string };

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Upload failed');
      }

      setUploads((prev) => ({
        ...prev,
        [type]: { ...freshUpload(), success: `Uploaded → ${json.destination ?? 'container'}` },
      }));
      if (fileRefs[type].current) fileRefs[type].current!.value = '';
      setShowForm((prev) => ({ ...prev, [type]: false }));
      void loadData();
    } catch (e) {
      setUploads((prev) => ({
        ...prev,
        [type]: { ...prev[type], uploading: false, error: e instanceof Error ? e.message : String(e) },
      }));
    }
  };

  // ── Delete handler ─────────────────────────────────────────────
  const handleDelete = async (type: UploadType, name: string) => {
    const key = `${type}:${name}`;
    setDeleting((prev) => new Set([...prev, key]));
    try {
      await fetch('/api/server/worlds', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type, name }),
      });
      void loadData();
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  // ── Upload form renderer ───────────────────────────────────────
  const renderUploadForm = (type: UploadType, accept: string) => {
    const state = uploads[type];
    const open  = showForm[type];

    return (
      <div className="mt-4">
        <button
          onClick={() => setShowForm((prev) => ({ ...prev, [type]: !prev[type] }))}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-panel-border text-slate-400 hover:text-white hover:bg-panel-hover transition-colors"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          Upload file
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {open && (
          <div className="mt-3 p-4 bg-panel-bg rounded-xl border border-panel-border space-y-3">
            {/* File picker */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">File ({accept})</label>
              <input
                ref={fileRefs[type]}
                type="file"
                accept={accept}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setUploads((prev) => ({
                    ...prev,
                    [type]: { ...prev[type], file: f, error: '', success: '' },
                  }));
                }}
                className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-panel-border file:bg-panel-card file:text-slate-300 file:text-xs hover:file:bg-panel-hover file:transition-colors cursor-pointer"
              />
            </div>

            {/* World name field (world uploads only) */}
            {type === 'world' && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">World folder name</label>
                <input
                  type="text"
                  placeholder="e.g. My World"
                  value={state.worldName}
                  onChange={(e) =>
                    setUploads((prev) => ({
                      ...prev,
                      world: { ...prev.world, worldName: e.target.value },
                    }))
                  }
                  className="w-full bg-panel-card border border-panel-border rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
                />
                <p className="text-xs text-slate-600 mt-1">Leave blank to use "Uploaded World"</p>
              </div>
            )}

            {/* Feedback */}
            {state.error && (
              <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-400">{state.error}</p>
              </div>
            )}
            {state.success && (
              <div className="flex items-start gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                <p className="text-xs text-green-400">{state.success}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={() => handleUpload(type)}
              disabled={!state.file || state.uploading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              {state.uploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Uploading & extracting…
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" />
                  Upload
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Worlds &amp; Packs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Upload worlds and content packs into the running container</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-panel-border text-slate-400 hover:text-white hover:bg-panel-hover transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{fetchError}</p>
        </div>
      )}

      {/* Skeleton loading */}
      {loading && !data && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-panel-card rounded-xl border border-panel-border animate-pulse" />
          ))}
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* ── Worlds ── */}
          <div className="bg-panel-card rounded-xl border border-panel-border p-5">
            <SectionHeader
              icon={Globe}
              label="Worlds"
              count={data.worlds.length}
              accent="bg-blue-500/10 text-blue-400"
            />

            {data.worlds.length === 0 ? (
              <p className="text-xs text-slate-600 py-2">No worlds found in /data/worlds</p>
            ) : (
              <div className="divide-y divide-panel-border/50">
                {data.worlds.map((name) => (
                  <ItemRow
                    key={name}
                    name={name}
                    onDelete={() => handleDelete('world', name)}
                    deleting={deleting.has(`world:${name}`)}
                  />
                ))}
              </div>
            )}

            {renderUploadForm('world', '.mcworld,.mctemplate,.zip')}

            <p className="mt-3 text-xs text-slate-600">
              Accepts <code className="text-slate-500">.mcworld</code>,{' '}
              <code className="text-slate-500">.mctemplate</code> — extracted to{' '}
              <code className="text-slate-500">/data/worlds/&lt;name&gt;</code>
            </p>
          </div>

          {/* ── Resource Packs ── */}
          <div className="bg-panel-card rounded-xl border border-panel-border p-5">
            {(() => {
              const userPacks    = data.resourcePacks.filter((n) => !isBuiltinPack(n));
              const builtinPacks = data.resourcePacks.filter(isBuiltinPack);
              return (
                <>
                  <SectionHeader
                    icon={Package}
                    label="Resource Packs"
                    count={userPacks.length}
                    accent="bg-green-500/10 text-green-400"
                  />

                  {userPacks.length === 0 ? (
                    <p className="text-xs text-slate-600 py-2">No user-uploaded resource packs</p>
                  ) : (
                    <div className="divide-y divide-panel-border/50">
                      {userPacks.map((name) => (
                        <ItemRow
                          key={name}
                          name={name}
                          onDelete={() => handleDelete('resource', name)}
                          deleting={deleting.has(`resource:${name}`)}
                        />
                      ))}
                    </div>
                  )}

                  {builtinPacks.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowBuiltin((prev) => ({ ...prev, resource: !prev.resource }))}
                        className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
                      >
                        {showBuiltin.resource ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {showBuiltin.resource ? 'Hide' : `Show ${builtinPacks.length} built-in`} packs
                      </button>
                      {showBuiltin.resource && (
                        <div className="divide-y divide-panel-border/50 mt-2 opacity-40">
                          {builtinPacks.map((name) => (
                            <div key={name} className="py-2 px-3">
                              <span className="text-sm text-slate-500 font-mono">{name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {renderUploadForm('resource', '.mcpack,.mcaddon,.zip')}

            <p className="mt-3 text-xs text-slate-600">
              Accepts <code className="text-slate-500">.mcpack</code>,{' '}
              <code className="text-slate-500">.mcaddon</code> — extracted to{' '}
              <code className="text-slate-500">/data/resource_packs/&lt;uuid&gt;</code>
            </p>
          </div>

          {/* ── Behavior Packs ── */}
          <div className="bg-panel-card rounded-xl border border-panel-border p-5">
            {(() => {
              const userPacks    = data.behaviorPacks.filter((n) => !isBuiltinPack(n));
              const builtinPacks = data.behaviorPacks.filter(isBuiltinPack);
              return (
                <>
                  <SectionHeader
                    icon={Cpu}
                    label="Behavior Packs"
                    count={userPacks.length}
                    accent="bg-purple-500/10 text-purple-400"
                  />

                  {userPacks.length === 0 ? (
                    <p className="text-xs text-slate-600 py-2">No user-uploaded behavior packs</p>
                  ) : (
                    <div className="divide-y divide-panel-border/50">
                      {userPacks.map((name) => (
                        <ItemRow
                          key={name}
                          name={name}
                          onDelete={() => handleDelete('behavior', name)}
                          deleting={deleting.has(`behavior:${name}`)}
                        />
                      ))}
                    </div>
                  )}

                  {builtinPacks.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowBuiltin((prev) => ({ ...prev, behavior: !prev.behavior }))}
                        className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
                      >
                        {showBuiltin.behavior ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {showBuiltin.behavior ? 'Hide' : `Show ${builtinPacks.length} built-in`} packs
                      </button>
                      {showBuiltin.behavior && (
                        <div className="divide-y divide-panel-border/50 mt-2 opacity-40">
                          {builtinPacks.map((name) => (
                            <div key={name} className="py-2 px-3">
                              <span className="text-sm text-slate-500 font-mono">{name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {renderUploadForm('behavior', '.mcpack,.mcaddon,.zip')}

            <p className="mt-3 text-xs text-slate-600">
              Accepts <code className="text-slate-500">.mcpack</code>,{' '}
              <code className="text-slate-500">.mcaddon</code> — extracted to{' '}
              <code className="text-slate-500">/data/behavior_packs/&lt;uuid&gt;</code>
            </p>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
        <p className="text-xs text-yellow-400/80 leading-relaxed">
          <strong className="text-yellow-400">Note:</strong> Uploading a world does not automatically change{' '}
          <code>level-name</code> in server.properties. Set it in the{' '}
          <a href="/properties" className="underline hover:text-yellow-300">Properties</a> page and restart to activate the uploaded world.
        </p>
      </div>
    </div>
  );
}
