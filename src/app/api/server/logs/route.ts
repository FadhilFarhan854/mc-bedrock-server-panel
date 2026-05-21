import { PassThrough } from 'stream';
import { docker, getContainer } from '@/lib/docker';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        const trimmed = text.replace(/\r?\n$/, '');
        if (!trimmed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: trimmed })}\n\n`),
        );
      };

      // Heartbeat to keep the connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 20_000);

      try {
        const container = getContainer();
        const info = await container.inspect();
        const isTty: boolean = (info.Config as { Tty?: boolean })?.Tty ?? false;

        const logStream = (await container.logs({
          stdout: true,
          stderr: true,
          tail: 200,
          follow: true,
          timestamps: true,
        })) as unknown as NodeJS.ReadableStream;

        if (isTty) {
          // TTY containers emit raw text — no multiplex headers
          let partial = '';
          logStream.on('data', (chunk: Buffer) => {
            partial += chunk.toString('utf8');
            const lines = partial.split('\n');
            partial = lines.pop() ?? '';
            lines.forEach(send);
          });
          logStream.on('end', () => {
            if (partial) send(partial);
            clearInterval(heartbeat);
            controller.close();
          });
        } else {
          // Non-TTY: multiplexed docker stream
          const stdout = new PassThrough();
          const stderr = new PassThrough();
          docker.modem.demuxStream(logStream, stdout, stderr);

          const handleChunk = (chunk: Buffer) => {
            chunk
              .toString('utf8')
              .split('\n')
              .forEach(send);
          };

          stdout.on('data', handleChunk);
          stderr.on('data', handleChunk);

          logStream.on('end', () => {
            clearInterval(heartbeat);
            controller.close();
          });
        }

        logStream.on('error', () => {
          clearInterval(heartbeat);
          controller.close();
        });
      } catch (err) {
        clearInterval(heartbeat);
        const msg = err instanceof Error ? err.message : 'Failed to stream logs';
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ text: `[Panel Error] ${msg}`, isError: true })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
