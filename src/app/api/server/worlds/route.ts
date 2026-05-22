import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
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
  const sessionId = randomBytes(8).toString('hex');
  const tmpName   = `upload_${sessionId}`;

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

    const fileBuffer = Buffer.from(await request.arrayBuffer());
    if (fileBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file (0 bytes received)' }, { status: 400 });
    }

    const container  = getContainer();
    const isWorld    = type === 'world' || ext === 'mcworld' || ext === 'mctemplate';
    const levelName  = worldName
      ? worldName.replace(/[^a-zA-Z0-9 _\-().]/g, '_')
      : 'Uploaded World';

    // Where to put the zip and unzip it:
    //   worlds → directly into /data/worlds/<name>/
    //   packs  → /tmp/<sessionId>/ first (need UUID from manifest before final move)
    const uploadDir = isWorld
      ? `/data/worlds/${levelName}`
      : `/tmp/mc_pack_${sessionId}`;

    // ── 1. Create the upload directory ─────────────────────────
    await execCommand(container, ['bash', '-c', `mkdir -p '${uploadDir}'`], 10_000);

    // ── 2. Write file directly into container via exec stdin ────
    // putArchive wraps the payload in a tar archive, which can introduce
    // binary corruption on certain byte patterns. Writing via exec stdin
    // (`cat > file`) sends raw bytes over the hijacked Docker socket with
    // zero encoding: whatever we write is exactly what lands on disk.
    const writeExec = await container.exec({
      Cmd:           ['bash', '-c', `cat > '${uploadDir}/${tmpName}'`],
      AttachStdin:   true,
      AttachStdout:  true,
      AttachStderr:  true,
      Tty:           false,
    });
    const writeStream = await writeExec.start({ hijack: true, stdin: true });

    // Drain demuxed stdout/stderr frames from the container process
    // (cat produces no output; flowing mode discards whatever Docker sends)
    writeStream.resume();

    // Pump fileBuffer → stdin in 64 KB chunks, respecting backpressure
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('File write to container timed out')),
        120_000,
      );
      const done = (e?: Error) => { clearTimeout(timeout); e ? reject(e) : resolve(); };
      writeStream.once('end',   () => done());
      writeStream.once('close', () => done());
      writeStream.once('error', (e: Error) => done(e));

      const CHUNK = 64 * 1024;
      let offset = 0;
      const pump = () => {
        while (offset < fileBuffer.length) {
          const slice = fileBuffer.subarray(offset, offset + CHUNK);
          offset += slice.length;
          if (!writeStream.write(slice) && offset < fileBuffer.length) {
            writeStream.once('drain', pump);
            return;
          }
        }
        writeStream.end(); // EOF → cat exits → Docker closes socket → 'end'
      };
      pump();
    });

    // ── 3. Unzip in place & clean up ───────────────────────────
    let destDir: string;

    if (isWorld) {
      const script =
        // Verify the uploaded file arrived intact
        `ACTUAL=$(stat -c%s '${uploadDir}/${tmpName}'); ` +
        `[ "$ACTUAL" != "${fileBuffer.byteLength}" ] && ` +
        `  echo "Upload corrupted: got $ACTUAL bytes, expected ${fileBuffer.byteLength}" && exit 1; ` +
        // Unzip directly into the world directory
        `unzip -o '${uploadDir}/${tmpName}' -d '${uploadDir}'; RC=$?; ` +
        `rm -f '${uploadDir}/${tmpName}'; ` +
        `[ "$RC" -gt 1 ] && echo "unzip failed (exit $RC)" && exit 1; ` +
        // If the zip had a top-level folder, flatten it
        `LEVELDAT=$(find '${uploadDir}' -name 'level.dat' -maxdepth 3 | head -1); ` +
        `[ -z "$LEVELDAT" ] && echo "level.dat not found in archive" && exit 1; ` +
        `LEVELDIR=$(dirname "$LEVELDAT"); ` +
        `if [ "$LEVELDIR" != '${uploadDir}' ]; then ` +
        `  cp -r "$LEVELDIR/." '${uploadDir}/' && rm -rf "$LEVELDIR"; ` +
        `fi; ` +
        `echo "__DONE__"`;

      const out = await execCommand(container, ['bash', '-c', script], 90_000);
      if (!out.includes('__DONE__')) {
        throw new Error(out.trim() || 'World extraction failed inside container');
      }
      destDir = uploadDir;

    } else {
      const packDir = type === 'behavior' ? 'behavior_packs' : 'resource_packs';
      const script =
        `ACTUAL=$(stat -c%s '${uploadDir}/${tmpName}'); ` +
        `[ "$ACTUAL" != "${fileBuffer.byteLength}" ] && ` +
        `  echo "Upload corrupted: got $ACTUAL bytes, expected ${fileBuffer.byteLength}" && exit 1; ` +
        `unzip -o '${uploadDir}/${tmpName}' -d '${uploadDir}'; RC=$?; ` +
        `rm -f '${uploadDir}/${tmpName}'; ` +
        `[ "$RC" -gt 1 ] && echo "unzip failed (exit $RC)" && exit 1; ` +
        `MANIFEST=$(find '${uploadDir}' -name 'manifest.json' -maxdepth 3 | head -1); ` +
        `[ -z "$MANIFEST" ] && echo "manifest.json not found" && exit 1; ` +
        `UUID=$(jq -r '.header.uuid // empty' "$MANIFEST" 2>/dev/null); ` +
        `[ -z "$UUID" ] && UUID="pack_$(date +%s)"; ` +
        `MANIFESTDIR=$(dirname "$MANIFEST"); ` +
        `FINAL="/data/${packDir}/$UUID"; ` +
        `mkdir -p "$FINAL" && cp -r "$MANIFESTDIR/." "$FINAL/" && rm -rf '${uploadDir}'; ` +
        `echo "UUID:$UUID" && echo "__DONE__"`;

      const out = await execCommand(container, ['bash', '-c', script], 90_000);
      if (!out.includes('__DONE__')) {
        // Clean up temp dir on failure
        await execCommand(container, ['bash', '-c', `rm -rf '${uploadDir}' 2>/dev/null || true`]).catch(() => null);
        throw new Error(out.trim() || 'Pack extraction failed inside container');
      }
      const uuidMatch = /UUID:(.+)/.exec(out);
      const uuid = uuidMatch ? uuidMatch[1].trim() : `pack_${Date.now()}`;
      destDir = `/data/${packDir}/${uuid}`;
    }

    return NextResponse.json({ success: true, destination: destDir });

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
