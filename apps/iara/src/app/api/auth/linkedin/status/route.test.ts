import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockAuth = vi.fn()
const mockGetProviderTokensWithExpiry = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

vi.mock('@/lib/auth/require-admin', () => ({
  requireAuth: vi.fn((session) => {
    if (!session) {
      return NextResponse.json({ error: { code: 'AUTH_EXPIRED' } }, { status: 401 })
    }
    return null
  }),
}))

vi.mock('@/lib/firebase/tokens', () => ({
  getProviderTokensWithExpiry: (...args: unknown[]) => mockGetProviderTokensWithExpiry(...args),
}))

import { GET } from './route'

const mockSession = {
  user: { id: 'user-1', role: 'admin' },
}

describe('GET /api/auth/linkedin/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(mockSession)
  })

  it('returns connected: false when no tokens', async () => {
    mockGetProviderTokensWithExpiry.mockResolvedValue(null)

    const response = await GET()
    const data = await response.json()

    expect(data.data.connected).toBe(false)
  })

  it('returns connected: true with target info', async () => {
    mockGetProviderTokensWithExpiry.mockResolvedValue({
      accessToken: 'at',
      expiresAt: 9999999999,
      needsRefresh: false,
      metadata: {
        targetId: '12345',
        targetName: 'PPT Não Compila',
        targetType: 'page',
      },
    })

    const response = await GET()
    const data = await response.json()

    expect(data.data.connected).toBe(true)
    expect(data.data.targetName).toBe('PPT Não Compila')
    expect(data.data.targetId).toBe('12345')
    expect(data.data.targetType).toBe('page')
    expect(data.data.needsRefresh).toBe(false)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)

    const response = await GET()
    expect(response.status).toBe(401)
  })
})
