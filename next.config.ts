import type { NextConfig } from 'next';

// dockerode is only used in API routes (server-side).
// serverExternalPackages prevents it from being bundled, so
// Node.js native modules (net, tls, fs) are never seen by the client.
const nextConfig: NextConfig = {
  serverExternalPackages: ['dockerode'],
  experimental: {
    serverActions: {
      bodySizeLimit: '512mb',
    },
  },
};

export default nextConfig;
