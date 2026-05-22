import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
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

    // ── Body reading ────────────────────────────────────────────
    // Use getReader() streaming instead of request.arrayBuffer() to avoid
    // Next.js's internal body-size limit (which can silently truncate large
    // binary uploads and produce "End-of-central-directory not found" errors).
    const declaredSize = parseInt(request.headers.get('content-length') ?? '0', 10);
    const chunks: Buffer[] = [];
    const reader = request.body!.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      }
    } finally {
      reader.releaseLock();
    }
    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file (0 bytes received)' }, { status: 400 });
    }

    // Detect silent body truncation before doing any Docker work
    if (declaredSize > 0 && fileBuffer.byteLength !== declaredSize) {
      return NextResponse.json(
        { error: `Upload body truncated: server received ${fileBuffer.byteLength} bytes but file is ${declaredSize} bytes. Check Next.js/nginx body-size limits.` },
        { status: 400 },
      );
    }

    // Validate ZIP magic bytes (PK\x03\x04) before doing anything else.
    const magic = fileBuffer.subarray(0, 4).toString('hex');
    if (magic !== '504b0304') {
      return NextResponse.json(
        { error: `File is not a valid ZIP archive (header bytes: ${magic}, expected 504b0304). Try re-exporting the world from Minecraft.` },
        { status: 400 },
      );
    }

    // SHA-256 of the received buffer — verified in-container after writing
    const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

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

    // ── 2. Write file into container via exec stdin (base64 encoded) ──
    // Encoding the payload as base64 before transmission makes the transfer
    // immune to any byte-level encoding transformations (CR/LF conversion,
    // null-byte stripping, etc.) that may occur over the Docker exec socket.
    // `base64 -d` inside the container decodes back to the original bytes.
    // Only [A-Za-z0-9+/=] characters are sent — no binary values that could
    // be mangled in transit.
    const b64Buffer = Buffer.from(fileBuffer.toString('base64'));

    const writeExec = await container.exec({
      Cmd:           ['bash', '-c', `base64 -d > '${uploadDir}/${tmpName}'`],
      AttachStdin:   true,
      AttachStdout:  true,
      AttachStderr:  true,
      Tty:           false,
    });
    const writeStream = await writeExec.start({ hijack: true, stdin: true });
    writeStream.resume(); // drain any framing bytes Docker sends back

    // Pump b64Buffer → stdin in 64 KB chunks, respecting backpressure
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
        while (offset < b64Buffer.length) {
          const slice = b64Buffer.subarray(offset, offset + CHUNK);
          offset += slice.length;
          if (!writeStream.write(slice) && offset < b64Buffer.length) {
            writeStream.once('drain', pump);
            return;
          }
        }
        writeStream.end(); // EOF → base64 -d exits → Docker closes socket → 'end'
      };
      pump();
    });

    // ── 3. Unzip in place & clean up ───────────────────────────
    let destDir: string;

    if (isWorld) {
      const script =
        // SHA-256 integrity check: confirms base64 decode produced the exact original bytes
        `ACTUAL_SHA=$(sha256sum '${uploadDir}/${tmpName}' | awk '{print $1}'); ` +
        `[ "$ACTUAL_SHA" != "${sha256}" ] && ` +
        `  echo "Integrity check failed — SHA256 mismatch (got $ACTUAL_SHA, expected ${sha256})" && exit 1; ` +
        // Unzip directly into the world directory
        `UNZIP_OUT=$(unzip -o '${uploadDir}/${tmpName}' -d '${uploadDir}' 2>&1); RC=$?; ` +
        `rm -f '${uploadDir}/${tmpName}'; ` +
        `[ "$RC" -gt 1 ] && echo "unzip failed (exit $RC): $UNZIP_OUT" && exit 1; ` +
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

      // ── 4. Update level-name in server.properties ──────────
      // Set level-name to the uploaded world's directory name so the
      // server loads it on next restart. Also neutralize /etc/bds-property-definitions.json
      // so that bedrock-entry.sh's `set-property --bulk` becomes a no-op
      // and our saved value persists through container restarts.
      const updateLevelScript =
        // Remove any existing level-name line, append the new value
        `tmpf=$(mktemp); ` +
        `if [ -f /data/server.properties ]; then ` +
        `  grep -v '^level-name=' /data/server.properties > "$tmpf"; ` +
        `else touch "$tmpf"; fi; ` +
        `echo 'level-name=${levelName}' >> "$tmpf"; ` +
        `cat "$tmpf" > /data/server.properties; ` +
        `rm -f "$tmpf"; ` +
        `echo '{}' > /etc/bds-property-definitions.json`;
      await execCommand(container, ['bash', '-c', updateLevelScript], 10_000).catch(() => null);

    } else {
      const packDir = type === 'behavior' ? 'behavior_packs' : 'resource_packs';
      const script =
        `ACTUAL_SHA=$(sha256sum '${uploadDir}/${tmpName}' | awk '{print $1}'); ` +
        `[ "$ACTUAL_SHA" != "${sha256}" ] && ` +
        `  echo "Integrity check failed — SHA256 mismatch (got $ACTUAL_SHA, expected ${sha256})" && exit 1; ` +
        `UNZIP_OUT=$(unzip -o '${uploadDir}/${tmpName}' -d '${uploadDir}' 2>&1); RC=$?; ` +
        `rm -f '${uploadDir}/${tmpName}'; ` +
        `[ "$RC" -gt 1 ] && echo "unzip failed (exit $RC): $UNZIP_OUT" && exit 1; ` +
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

    return NextResponse.json({ success: true, destination: destDir, activatedLevel: isWorld ? levelName : undefined });

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
