/**
 * Next.js Proxy for route protection.
 *
 * CRITICAL: This file must be at src/proxy.ts (root of src/), NOT in src/app/
 *
 * Uses Auth.js v5 middleware helper for session verification.
 * Handles:
 * - Protected routes: /videos, /settings, /api/* (except /api/auth)
 * - Public routes: /login, /report/*, /api/auth/*, /_next/*, assets
 * - SSE endpoints: /api/process/* (no buffering, auth check returns 401)
 *
 * @see https://authjs.dev/getting-started/session-management/protecting
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { log } from '@/lib/logger'

/**
 * Creates a 401 Unauthorized response for API routes.
 * Extracted to avoid code duplication.
 */
function createUnauthorizedResponse(): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

/**
 * Auth.js proxy wrapper.
 * The `auth` function from Auth.js wraps our proxy and provides `req.auth`.
 *
 * Next.js 16+ uses proxy.ts instead of middleware.ts.
 * Named export 'proxy' is required by the Next.js 16 convention.
 */
export const proxy = auth((req) => {
  const isAuthenticated = !!req.auth
  const { pathname, search } = req.nextUrl

  // SSE endpoints: /api/process/* - special handling (NFR4: no buffering)
  // Return 401 JSON if not authenticated, otherwise pass through without buffering
  if (pathname.startsWith('/api/process')) {
    if (!isAuthenticated) {
      log('INFO', 'SSE endpoint auth failed', { pathname, reason: 'unauthenticated' })
      return createUnauthorizedResponse()
    }
    // Pass through without any buffering for SSE streams
    return NextResponse.next()
  }

  // Protected API routes (except /api/auth and /api/admin which bypass auth)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth') && !pathname.startsWith('/api/admin')) {
    if (!isAuthenticated) {
      log('INFO', 'API route auth failed', { pathname, reason: 'unauthenticated' })
      return createUnauthorizedResponse()
    }
    return NextResponse.next()
  }

  // Protected page routes
  if (!isAuthenticated) {
    log('INFO', 'Page route auth failed, redirecting to login', { pathname, reason: 'unauthenticated' })
    const loginUrl = new URL('/login', req.url)
    // Preserve the original URL (including query string) as callbackUrl for redirect after login
    const fullPath = search ? `${pathname}${search}` : pathname
    loginUrl.searchParams.set('callbackUrl', fullPath)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user - allow access
  return NextResponse.next()
})

/**
 * Proxy matcher configuration.
 *
 * Excludes:
 * - /api/auth/* (Auth.js routes - must be public)
 * - /_next/* (Next.js internals)
 * - /favicon.ico, /robots.txt, etc (static assets)
 * - /login (login page - must be public)
 * - /report/* (public editorial report pages)
 * - /method-docs/* (public BMAD documentation site)
 *
 * Protects everything else.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (Auth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, robots.txt, sitemap.xml (SEO/browser files)
     * - login (login page)
     * - auth/error (auth error page)
     * - Public assets with extensions
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|login|auth/error|report|method-docs|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
