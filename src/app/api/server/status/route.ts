import { NextResponse } from 'next/server';
import {
  getContainer,
  execCommand,
  parseEnvVars,
  calculateUptime,
  parseMcMonitorPlayers,
} from '@/lib/docker';
import type { ServerInfo } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const container = getContainer();
    const info = await container.inspect();

    const envVars = parseEnvVars(info.Config?.Env ?? []);
    const state = info.State;
    const isRunning = state.Running;

    // ── Port bindings ──────────────────────────────────────────
    const portBindings: Record<string, string> = {};
    const rawBindings = (info.HostConfig?.PortBindings as Record<
      string,
      Array<{ HostIp: string; HostPort: string }> | null
    >) ?? {};

    for (const [proto, binds] of Object.entries(rawBindings)) {
      if (Array.isArray(binds) && binds.length > 0) {
        portBindings[proto] = binds[0].HostPort;
      }
    }

    // ── Player count via mc-monitor ────────────────────────────
    const fallbackMax = parseInt(envVars.MAX_PLAYERS ?? '20');
    let players = { online: 0, max: fallbackMax };

    if (isRunning) {
      try {
        const port = envVars.SERVER_PORT ?? '19132';
        const output = await execCommand(container, [
          'mc-monitor',
          'status-bedrock',
          '--host', '127.0.0.1',
          '--port', port,
        ]);
        players = parseMcMonitorPlayers(output, fallbackMax);
      } catch {
        // mc-monitor unavailable or server not yet ready — use defaults
      }
    }

    const serverInfo: ServerInfo = {
      containerName: info.Name.replace('/', ''),
      containerId: info.Id.slice(0, 12),
      image: info.Config?.Image ?? '',
      status: state.Status as ServerInfo['status'],
      running: isRunning,
      health: ((state as Record<string, unknown>).Health as { Status?: string } | undefined)
        ?.Status as ServerInfo['health'] ?? 'none',
      startedAt: isRunning ? state.StartedAt : null,
      uptime: isRunning && state.StartedAt ? calculateUptime(state.StartedAt) : null,
      serverVersion: envVars.VERSION ?? 'LATEST',
      serverName: envVars.SERVER_NAME ?? 'Bedrock Level',
      gamemode: envVars.GAMEMODE ?? 'survival',
      difficulty: envVars.DIFFICULTY ?? 'easy',
      port: envVars.SERVER_PORT ?? '19132',
      portV6: envVars.SERVER_PORT_V6 ?? '19133',
      maxPlayers: envVars.MAX_PLAYERS ?? '20',
      levelName: envVars.LEVEL_NAME ?? 'Bedrock level',
      players,
      portBindings,
    };

    return NextResponse.json(serverInfo);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to connect to Docker';
    return NextResponse.json(
      { error: message, containerName: process.env.CONTAINER_NAME ?? 'bds' },
      { status: 500 }
    );
  }
}
