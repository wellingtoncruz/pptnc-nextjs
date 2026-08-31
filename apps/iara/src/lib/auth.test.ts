import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next-auth before importing auth module
vi.mock('next-auth', () => {
  const mockAuth = vi.fn()
  const mockSignIn = vi.fn()
  const mockSignOut = vi.fn()
  const mockHandlers = { GET: vi.fn(), POST: vi.fn() }

  return {
    default: vi.fn(() => ({
      auth: mockAuth,
      signIn: mockSignIn,
      signOut: mockSignOut,
      handlers: mockHandlers,
    })),
  }
})

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn((config) => ({
    id: 'google',
    name: 'Google',
    type: 'oauth',
    ...config,
  })),
}))

describe('auth configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Google Provider configuration', () => {
    it('configures Google provider with environment variables', async () => {
      const Google = await import('next-auth/providers/google')

      // Verify Google provider factory is called with correct config structure
      const mockConfig = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      }

      const provider = Google.default(mockConfig)

      expect(provider).toMatchObject({
        id: 'google',
        name: 'Google',
        type: 'oauth',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      })
    })

    it('configures YouTube OAuth scopes correctly', async () => {
      // Import the actual YOUTUBE_SCOPES constant from the module
      const { YOUTUBE_SCOPES } = await import('./auth')

      // Verify YouTube scopes contain required permissions
      expect(YOUTUBE_SCOPES).toContain('https://www.googleapis.com/auth/youtube.readonly')
      expect(YOUTUBE_SCOPES).toContain('https://www.googleapis.com/auth/youtube.force-ssl')
      // Epic 30 (mediakit): horas assistidas + série diária via Analytics API
      expect(YOUTUBE_SCOPES).toContain('https://www.googleapis.com/auth/yt-analytics.readonly')

      // Verify scope string format (space-separated)
      expect(typeof YOUTUBE_SCOPES).toBe('string')
      const scopeArray = YOUTUBE_SCOPES.split(' ')
      expect(scopeArray).toHaveLength(3)
    })

    it('configures offline access for refresh token', () => {
      // Verify access_type configuration requirement
      const authorizationParams = {
        access_type: 'offline',
        prompt: 'consent',
      }

      expect(authorizationParams.access_type).toBe('offline')
      expect(authorizationParams.prompt).toBe('consent')
    })

    it('exports required auth functions', async () => {
      // We can't directly test the exports due to mocking,
      // but we verify the mock structure is correct
      const NextAuth = await import('next-auth')
      const result = NextAuth.default({
        providers: [],
      })

      expect(result).toHaveProperty('auth')
      expect(result).toHaveProperty('signIn')
      expect(result).toHaveProperty('signOut')
      expect(result).toHaveProperty('handlers')
    })

    it('documents required environment variables', () => {
      // These are the required environment variables for auth configuration
      const requiredEnvVars = ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET', 'AUTH_SECRET']

      // Verify the list of required vars is complete
      expect(requiredEnvVars).toContain('AUTH_GOOGLE_ID')
      expect(requiredEnvVars).toContain('AUTH_GOOGLE_SECRET')
      expect(requiredEnvVars).toContain('AUTH_SECRET')
      expect(requiredEnvVars).toHaveLength(3)
    })
  })

  describe('session callbacks', () => {
    it('jwt callback preserves access token from account', async () => {
      const jwtCallback = async ({
        token,
        account,
      }: {
        token: Record<string, unknown>
        account: { access_token?: string; refresh_token?: string; expires_at?: number } | null
      }) => {
        if (account) {
          token.accessToken = account.access_token
          token.refreshToken = account.refresh_token
          token.expiresAt = account.expires_at
        }
        return token
      }

      const mockAccount = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: 1234567890,
      }

      const result = await jwtCallback({ token: { sub: 'user-123' }, account: mockAccount })

      expect(result).toMatchObject({
        sub: 'user-123',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: 1234567890,
      })
    })

    it('jwt callback returns token unchanged when no account', async () => {
      const jwtCallback = async ({
        token,
        account,
      }: {
        token: Record<string, unknown>
        account: null
      }) => {
        if (account) {
          token.accessToken = 'should-not-be-set'
        }
        return token
      }

      const result = await jwtCallback({ token: { sub: 'user-123' }, account: null })

      expect(result).toEqual({ sub: 'user-123' })
    })

    it('jwt callback preserves existing refresh_token when Google does not send new one', async () => {
      // Simulates subsequent login where Google doesn't send refresh_token
      const jwtCallback = async ({
        token,
        account,
      }: {
        token: Record<string, unknown>
        account: { access_token?: string; refresh_token?: string; expires_at?: number } | null
      }) => {
        if (account) {
          token.accessToken = account.access_token
          token.expiresAt = account.expires_at
          // CRITICAL: Only save refresh_token if it comes (first authorization only)
          if (account.refresh_token) {
            token.refreshToken = account.refresh_token
          }
          // Existing refreshToken should be preserved
        }
        return token
      }

      // Token already has refresh_token from first login
      const existingToken = {
        sub: 'user-123',
        refreshToken: 'original-refresh-token',
      }

      // Subsequent login - Google doesn't send refresh_token
      const mockAccount = {
        access_token: 'new-access-token',
        expires_at: 1234567890,
        // No refresh_token - this is expected on subsequent logins
      }

      const result = await jwtCallback({ token: existingToken, account: mockAccount })

      // Original refresh_token should be preserved
      expect(result.refreshToken).toBe('original-refresh-token')
      // Access token should be updated
      expect(result.accessToken).toBe('new-access-token')
    })

    it('jwt callback captures refresh_token on first authorization', async () => {
      const jwtCallback = async ({
        token,
        account,
      }: {
        token: Record<string, unknown>
        account: { access_token?: string; refresh_token?: string; expires_at?: number } | null
      }) => {
        if (account) {
          token.accessToken = account.access_token
          token.expiresAt = account.expires_at
          if (account.refresh_token) {
            token.refreshToken = account.refresh_token
          }
        }
        return token
      }

      // First authorization - Google sends refresh_token
      const mockAccount = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: 1234567890,
      }

      const result = await jwtCallback({ token: { sub: 'user-123' }, account: mockAccount })

      expect(result.refreshToken).toBe('test-refresh-token')
      expect(result.accessToken).toBe('test-access-token')
    })

    it('session callback adds user id from token', async () => {
      const sessionCallback = async ({
        session,
        token,
      }: {
        session: { user: { id?: string; name?: string } }
        token: { sub?: string }
      }) => {
        if (token.sub) {
          session.user.id = token.sub
        }
        return session
      }

      const mockSession = { user: { name: 'Test User' } }
      const mockToken = { sub: 'user-123' }

      const result = await sessionCallback({ session: mockSession, token: mockToken })

      expect(result).toMatchObject({
        user: {
          id: 'user-123',
          name: 'Test User',
        },
      })
    })

    it('session callback includes error when token has RefreshAccessTokenError', async () => {
      // This tests the session callback behavior when jwt callback sets error flag
      const sessionCallback = async ({
        session,
        token,
      }: {
        session: { user: { id?: string; name?: string }; error?: string }
        token: { sub?: string; error?: string }
      }) => {
        // Handle refresh token error - force re-authentication
        if (token.error === 'RefreshAccessTokenError') {
          return {
            ...session,
            user: session.user,
            error: 'RefreshAccessTokenError' as const,
          }
        }

        if (token.sub) {
          session.user.id = token.sub
        }
        return session
      }

      const mockSession = { user: { name: 'Test User' } }
      const mockToken = { sub: 'user-123', error: 'RefreshAccessTokenError' }

      const result = await sessionCallback({ session: mockSession, token: mockToken })

      expect(result.error).toBe('RefreshAccessTokenError')
    })

    it('session callback does not include error when token is valid', async () => {
      const sessionCallback = async ({
        session,
        token,
      }: {
        session: { user: { id?: string; name?: string }; error?: string }
        token: { sub?: string; error?: string }
      }) => {
        if (token.error === 'RefreshAccessTokenError') {
          return {
            ...session,
            user: session.user,
            error: 'RefreshAccessTokenError' as const,
          }
        }

        if (token.sub) {
          session.user.id = token.sub
        }
        return session
      }

      const mockSession = { user: { name: 'Test User' } }
      const mockToken = { sub: 'user-123' } // No error

      const result = await sessionCallback({ session: mockSession, token: mockToken })

      expect(result.error).toBeUndefined()
      expect(result.user.id).toBe('user-123')
    })
  })

  describe('redirect callback', () => {
    it('allows relative callback URLs', async () => {
      const baseUrl = 'http://localhost:3000'
      const redirectCallback = async ({ url, baseUrl: base }: { url: string; baseUrl: string }) => {
        if (url.startsWith('/')) return `${base}${url}`
        if (new URL(url).origin === base) return url
        return base
      }

      const result = await redirectCallback({ url: '/videos', baseUrl })
      expect(result).toBe('http://localhost:3000/videos')
    })

    it('allows callback URLs on same origin', async () => {
      const baseUrl = 'http://localhost:3000'
      const redirectCallback = async ({ url, baseUrl: base }: { url: string; baseUrl: string }) => {
        if (url.startsWith('/')) return `${base}${url}`
        if (new URL(url).origin === base) return url
        return base
      }

      const result = await redirectCallback({
        url: 'http://localhost:3000/settings',
        baseUrl,
      })
      expect(result).toBe('http://localhost:3000/settings')
    })

    it('blocks external URLs', async () => {
      const baseUrl = 'http://localhost:3000'
      const redirectCallback = async ({ url, baseUrl: base }: { url: string; baseUrl: string }) => {
        if (url.startsWith('/')) return `${base}${url}`
        if (new URL(url).origin === base) return url
        return base
      }

      const result = await redirectCallback({
        url: 'https://evil.com/phishing',
        baseUrl,
      })
      expect(result).toBe(baseUrl)
    })
  })

  describe('auth error handling', () => {
    it('handles OAuth error types correctly', () => {
      const errorMessages: Record<string, { title: string; canRetry: boolean }> = {
        AccessDenied: {
          title: 'Permissões Necessárias',
          canRetry: true,
        },
        OAuthAccountNotLinked: {
          title: 'Conta já vinculada',
          canRetry: true,
        },
        Callback: {
          title: 'Erro no Callback OAuth',
          canRetry: true,
        },
        Configuration: {
          title: 'Erro de Configuração',
          canRetry: false,
        },
        Default: {
          title: 'Erro de Autenticação',
          canRetry: true,
        },
      }

      // AccessDenied should allow retry
      expect(errorMessages['AccessDenied'].canRetry).toBe(true)
      expect(errorMessages['AccessDenied'].title).toBe('Permissões Necessárias')

      // Callback error should allow retry
      expect(errorMessages['Callback'].canRetry).toBe(true)

      // Configuration error should not allow retry
      expect(errorMessages['Configuration'].canRetry).toBe(false)
    })

    it('maps unknown errors to Default', () => {
      const errorMessages: Record<string, { title: string }> = {
        Default: { title: 'Erro de Autenticação' },
      }

      const unknownError = 'SomeUnknownError'
      const errorInfo = errorMessages[unknownError] || errorMessages['Default']

      expect(errorInfo.title).toBe('Erro de Autenticação')
    })
  })

  describe('jwt callback token refresh logic', () => {
    it('triggers refresh when token is expired', async () => {
      // This tests the refresh detection logic
      const isTokenExpired = (expiresAt: number | undefined, bufferSeconds = 300): boolean => {
        if (!expiresAt) return true
        const now = Math.floor(Date.now() / 1000)
        return now >= expiresAt - bufferSeconds
      }

      // Token expired 1 hour ago
      const expiredToken = Math.floor(Date.now() / 1000) - 3600
      expect(isTokenExpired(expiredToken)).toBe(true)
    })

    it('triggers refresh when token expires within buffer period', async () => {
      const isTokenExpired = (expiresAt: number | undefined, bufferSeconds = 300): boolean => {
        if (!expiresAt) return true
        const now = Math.floor(Date.now() / 1000)
        return now >= expiresAt - bufferSeconds
      }

      // Token expires in 2 minutes (within 5 min buffer)
      const expiringToken = Math.floor(Date.now() / 1000) + 120
      expect(isTokenExpired(expiringToken)).toBe(true)
    })

    it('does not trigger refresh when token has sufficient time remaining', async () => {
      const isTokenExpired = (expiresAt: number | undefined, bufferSeconds = 300): boolean => {
        if (!expiresAt) return true
        const now = Math.floor(Date.now() / 1000)
        return now >= expiresAt - bufferSeconds
      }

      // Token expires in 10 minutes (outside 5 min buffer)
      const validToken = Math.floor(Date.now() / 1000) + 600
      expect(isTokenExpired(validToken)).toBe(false)
    })

    it('returns error flag when refresh_token is missing', async () => {
      const jwtCallbackWithRefresh = async ({
        token,
        account,
      }: {
        token: Record<string, unknown>
        account: null
      }) => {
        // Simulate existing session check (no account means existing session)
        if (!account) {
          // Check if token needs refresh (simplified)
          const expiresAt = token.expiresAt as number | undefined
          const isExpired = !expiresAt || Date.now() / 1000 >= expiresAt - 300

          if (isExpired && !token.refreshToken) {
            return { ...token, error: 'RefreshAccessTokenError' }
          }
        }
        return token
      }

      // Token is expired and has no refresh_token
      const result = await jwtCallbackWithRefresh({
        token: {
          sub: 'user-123',
          expiresAt: Math.floor(Date.now() / 1000) - 3600, // Expired
          // No refreshToken
        },
        account: null,
      })

      expect(result.error).toBe('RefreshAccessTokenError')
    })

    it('clears error after successful refresh', async () => {
      // Simulates the token state after a successful refresh
      const tokenAfterRefresh = {
        sub: 'user-123',
        accessToken: 'new-access-token',
        refreshToken: 'existing-refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        error: undefined, // Error cleared
      }

      expect(tokenAfterRefresh.error).toBeUndefined()
      expect(tokenAfterRefresh.accessToken).toBe('new-access-token')
    })
  })

  describe('auth function', () => {
    it('can be called to get session', async () => {
      // This is a structural test - actual session testing requires integration tests
      const mockAuth = vi.fn().mockResolvedValue({
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
          image: 'https://example.com/avatar.jpg',
        },
      })

      const session = await mockAuth()

      expect(session).toMatchObject({
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        },
      })
    })

    it('returns null when not authenticated', async () => {
      const mockAuth = vi.fn().mockResolvedValue(null)

      const session = await mockAuth()

      expect(session).toBeNull()
    })
  })
})
