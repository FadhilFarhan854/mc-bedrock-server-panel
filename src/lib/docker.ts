import Docker from 'dockerode';

// ── Docker client factory ────────────────────────────────────────
function createDockerClient(): Docker {
  // Option 1: explicit TCP host
  if (process.env.DOCKER_HOST) {
    return new Docker({
      host: process.env.DOCKER_HOST,
      port: parseInt(process.env.DOCKER_PORT ?? '2375'),
    });
  }

  // Option 2: socket path (env override, or OS default)
  const socketPath =
    process.env.DOCKER_SOCKET_PATH ??
    (process.platform === 'win32'
      ? '//./pipe/docker_engine'
      : '/var/run/docker.sock');

  return new Docker({ socketPath });
}

export const docker = createDockerClient();

// ── Helpers ──────────────────────────────────────────────────────
export function getContainer(name?: string): Docker.Container {
  return docker.getContainer(name ?? process.env.CONTAINER_NAME ?? 'bds');
}

export function parseEnvVars(envArray: string[]): Record<string, string> {
  return envArray.reduce<Record<string, string>>((acc, entry) => {
    const idx = entry.indexOf('=');
    if (idx > 0) acc[entry.slice(0, idx)] = entry.slice(idx + 1);
    return acc;
  }, {});
}

export function calculateUptime(startedAt: string): string {
  const diffMs = Date.now() - new Date(startedAt).getTime();
  if (diffMs < 0) return '0m';

  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Thrown when exec is attempted on a stopped/paused container (Docker HTTP 409).
 */
export class ContainerNotRunningError extends Error {
  constructor() {
    super('Container is not running');
    this.name = 'ContainerNotRunningError';
  }
}

/**
 * Run a command inside a container and return stdout as a string.
 * Uses Tty:true to avoid Docker's multiplexed 8-byte frame headers.
 * @param timeoutMs - safety timeout in ms (default 5 s; use larger value for long-running ops)
 */
export async function execCommand(
  container: Docker.Container,
  cmd: string[],
  timeoutMs = 5_000,
): Promise<string> {
  let exec: Docker.Exec;
  try {
    exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });
  } catch (err) {
    // Docker returns 409 when container is stopped/paused
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('409') || msg.toLowerCase().includes('not running')) {
      throw new ContainerNotRunningError();
    }
    throw err;
  }

  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    };

    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', finish);
    stream.on('error', finish);
    setTimeout(finish, timeoutMs);
  });
}

/**
 * Parse mc-monitor status-bedrock output into player counts.
 * Handles formats: "players=0/20" and "currentPlayers=0 ... maxPlayers=20"
 */
export function parseMcMonitorPlayers(
  output: string,
  fallbackMax: number
): { online: number; max: number } {
  // Format A: players=0/20
  const slashMatch = output.match(/players=(\d+)\/(\d+)/);
  if (slashMatch) {
    return { online: parseInt(slashMatch[1]), max: parseInt(slashMatch[2]) };
  }

  // Format B: currentPlayers=0 ... maxPlayers=20
  const currentMatch = output.match(/currentPlayers=(\d+)/);
  const maxMatch = output.match(/maxPlayers=(\d+)/);
  if (currentMatch && maxMatch) {
    return {
      online: parseInt(currentMatch[1]),
      max: parseInt(maxMatch[1]),
    };
  }

  return { online: 0, max: fallbackMax };
}
