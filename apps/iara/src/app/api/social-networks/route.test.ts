import type { Session } from 'next-auth'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockGetSocialNetworks = vi.fn()
vi.mock('@/lib/firebase/social-admin', () => ({
  getSocialNetworks: () => mockGetSocialNetworks(),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { GET } from './route'

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

describe('GET /api/social-networks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 401 when session has error', async () => {
    mockAuthFn.mockResolvedValue({ ...validSession, error: 'RefreshAccessTokenError' } as Session)

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns social networks on success', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetSocialNetworks.mockResolvedValue([
      { id: 'instagram', name: 'Instagram', icon: '📷', createdAt: '2024-01-01' },
      { id: 'twitter', name: 'X (Twitter)', icon: '🐦', createdAt: '2024-01-01' },
    ])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toHaveLength(2)
    expect(json.data[0].id).toBe('instagram')
    expect(json.data[1].id).toBe('twitter')
  })

  it('returns empty array when no networks exist', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetSocialNetworks.mockResolvedValue([])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual([])
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetSocialNetworks.mockRejectedValue(new Error('Firestore error'))

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
    expect(json.error.message).toBe('Erro ao carregar redes sociais')
  })
})
