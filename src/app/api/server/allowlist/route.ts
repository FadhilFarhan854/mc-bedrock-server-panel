import { NextResponse } from 'next/server';
import { execCommand, getContainer } from '@/lib/docker';

export const dynamic = 'force-dynamic';

export interface AllowlistPlayer {
  name: string;
  xuid?: string;
  ignoresPlayerLimit?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────
function parseProperties(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx > 0) result[t.slice(0, idx)] = t.slice(idx + 1);
  }
  return result;
}

async function readAllowlist(container: Parameters<typeof execCommand>[0]): Promise<AllowlistPlayer[]> {
  try {
    const raw = await execCommand(container, ['cat', '/data/allowlist.json']);
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AllowlistPlayer[]) : [];
  } catch {
    return [];
  }
}

async function writeAllowlist(
  container: Parameters<typeof execCommand>[0],
  players: AllowlistPlayer[],
): Promise<void> {
  const content = JSON.stringify(players, null, 2);
  const b64 = Buffer.from(content).toString('base64');
  await execCommand(container, ['bash', '-c', `echo '${b64}' | base64 -d > /data/allowlist.json`]);
  // Best-effort hot-reload — ignore if server is not running
  try {
    await execCommand(container, ['send-command', 'allowlist reload']);
  } catch {
    /* noop */
  }
}

// ── GET — list players + allow-list status ────────────────────────
export async function GET() {
  try {
    const container = getContainer();
    const [players, propsRaw] = await Promise.all([
      readAllowlist(container),
      execCommand(container, ['cat', '/data/server.properties']).catch(() => ''),
    ]);
    const props = parseProperties(propsRaw);
    const enabled = props['allow-list'] === 'true';
    return NextResponse.json({ players, enabled });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read allowlist';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — add player ─────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AllowlistPlayer>;
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: 'Player name is required.' }, { status: 400 });
    }

    const container = getContainer();
    const players = await readAllowlist(container);

    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'Player already in allowlist.' }, { status: 409 });
    }

    const entry: AllowlistPlayer = {
      name,
      ignoresPlayerLimit: body.ignoresPlayerLimit ?? false,
    };
    if (body.xuid?.trim()) entry.xuid = body.xuid.trim();

    players.push(entry);
    await writeAllowlist(container, players);

    return NextResponse.json({ success: true, players });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add player';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE — remove player ────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const { name } = (await request.json()) as { name: string };
    if (!name) {
      return NextResponse.json({ error: 'Player name is required.' }, { status: 400 });
    }

    const container = getContainer();
    const players = await readAllowlist(container);
    const filtered = players.filter((p) => p.name.toLowerCase() !== name.toLowerCase());

    if (filtered.length === players.length) {
      return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    }

    await writeAllowlist(container, filtered);
    return NextResponse.json({ success: true, players: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove player';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
