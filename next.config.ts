import type { NextConfig } from 'next';

// dockerode is only used in API routes (server-side).
// serverExternalPackages prevents it from being bundled, so
// Node.js native modules (net, tls, fs) are never seen by the client.
const nextConfig: NextConfig = {
  serverExternalPackages: ['dockerode'],
  // bodySizeLimit must live here (top-level serverActions), NOT inside
  // experimental.serverActions — that key only covered Server Actions and
  // was moved out of experimental in Next.js 15+.  Putting it here makes
  // the 200 MB limit apply to Route Handlers as well.
  serverActions: {
    bodySizeLimit: '200mb',
  },
};

export default nextConfig;
