import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // End-to-end tests build into their own folder, so they never disturb a running `next dev` (default: .next).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // The shared contracts package lives in the monorepo (src/shared).
  transpilePackages: ['@oj/contracts'],
  // Monorepo root, so file tracing / turbopack resolve workspace packages correctly.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  // Routes from before "Đợt 1" (bank + sessions). Kept so old links and bookmarks still land somewhere useful.
  async redirects() {
    return [
      { source: '/problems', destination: '/', permanent: false },
      { source: '/problems/:id', destination: '/bank/problems/:id', permanent: false },
      { source: '/sets', destination: '/bank/sets', permanent: false },
      { source: '/sets/new', destination: '/bank/sets/new', permanent: false },
      { source: '/sets/:id', destination: '/bank/sets/:id', permanent: false },
      { source: '/sets/:id/:rest(edit|print|answer-key)', destination: '/bank/sets/:id/:rest', permanent: false },
      { source: '/sets/:id/results', destination: '/bank/sets/:id', permanent: false },
      { source: '/admin/import', destination: '/import', permanent: false },
      { source: '/admin/problems', destination: '/bank', permanent: false },
      { source: '/admin/problems/:path*', destination: '/bank/problems/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
