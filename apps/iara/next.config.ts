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
    // Next.js 16 transforma `localPatterns` numa allowlist estrita — sem ele
    // qualquer URL local é permitida, com ele só o que está listado. Epic 22
    // adiciona proxies autenticados pra Cloud Storage com `?path=...`, então
    // listamos cada um; o catch-all `pathname:'/**', search:''` preserva o
    // comportamento de antes pros assets estáticos do `/public` (logos etc.).
    localPatterns: [
      { pathname: '/**', search: '' },
      { pathname: '/api/wizard/thumbnail/select', search: '?path=**' },
      { pathname: '/api/wizard/thumbnail/upload', search: '?path=**' },
      { pathname: '/api/settings/thumbnail-config', search: '?path=**' },
    ],
  },
}

export default nextConfig
