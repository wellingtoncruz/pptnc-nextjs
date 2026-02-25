import type { Session } from 'next-auth'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockGetSocialPosts = vi.fn()
vi.mock('@/lib/firebase/social-admin', () => ({
  getSocialPosts: (...args: unknown[]) => mockGetSocialPosts(...args),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { GET } from './route'

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

function createContext(videoId: string) {
  return { params: Promise.resolve({ videoId }) }
}

describe('GET /api/videos/[videoId]/social-posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost'), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns social posts array on success', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    const mockTimestamp = { seconds: 1700000000, nanoseconds: 0 }
    mockGetSocialPosts.mockResolvedValue([
      { networkId: 'instagram', cta: 'Confira!', body: 'Post body', hashtags: ['#tech'], generatedAt: mockTimestamp, updatedAt: mockTimestamp, processedBy: 'llm' },
    ])

    const response = await GET(new Request('http://localhost'), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].networkId).toBe('instagram')
    expect(mockGetSocialPosts).toHaveBeenCalledWith('video-1')
  })

  it('returns empty array when no posts exist', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetSocialPosts.mockResolvedValue([])

    const response = await GET(new Request('http://localhost'), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual([])
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetSocialPosts.mockRejectedValue(new Error('Firestore error'))

    const response = await GET(new Request('http://localhost'), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
    expect(json.error.message).toBe('Erro ao carregar posts sociais')
  })
})
