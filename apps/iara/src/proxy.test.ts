import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the auth module
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: (handler: (req: NextRequest & { auth: unknown }) => unknown) => {
    return (req: NextRequest) => {
      const authReq = req as NextRequest & { auth: unknown }
      authReq.auth = mockAuth()
      return handler(authReq)
    }
  },
}))

// Mock the logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks are set up
import { proxy, config } from './proxy'

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createRequest(pathname: string, origin = 'http://localhost:3000'): NextRequest {
    return new NextRequest(new URL(pathname, origin))
  }

  describe('unauthenticated users', () => {
    beforeEach(() => {
      mockAuth.mockReturnValue(null)
    })

    it('redirects to /login for protected page routes', async () => {
      const req = createRequest('/videos')
      const response = await proxy(req)

      expect(response?.status).toBe(307) // Redirect
      const location = response?.headers.get('location')
      expect(location).toContain('/login')
      expect(location).toContain('callbackUrl=%2Fvideos')
    })

    it('redirects to /login for /settings route', async () => {
      const req = createRequest('/settings')
      const response = await proxy(req)

      expect(response?.status).toBe(307)
      const location = response?.headers.get('location')
      expect(location).toContain('/login')
      expect(location).toContain('callbackUrl=%2Fsettings')
    })

    it('returns 401 for protected API routes', async () => {
      const req = createRequest('/api/youtube/videos')
      const response = await proxy(req)

      expect(response?.status).toBe(401)
      const body = await response?.json()
      expect(body).toEqual({
        error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' },
      })
    })

    it('returns 401 for SSE endpoints without buffering', async () => {
      const req = createRequest('/api/process/abc123')
      const response = await proxy(req)

      expect(response?.status).toBe(401)
      const body = await response?.json()
      expect(body).toEqual({
        error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' },
      })
    })
  })

  describe('authenticated users', () => {
    beforeEach(() => {
      mockAuth.mockReturnValue({ user: { id: 'user-123', name: 'Test User' } })
    })

    it('allows access to protected page routes', async () => {
      const req = createRequest('/videos')
      const response = await proxy(req)

      // NextResponse.next() returns a response with no redirect
      expect(response?.status).toBe(200)
      expect(response?.headers.get('x-middleware-next')).toBe('1')
    })

    it('allows access to protected API routes', async () => {
      const req = createRequest('/api/youtube/videos')
      const response = await proxy(req)

      expect(response?.status).toBe(200)
      expect(response?.headers.get('x-middleware-next')).toBe('1')
    })

    it('allows SSE endpoints without buffering', async () => {
      const req = createRequest('/api/process/abc123')
      const response = await proxy(req)

      expect(response?.status).toBe(200)
      expect(response?.headers.get('x-middleware-next')).toBe('1')
    })

    it('allows access to /settings', async () => {
      const req = createRequest('/settings')
      const response = await proxy(req)

      expect(response?.status).toBe(200)
    })
  })

  describe('matcher configuration', () => {
    it('has correct matcher pattern', () => {
      expect(config.matcher).toBeDefined()
      expect(config.matcher.length).toBeGreaterThan(0)
    })

    it('matcher pattern excludes expected public routes', () => {
      const pattern = config.matcher[0]
      // Verify the pattern contains exclusions for public routes
      // Next.js matcher uses special syntax: (?!...) for negative lookahead
      expect(pattern).toContain('api/auth')
      expect(pattern).toContain('_next/static')
      expect(pattern).toContain('_next/image')
      expect(pattern).toContain('favicon.ico')
      expect(pattern).toContain('login')
      expect(pattern).toContain('auth/error')
    })

    it('matcher pattern is a valid Next.js matcher format', () => {
      const pattern = config.matcher[0]
      // Next.js matcher patterns start with / and use regex-like syntax
      expect(pattern.startsWith('/')).toBe(true)
      // Contains negative lookahead group for exclusions
      expect(pattern).toContain('(?!')
    })
  })

  describe('callbackUrl preservation', () => {
    beforeEach(() => {
      mockAuth.mockReturnValue(null)
    })

    it('preserves original path in callbackUrl', async () => {
      const req = createRequest('/videos/abc123')
      const response = await proxy(req)

      const location = response?.headers.get('location')
      expect(location).toContain('callbackUrl=%2Fvideos%2Fabc123')
    })

    it('preserves nested paths in callbackUrl', async () => {
      const req = createRequest('/settings/prompts')
      const response = await proxy(req)

      const location = response?.headers.get('location')
      expect(location).toContain('callbackUrl=%2Fsettings%2Fprompts')
    })

    it('preserves query string in callbackUrl', async () => {
      const req = createRequest('/videos?selected=abc123&filter=draft')
      const response = await proxy(req)

      const location = response?.headers.get('location')
      // Query string should be included in the callbackUrl
      expect(location).toContain('callbackUrl=')
      // URL-encoded: /videos?selected=abc123&filter=draft
      expect(location).toContain('%2Fvideos%3Fselected%3Dabc123')
    })

    it('preserves path with query string together', async () => {
      const req = createRequest('/settings/prompts?tab=video')
      const response = await proxy(req)

      const location = response?.headers.get('location')
      // Should include both path and query
      expect(location).toContain('%2Fsettings%2Fprompts%3Ftab%3Dvideo')
    })
  })
})
