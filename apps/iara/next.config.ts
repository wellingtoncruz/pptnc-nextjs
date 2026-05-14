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
    // qualquer URL local é permitida, com ele só o que está listado.
    //
    // **`search` é match literal exato**: a doc oficial diz "omitting search
    // allows all search parameters". Não há suporte a glob em `search`
    // (`**` ali vira string literal). Por isso os patterns dos proxies do
    // Epic 22 deliberadamente OMITEM `search` — qualquer `?path=...` é
    // aceito. Segurança fica nos endpoints (eles path-validam `thumbnail-
    // staging/`, `thumbnails/`, `thumbnail-config/` prefixes), não no
    // image-optimizer do Next.
    //
    // O primeiro pattern preserva os assets estáticos do `/public` (logos
    // etc., sempre sem query string).
    localPatterns: [
      { pathname: '/**', search: '' },
      { pathname: '/api/wizard/thumbnail/select' },
      { pathname: '/api/wizard/thumbnail/upload' },
      { pathname: '/api/settings/thumbnail-config' },
    ],
  },
}

export default nextConfig
