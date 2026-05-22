import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { pack as tarPack } from 'tar-stream';
import { getContainer, execCommand } from '@/lib/docker';

// Increase body size limit for file uploads (up to 512 MB)
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
  const sessionId  = randomBytes(8).toString('hex');
  const uploadName = `mc_upload_${sessionId}`;
  const extractDir = `/tmp/mc_extract_${sessionId}`;

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

    // Validate body
    const fileBuffer = Buffer.from(await request.arrayBuffer());
    if (fileBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file (0 bytes received)' }, { status: 400 });
    }

    // ── Upload file into container /tmp via putArchive ───────────
    // Key ordering: start putArchive FIRST (which begins consuming the pack
    // stream), then write the file buffer into the tar entry.
    // This prevents backpressure deadlock for large files: if we wrote the
    // buffer before putArchive started reading, the stream's internal buffer
    // would fill up and block the write indefinitely.
    // Using fileBuffer.byteLength (not Content-Length) guarantees the tar
    // entry size matches exactly — avoiding tar-stream's "Size mismatch" error.
    const container = getContainer();
    const pack = tarPack();
    const tarEntry = pack.entry({ name: uploadName, size: fileBuffer.byteLength });

    const putPromise = new Promise<void>((resolve, reject) => {
      container.putArchive(pack, { path: '/tmp' }, (err: unknown) => {
        if (err) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve();
      });
    });

    tarEntry.end(fileBuffer);  // non-blocking: putArchive is already consuming
    pack.finalize();
    await putPromise;

    try {
      if (type === 'world' || ext === 'mcworld' || ext === 'mctemplate') {
        // ── World: extract inside container, find level.dat, copy to destination ──
        const levelName = worldName
          ? worldName.replace(/[^a-zA-Z0-9 _\-().]/g, '_')
          : 'Uploaded World';
        const destDir = `/data/worlds/${levelName}`;

        const script =
          `mkdir -p '${extractDir}' && ` +
          `unzip -o '/tmp/${uploadName}' -d '${extractDir}'; RC=$?; ` +
          `[ "$RC" -gt 1 ] && echo "unzip failed (exit $RC)" && exit 1; ` +
          `LEVELDAT=$(find '${extractDir}' -name 'level.dat' -maxdepth 3 | head -1); ` +
          `[ -z "$LEVELDAT" ] && echo "level.dat not found in archive" && exit 1; ` +
          `WORLDDIR=$(dirname "$LEVELDAT"); ` +
          `mkdir -p '${destDir}' && ` +
          `cp -r "$WORLDDIR/." '${destDir}/' && ` +
          `echo "__DONE__"`;

        const worldOut = await execCommand(container, ['bash', '-c', script], 90_000);
        if (!worldOut.includes('__DONE__')) {
          throw new Error(worldOut.trim() || 'Extraction failed inside container');
        }
        return NextResponse.json({ success: true, destination: destDir });

      } else {
        // ── Pack: extract inside container, read UUID from manifest.json via jq ──
        const packDir = type === 'behavior' ? 'behavior_packs' : 'resource_packs';

        const script =
          `mkdir -p '${extractDir}' && ` +
          `unzip -o '/tmp/${uploadName}' -d '${extractDir}'; RC=$?; ` +
          `[ "$RC" -gt 1 ] && echo "unzip failed (exit $RC)" && exit 1; ` +
          `MANIFEST=$(find '${extractDir}' -name 'manifest.json' -maxdepth 3 | head -1); ` +
          `[ -z "$MANIFEST" ] && echo "manifest.json not found" && exit 1; ` +
          `UUID=$(jq -r '.header.uuid // empty' "$MANIFEST" 2>/dev/null); ` +
          `[ -z "$UUID" ] && UUID="pack_$(date +%s)"; ` +
          `PACKDIR=$(dirname "$MANIFEST"); ` +
          `mkdir -p "/data/${packDir}/$UUID" && ` +
          `cp -r "$PACKDIR/." "/data/${packDir}/$UUID/" && ` +
          `echo "UUID:$UUID" && echo "__DONE__"`;

        const packOut = await execCommand(container, ['bash', '-c', script], 90_000);
        if (!packOut.includes('__DONE__')) {
          throw new Error(packOut.trim() || 'Pack extraction failed inside container');
        }
        const uuidMatch = /UUID:(.+)/.exec(packOut);
        const uuid = uuidMatch ? uuidMatch[1].trim() : `pack_${Date.now()}`;
        return NextResponse.json({ success: true, destination: `/data/${packDir}/${uuid}` });
      }
    } finally {
      // Cleanup temp files inside the container
      await execCommand(container, [
        'bash', '-c',
        `rm -rf '/tmp/${uploadName}' '${extractDir}' 2>/dev/null || true`,
      ]).catch(() => null);
    }

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
