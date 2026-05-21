import { NextResponse } from 'next/server';
import { execCommand, getContainer } from '@/lib/docker';

export const dynamic = 'force-dynamic';

const BACKUP_DIR = '/data/backups';
const WORLDS_DIR = '/data/worlds';

export interface BackupItem {
  filename: string;
  sizeBytes: number;
  createdAt: number; // Unix ms
}

// ── Helpers ───────────────────────────────────────────────────────

/** Validate filename — allow only world_YYYYMMDD_HHMMSS.tar.gz to prevent path traversal */
function isSafeFilename(name: string): boolean {
  return /^world_\d{8}_\d{6}\.tar\.gz$/.test(name);
}

function formatSize(bytes: string): number {
  const n = parseInt(bytes, 10);
  return isNaN(n) ? 0 : n;
}

// ── GET — list backups ────────────────────────────────────────────
export async function GET() {
  try {
    const container = getContainer();

    // Ensure directory exists first
    await execCommand(container, ['bash', '-c', `mkdir -p ${BACKUP_DIR}`]);

    const raw = await execCommand(
      container,
      [
        'bash',
        '-c',
        `find ${BACKUP_DIR} -maxdepth 1 -name 'world_*.tar.gz' -type f -exec stat -c '%n|%s|%Y' {} \\; 2>/dev/null`,
      ],
    );

    const backups: BackupItem[] = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [filepath, size, mtime] = line.split('|');
        const filename = filepath.split('/').pop() ?? '';
        return {
          filename,
          sizeBytes: formatSize(size),
          createdAt: parseInt(mtime, 10) * 1_000,
        };
      })
      .filter((b) => isSafeFilename(b.filename))
      .sort((a, b) => b.createdAt - a.createdAt); // newest first

    return NextResponse.json({ backups });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list backups';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — create new world backup ───────────────────────────────
export async function POST() {
  try {
    const container = getContainer();

    // Build filename inside the container using the container's clock
    const cmd = [
      'bash',
      '-c',
      // save hold → short pause → tar → save resume (best-effort, ignore errors)
      `send-command 'save hold' 2>/dev/null || true; ` +
      `sleep 2; ` +
      `mkdir -p ${BACKUP_DIR} && ` +
      `tar -czf ${BACKUP_DIR}/world_$(date +%Y%m%d_%H%M%S).tar.gz -C /data worlds 2>&1 && ` +
      `send-command 'save resume' 2>/dev/null || true; ` +
      `echo '__done__'`,
    ];

    // 120-second timeout for large worlds
    const output = await execCommand(container, cmd, 120_000);

    if (!output.includes('__done__')) {
      throw new Error('Backup may have failed — check console for details.');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE — remove a specific backup ────────────────────────────
export async function DELETE(request: Request) {
  try {
    const { filename } = (await request.json()) as { filename: string };

    if (!filename || !isSafeFilename(filename)) {
      return NextResponse.json({ error: 'Invalid filename.' }, { status: 400 });
    }

    const container = getContainer();
    await execCommand(container, ['rm', '-f', `${BACKUP_DIR}/${filename}`]);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete backup';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export { WORLDS_DIR };
