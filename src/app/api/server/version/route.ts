import { NextResponse } from 'next/server';
import { execCommand, getContainer, parseEnvVars } from '@/lib/docker';

export const dynamic = 'force-dynamic';

export interface VersionInfo {
  /** Raw VALUE of the VERSION env var (e.g. "LATEST", "PREVIEW", "1.21.2.2") */
  versionEnv: string;
  /** Actual installed version read from /data/version inside container */
  versionInstalled: string | null;
  /** bedrock-server-*.zip packages available in /data (for rollback awareness) */
  packages: PackageEntry[];
  /** PACKAGE_BACKUP_KEEP env var value */
  packageBackupKeep: string;
}

export interface PackageEntry {
  filename: string;  // e.g. "bedrock-server-1.21.2.2.zip"
  version: string;   // e.g. "1.21.2.2"
  sizeBytes: number;
}

function extractVersion(filename: string): string {
  const m = filename.match(/bedrock-server-([\d.]+)\.zip/);
  return m ? m[1] : filename;
}

export async function GET() {
  try {
    const container = getContainer();
    const info = await container.inspect();
    const envVars = parseEnvVars(info.Config?.Env ?? []);

    // ── Installed version (/data/version written by bedrock-entry.sh) ──
    let versionInstalled: string | null = null;
    try {
      const raw = await execCommand(container, ['bash', '-c', 'cat /data/version 2>/dev/null || echo ""']);
      const trimmed = raw.trim();
      if (trimmed) versionInstalled = trimmed;
    } catch {
      /* container may be stopped */
    }

    // ── Available server packages (for rollback info) ─────────────
    let packages: PackageEntry[] = [];
    try {
      const raw = await execCommand(
        container,
        [
          'bash',
          '-c',
          "find /data -maxdepth 1 -name 'bedrock-server-*.zip' -type f -exec stat -c '%n|%s' {} \\; 2>/dev/null",
        ],
      );
      packages = raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [filepath, size] = line.split('|');
          const filename = filepath.split('/').pop() ?? '';
          return {
            filename,
            version: extractVersion(filename),
            sizeBytes: parseInt(size, 10) || 0,
          };
        })
        .filter((p) => /^bedrock-server-[\d.]+\.zip$/.test(p.filename))
        .sort((a, b) => b.filename.localeCompare(a.filename)); // newest first
    } catch {
      /* noop */
    }

    const result: VersionInfo = {
      versionEnv: envVars.VERSION ?? 'LATEST',
      versionInstalled,
      packages,
      packageBackupKeep: envVars.PACKAGE_BACKUP_KEEP ?? '2',
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get version info';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
