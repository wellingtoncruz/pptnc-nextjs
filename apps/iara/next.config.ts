import type { NextConfig } from 'next'
import { resolve, dirname } from 'node:path'

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      // Serve index.html for /method-docs directory paths
      { source: '/method-docs', destination: '/method-docs/index.html' },
      { source: '/method-docs/:path*/', destination: '/method-docs/:path*/index.html' },
    ]
  },
  // Point to monorepo root for proper standalone output tracing
  outputFileTracingRoot: resolve(dirname(''), '../../'),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.ytimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',
      },
    ],
  },
}

export default nextConfig
