import { NextResponse } from 'next/server';
import { execCommand, getContainer } from '@/lib/docker';

export async function POST(request: Request) {
  try {
    const { command } = (await request.json()) as { command: string };

    if (!command?.trim()) {
      return NextResponse.json({ error: 'Command is required.' }, { status: 400 });
    }

    const container = getContainer();
    await execCommand(container, ['send-command', command.trim()]);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send command';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
