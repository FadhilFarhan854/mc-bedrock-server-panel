import { NextResponse } from 'next/server';
import { getContainer } from '@/lib/docker';
import type { ServerAction, ActionResponse } from '@/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action: ServerAction };
    const { action } = body;

    if (!['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const container = getContainer();

    switch (action) {
      case 'start':
        await container.start();
        break;
      case 'stop':
        await container.stop({ t: 10 }); // 10-second grace period
        break;
      case 'restart':
        await container.restart({ t: 10 });
        break;
    }

    const response: ActionResponse = { success: true, action };
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Action failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
