export type ContainerStatus =
  | 'running'
  | 'stopped'
  | 'exited'
  | 'paused'
  | 'restarting'
  | 'dead'
  | 'created';

export type HealthStatus = 'healthy' | 'unhealthy' | 'starting' | 'none';

export type ServerAction = 'start' | 'stop' | 'restart';

export interface ServerInfo {
  // ── Container ─────────────────────────────
  containerName: string;
  containerId: string;
  image: string;
  status: ContainerStatus;
  running: boolean;
  health: HealthStatus;
  startedAt: string | null;
  uptime: string | null;
  // ── Server config (from env vars) ─────────
  serverVersion: string;
  serverName: string;
  gamemode: string;
  difficulty: string;
  port: string;
  portV6: string;
  maxPlayers: string;
  levelName: string;
  // ── Live data (from mc-monitor) ───────────
  players: {
    online: number;
    max: number;
  };
  // ── Port bindings (host port per protocol) ─
  portBindings: Record<string, string>;
}

export interface ActionResponse {
  success: boolean;
  action: ServerAction;
}

export interface ApiError {
  error: string;
  containerName?: string;
}
