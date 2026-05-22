import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { getContainer, execCommand } from '@/lib/docker';
import { createMultiFileTarBuffer } from '@/lib/tar';

const execFileAsync = promisify(execFile);

// Increase body size limit for file uploads (up to 200 MB)
export const maxDuration = 120;

// ── Allowed extensions ───────────────────────────────────────────
const ALLOWED_EXTS = new Set(['mcworld', 'mcpack', 'mcaddon', 'mctemplate', 'zip']);

function getExt(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

/** Recursively read all files under a directory into a path→Buffer map. */
async function readDirRecursive(
  dir: string,
  base: string,
): Promise<Record<string, Buffer>> {
  const result: Record<string, Buffer> = {};
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, await readDirRecursive(full, base));
    } else if (entry.isFile()) {
      // relative path with forward slashes
      const rel = full.slice(base.length).replace(/^[\\/]/, '').replace(/\\/g, '/');
      if (rel) result[rel] = await readFile(full);
    }
  }
  return result;
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
  const sessionId = randomBytes(8).toString('hex');
  const tmpFile   = `/tmp/mc_upload_${sessionId}`;
  const tmpDir    = `/tmp/mc_extract_${sessionId}`;

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

    // Read raw binary body
    const fileBuffer = Buffer.from(await request.arrayBuffer());
    if (fileBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file (0 bytes received)' }, { status: 400 });
    }

    // ── Save to temp file on server, extract with system unzip ───
    // System unzip handles all ZIP variants including .mcworld regardless of magic bytes
    await writeFile(tmpFile, fileBuffer);

    try {
      await execFileAsync('unzip', ['-o', tmpFile, '-d', tmpDir]);
    } catch (e) {
      // unzip exits 1 for warnings (still extracted OK), >=2 is real error
      const code = (e as NodeJS.ErrnoException & { code?: number }).code;
      if (typeof code === 'number' && code >= 2) {
        return NextResponse.json(
          { error: `Extraction failed (unzip exit ${code}): ${(e as Error).message}` },
          { status: 400 },
        );
      }
      // code 1 = warnings only — extraction succeeded, continue
    }

    // Read all extracted files
    const allFiles = await readDirRecursive(tmpDir, tmpDir);
    const allPaths = Object.keys(allFiles);

    if (allPaths.length === 0) {
      return NextResponse.json({ error: 'Archive is empty or extraction produced no files' }, { status: 400 });
    }

    const container = getContainer();

    // ── World / template ──────────────────────────────────────────
    if (type === 'world' || ext === 'mcworld' || ext === 'mctemplate') {
      const levelDatPath = allPaths.find((p) => p === 'level.dat' || p.endsWith('/level.dat'));

      if (!levelDatPath) {
        return NextResponse.json(
          { error: 'Invalid world file: level.dat not found. Files found: ' + allPaths.slice(0, 10).join(', ') },
          { status: 400 },
        );
      }

      // Strip leading folder prefix (e.g. "MyWorld/level.dat" → prefix "MyWorld/")
      const prefix = levelDatPath.slice(0, levelDatPath.length - 'level.dat'.length);

      const files: Record<string, Buffer> = {};
      for (const [p, data] of Object.entries(allFiles)) {
        if (prefix && !p.startsWith(prefix)) continue;
        const rel = p.slice(prefix.length);
        if (rel) files[rel] = data;
      }

      const levelName = worldName
        ? worldName.replace(/[^a-zA-Z0-9 _\-().]/g, '_')
        : 'Uploaded World';

      await putFiles(container, files, `/data/worlds/${levelName}`);
      return NextResponse.json({ success: true, destination: `/data/worlds/${levelName}` });
    }

    // ── Resource / behavior pack ──────────────────────────────────
    const packDir = type === 'behavior' ? 'behavior_packs' : 'resource_packs';

    const manifestPath = allPaths.find((p) => p === 'manifest.json' || p.endsWith('/manifest.json'));

    let uuid = `pack_${Date.now()}`;
    if (manifestPath) {
      try {
        const manifest = JSON.parse(allFiles[manifestPath].toString('utf8')) as {
          header?: { uuid?: string };
        };
        if (manifest.header?.uuid) uuid = manifest.header.uuid;
      } catch { /* fall back to timestamp uuid */ }
    }

    const prefix = manifestPath
      ? manifestPath.slice(0, manifestPath.length - 'manifest.json'.length)
      : '';

    const files: Record<string, Buffer> = {};
    for (const [p, data] of Object.entries(allFiles)) {
      if (prefix && !p.startsWith(prefix)) continue;
      const rel = p.slice(prefix.length);
      if (rel) files[rel] = data;
    }

    await putFiles(container, files, `/data/${packDir}/${uuid}`);
    return NextResponse.json({ success: true, destination: `/data/${packDir}/${uuid}` });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    // Always clean up temp files
    await rm(tmpFile, { force: true }).catch(() => null);
    await rm(tmpDir,  { recursive: true, force: true }).catch(() => null);
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
