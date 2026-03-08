import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: resolve(__dirname, '../..'),
  },
  serverExternalPackages: [
    '@mastra/core',
    '@mastra/loggers',
    '@mastra/memory',
    '@mastra/observability',
    '@mastra/pg',
    'better-auth',
    'drizzle-orm',
    'postgres',
  ],
};

export default nextConfig;
