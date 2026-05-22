import { NextResponse } from 'next/server';
import { getContainer, execCommand } from '@/lib/docker';
import { createTarBuffer } from '@/lib/tar';

// Increase body size limit for file uploads (up to 200 MB)
export const maxDuration = 120;

// ── Allowed extensions ───────────────────────────────────────────
const ALLOWED_EXTS = new Set(['mcworld', 'mcpack', 'mcaddon', 'mctemplate', 'zip']);

function getExt(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
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
    const type      = url.searchParams.get('type') ?? 'world';        // 'world' | 'resource' | 'behavior'
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

    // Sanitize filename: strip path separators
    const safeFilename = filename.replace(/[/\\]/g, '_');

    // Read raw binary body
    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }
    const fileBuffer = Buffer.from(arrayBuffer);
    const tarBuffer  = createTarBuffer(safeFilename, fileBuffer);

    const container = getContainer();

    // Upload file into container's /tmp via Docker Archive API
    await new Promise<void>((resolve, reject) => {
      container.putArchive(tarBuffer, { path: '/tmp' }, (err: unknown) => {
        if (err) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve();
      });
    });

    const tempPath = `/tmp/${safeFilename}`;

    // ── World / template extraction ──
    if (type === 'world' || ext === 'mcworld' || ext === 'mctemplate') {
      const levelName = worldName
        ? worldName.replace(/[^a-zA-Z0-9 _\-().]/g, '_')
        : 'Uploaded World';

      const output = await execCommand(
        container,
        [
          'bash', '-c',
          // 1. Clean up any stale temp dir from a previous failed run
          `rm -rf /tmp/mc_world_extract; ` +
          `mkdir -p /tmp/mc_world_extract; ` +
          // 2. Extract the .mcworld (it's just a zip)
          `unzip -o "${tempPath}" -d /tmp/mc_world_extract/; ` +
          `if [ $? -ne 0 ]; then echo "UNZIP_FAILED"; exit 1; fi; ` +
          // 3. Detect structure: flat (level.dat at root) vs nested (level.dat inside a subfolder)
          `SRCDIR=/tmp/mc_world_extract; ` +
          `SUBDIR=$(find /tmp/mc_world_extract -maxdepth 1 -mindepth 1 -type d 2>/dev/null | head -1); ` +
          `if [ -n "$SUBDIR" ] && [ -f "$SUBDIR/level.dat" ]; then SRCDIR=$SUBDIR; fi; ` +
          // 4. Copy world files (use /. to include hidden files)
          `mkdir -p "/data/worlds/${levelName}"; ` +
          `cp -rf "$SRCDIR/." "/data/worlds/${levelName}/"; ` +
          `rm -rf /tmp/mc_world_extract "${tempPath}"; ` +
          `echo __done__`,
        ],
        60_000,
      );

      if (!output.includes('__done__')) {
        const detail = output.includes('UNZIP_FAILED')
          ? 'unzip failed — file may be corrupted or not a valid .mcworld'
          : output.trim() || 'no output from container';
        return NextResponse.json({ error: 'World extraction failed', detail }, { status: 500 });
      }

      return NextResponse.json({ success: true, destination: `/data/worlds/${levelName}` });
    }

    // ── Resource / behavior pack extraction ──
    const packDir =
      type === 'behavior'
        ? 'behavior_packs'
        : 'resource_packs';

    const output = await execCommand(
      container,
      [
        'bash', '-c',
        `set -e && ` +
        `mkdir -p /tmp/mc_pack_extract && ` +
        `unzip -o "${tempPath}" -d /tmp/mc_pack_extract/ && ` +
        // Try to read UUID from manifest.json; fall back to timestamp
        `UUID=$(python3 -c "import json,sys; d=json.load(open('/tmp/mc_pack_extract/manifest.json')); print(d['header']['uuid'])" 2>/dev/null || date +%s) && ` +
        `mkdir -p "/data/${packDir}/$UUID" && ` +
        `cp -rf /tmp/mc_pack_extract/* "/data/${packDir}/$UUID/" && ` +
        `rm -rf /tmp/mc_pack_extract "${tempPath}" && ` +
        `echo "__done__:$UUID"`,
      ],
      60_000,
    );

    if (!output.includes('__done__')) {
      return NextResponse.json({ error: 'Pack extraction failed', detail: output }, { status: 500 });
    }

    const uuid = output.split('__done__:')[1]?.trim() ?? '';
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
