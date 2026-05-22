import { NextResponse } from 'next/server';
import { getContainer, execCommand } from '@/lib/docker';
import { createMultiFileTarBuffer } from '@/lib/tar';
import { unzipSync } from 'fflate';

// Increase body size limit for file uploads (up to 200 MB)
export const maxDuration = 120;

// ── Allowed extensions ───────────────────────────────────────────
const ALLOWED_EXTS = new Set(['mcworld', 'mcpack', 'mcaddon', 'mctemplate', 'zip']);

function getExt(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

/** Upload a set of in-memory files directly into the container via tar. */
async function putFiles(
  container: ReturnType<typeof getContainer>,
  files: Record<string, Buffer>,
  destPath: string,
): Promise<void> {
  const tar = createMultiFileTarBuffer(files);
  await new Promise<void>((resolve, reject) => {
    container.putArchive(tar, { path: destPath }, (err: unknown) => {
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve();
    });
  });
}

// ── GET — list worlds and packs ──────────────────────────────────
export async function GET() {
  try {
    const container = getContainer();

    const [worldsRaw, resourceRaw, behaviorRaw] = await Promise.all([
      execCommand(container, [
        'bash', '-c',
        'find /data/worlds -maxdepth 1 -mindepth 1 -type d -exec basename {} \\; 2>/dev/null || true',
      ]).catch(() => ''),
      execCommand(container, [
        'bash', '-c',
        'find /data/resource_packs -maxdepth 1 -mindepth 1 -type d -exec basename {} \\; 2>/dev/null || true',
      ]).catch(() => ''),
      execCommand(container, [
        'bash', '-c',
        'find /data/behavior_packs -maxdepth 1 -mindepth 1 -type d -exec basename {} \\; 2>/dev/null || true',
      ]).catch(() => ''),
    ]);

    const parse = (raw: string) => raw.trim().split('\n').filter(Boolean);

    return NextResponse.json({
      worlds:        parse(worldsRaw),
      resourcePacks: parse(resourceRaw),
      behaviorPacks: parse(behaviorRaw),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST — upload file (raw binary body, metadata via URL params) ──
export async function POST(request: Request) {
  try {
    const url       = new URL(request.url);
    const type      = url.searchParams.get('type') ?? 'world';
    const worldName = (url.searchParams.get('worldName') ?? '').trim();
    const rawFilename = request.headers.get('x-filename');

    if (!rawFilename) {
      return NextResponse.json({ error: 'Missing X-Filename header' }, { status: 400 });
    }

    const filename = decodeURIComponent(rawFilename);
    const ext      = getExt(filename);

    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json(
        { error: `File type ".${ext}" not allowed. Use .mcworld, .mcpack, .mcaddon, .mctemplate, or .zip` },
        { status: 400 },
      );
    }

    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }

    // ── Unzip entirely in Node.js — no shell commands needed ─────
    let unzipped: ReturnType<typeof unzipSync>;
    try {
      unzipped = unzipSync(new Uint8Array(arrayBuffer));
    } catch (e) {
      return NextResponse.json(
        { error: `Cannot unzip file: ${e instanceof Error ? e.message : String(e)}` },
        { status: 400 },
      );
    }

    const allPaths = Object.keys(unzipped);
    const container = getContainer();

    // ── World / template ──────────────────────────────────────────
    if (type === 'world' || ext === 'mcworld' || ext === 'mctemplate') {
      // Find level.dat anywhere in the zip to determine the prefix to strip
      const levelDatPath = allPaths.find((p) => p === 'level.dat' || p.endsWith('/level.dat'));

      if (!levelDatPath) {
        return NextResponse.json(
          { error: 'Invalid world file: level.dat not found inside the archive' },
          { status: 400 },
        );
      }

      // Strip the leading folder (e.g. "MyWorld/level.dat" → prefix = "MyWorld/")
      const prefix = levelDatPath.slice(0, levelDatPath.length - 'level.dat'.length);

      const files: Record<string, Buffer> = {};
      for (const [p, data] of Object.entries(unzipped)) {
        if (prefix && !p.startsWith(prefix)) continue;
        if (p.endsWith('/')) continue; // skip directory entries
        const rel = p.slice(prefix.length);
        if (rel) files[rel] = Buffer.from(data);
      }

      const levelName = worldName
        ? worldName.replace(/[^a-zA-Z0-9 _\-().]/g, '_')
        : 'Uploaded World';

      await putFiles(container, files, `/data/worlds/${levelName}`);
      return NextResponse.json({ success: true, destination: `/data/worlds/${levelName}` });
    }

    // ── Resource / behavior pack ──────────────────────────────────
    const packDir = type === 'behavior' ? 'behavior_packs' : 'resource_packs';

    // Find manifest.json to extract UUID (handles nested or flat zip)
    const manifestPath = allPaths.find((p) => p === 'manifest.json' || p.endsWith('/manifest.json'));

    let uuid = `pack_${Date.now()}`;
    if (manifestPath) {
      try {
        const manifest = JSON.parse(Buffer.from(unzipped[manifestPath]).toString('utf8')) as {
          header?: { uuid?: string };
        };
        if (manifest.header?.uuid) uuid = manifest.header.uuid;
      } catch {
        // fall back to timestamp uuid
      }
    }

    // Strip leading folder if pack is nested inside a subfolder
    const prefix = manifestPath
      ? manifestPath.slice(0, manifestPath.length - 'manifest.json'.length)
      : '';

    const files: Record<string, Buffer> = {};
    for (const [p, data] of Object.entries(unzipped)) {
      if (prefix && !p.startsWith(prefix)) continue;
      if (p.endsWith('/')) continue;
      const rel = p.slice(prefix.length);
      if (rel) files[rel] = Buffer.from(data);
    }

    await putFiles(container, files, `/data/${packDir}/${uuid}`);
    return NextResponse.json({ success: true, destination: `/data/${packDir}/${uuid}` });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE — remove a world or pack directory ────────────────────
export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { type?: string; name?: string };
    const { type, name } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Missing type or name' }, { status: 400 });
    }

    // Block path traversal
    if (/[/\\]/.test(name) || name === '.' || name === '..') {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }

    const dirMap: Record<string, string> = {
      world:    'worlds',
      resource: 'resource_packs',
      behavior: 'behavior_packs',
    };

    const dir = dirMap[type];
    if (!dir) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const container = getContainer();
    await execCommand(container, ['rm', '-rf', `/data/${dir}/${name}`], 15_000);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
