import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('LinkedIn Auth Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('LINKEDIN_CLIENT_ID', 'test-client-id')
    vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'test-client-secret')
    vi.stubEnv('LINKEDIN_REDIRECT_URI', 'https://iara.test/api/auth/linkedin/callback')
  })

  describe('getLinkedInAuthorizationUrl', () => {
    it('generates URL with correct params', async () => {
      const { getLinkedInAuthorizationUrl } = await import('./auth')
      const url = getLinkedInAuthorizationUrl('test-state-123')

      expect(url).toContain('https://www.linkedin.com/oauth/v2/authorization')
      expect(url).toContain('client_id=test-client-id')
      expect(url).toContain('redirect_uri=')
      expect(url).toContain('state=test-state-123')
      expect(url).toContain('response_type=code')
      expect(url).toContain('scope=')
      expect(url).toContain('w_member_social')
    })

    it('throws when env vars are missing', async () => {
      vi.stubEnv('LINKEDIN_CLIENT_ID', '')

      // Re-import to get fresh module
      vi.resetModules()
      const { getLinkedInAuthorizationUrl } = await import('./auth')

      expect(() => getLinkedInAuthorizationUrl('state')).toThrow('Missing LinkedIn OAuth')
    })
  })

  describe('exchangeLinkedInCode', () => {
    it('exchanges code for tokens successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'at-123',
          refresh_token: 'rt-456',
          expires_in: 5184000,
        }),
      })

      const { exchangeLinkedInCode } = await import('./auth')
      const result = await exchangeLinkedInCode('auth-code-789')

      expect(result.accessToken).toBe('at-123')
      expect(result.refreshToken).toBe('rt-456')
      expect(result.expiresIn).toBe(5184000)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.linkedin.com/oauth/v2/accessToken',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('throws on failed exchange', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error_description: 'Invalid code' }),
      })

      const { exchangeLinkedInCode } = await import('./auth')
      await expect(exchangeLinkedInCode('bad-code')).rejects.toThrow('Invalid code')
    })
  })

  describe('refreshLinkedInToken', () => {
    it('refreshes token successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-at-123',
          refresh_token: 'new-rt-456',
          expires_in: 5184000,
        }),
      })

      const { refreshLinkedInToken } = await import('./auth')
      const result = await refreshLinkedInToken('old-rt')

      expect(result.accessToken).toBe('new-at-123')
      expect(result.expiresIn).toBe(5184000)
    })

    it('throws on refresh failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error_description: 'Refresh token expired' }),
      })

      const { refreshLinkedInToken } = await import('./auth')
      await expect(refreshLinkedInToken('expired-rt')).rejects.toThrow('Refresh token expired')
    })
  })

  describe('getLinkedInOrganizations', () => {
    it('fetches organizations successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          elements: [
            {
              organization: 'urn:li:organization:12345',
              'organization~': { localizedName: 'PPT Não Compila' },
            },
          ],
        }),
      })

      const { getLinkedInOrganizations } = await import('./auth')
      const orgs = await getLinkedInOrganizations('access-token')

      expect(orgs).toHaveLength(1)
      expect(orgs[0].id).toBe('12345')
      expect(orgs[0].name).toBe('PPT Não Compila')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/organizationAcls'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer access-token',
            'LinkedIn-Version': '202503',
          }),
        })
      )
    })

    it('returns empty array when no organizations', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      })

      const { getLinkedInOrganizations } = await import('./auth')
      const orgs = await getLinkedInOrganizations('access-token')

      expect(orgs).toHaveLength(0)
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Forbidden',
        json: () => Promise.resolve({}),
      })

      const { getLinkedInOrganizations } = await import('./auth')
      await expect(getLinkedInOrganizations('bad-token')).rejects.toThrow('Failed to fetch')
    })
  })
})
