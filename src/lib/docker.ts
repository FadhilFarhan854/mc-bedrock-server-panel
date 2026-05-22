import Docker from 'dockerode';
import { PassThrough } from 'stream';

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
 *
 * Uses Tty:false + demuxStream so the stream properly ends when the process
 * exits (Tty:true TTY streams can hang waiting for the socket to close).
 * After the stream ends we inspect the exec to get the real exit code and
 * throw if it is non-zero.
 *
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
      Tty: false,
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

  const output = await new Promise<string>((resolve, reject) => {
    const stdoutPass = new PassThrough();
    const stderrPass = new PassThrough();
    const chunks: Buffer[] = [];
    let resolved = false;

    stdoutPass.on('data', (c: Buffer) => chunks.push(c));
    stderrPass.on('data', (c: Buffer) => chunks.push(c));

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    };

    docker.modem.demuxStream(stream, stdoutPass, stderrPass);

    stream.on('end', finish);
    stream.on('error', (e: Error) => (resolved ? undefined : reject(e)));
    setTimeout(finish, timeoutMs);
  });

  return output;
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
