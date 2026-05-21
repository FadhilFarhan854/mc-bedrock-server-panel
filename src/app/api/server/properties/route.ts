import { NextResponse } from 'next/server';
import { execCommand, getContainer } from '@/lib/docker';

export const dynamic = 'force-dynamic';

// ── Parse server.properties lines into key/value map ───────────
function parseProperties(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      result[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  }
  return result;
}

// ── Apply updates to existing file content ──────────────────────
function applyUpdates(raw: string, updates: Record<string, string>): string {
  const pending = new Set(Object.keys(updates));
  const lines = raw.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return line;
    const key = trimmed.slice(0, idx);
    if (key in updates) {
      pending.delete(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  // Append any new keys not in the original file
  for (const key of pending) {
    lines.push(`${key}=${updates[key]}`);
  }
  return lines.join('\n');
}

// ── GET — read /data/server.properties ─────────────────────────
export async function GET() {
  try {
    const container = getContainer();
    const raw = await execCommand(container, ['cat', '/data/server.properties']);
    return NextResponse.json({ raw, parsed: parseProperties(raw) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read properties';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — write /data/server.properties ───────────────────────
export async function POST(request: Request) {
  try {
    const { updates } = (await request.json()) as {
      updates: Record<string, string>;
    };

    const container = getContainer();

    // Read current content
    const raw = await execCommand(container, ['cat', '/data/server.properties']);
    const updated = applyUpdates(raw, updates);

    // Write back via base64 (safe for any content; base64 chars never include single quotes)
    const b64 = Buffer.from(updated).toString('base64');
    await execCommand(container, [
      'bash',
      '-c',
      `echo '${b64}' | base64 -d > /data/server.properties`,
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write properties';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
