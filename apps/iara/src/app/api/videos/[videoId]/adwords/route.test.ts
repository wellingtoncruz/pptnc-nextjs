import type { Session } from 'next-auth'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockGetAdwordsData = vi.fn()
const mockSaveAdwordsData = vi.fn()
vi.mock('@/lib/firebase/adwords-admin', () => ({
  getAdwordsData: (...args: unknown[]) => mockGetAdwordsData(...args),
  saveAdwordsData: (...args: unknown[]) => mockSaveAdwordsData(...args),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { GET, POST } from './route'

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

function createContext(videoId: string) {
  return { params: Promise.resolve({ videoId }) }
}

describe('GET /api/videos/[videoId]/adwords', () => {
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

  it('returns adwords data on success', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    const mockTimestamp = { seconds: 1700000000, nanoseconds: 0 }
    mockGetAdwordsData.mockResolvedValue({
      guide: '# Guia AdWords',
      keywords: ['podcast', 'tech'],
      generatedAt: mockTimestamp,
    })

    const response = await GET(new Request('http://localhost'), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.guide).toBe('# Guia AdWords')
    expect(json.data.keywords).toEqual(['podcast', 'tech'])
    expect(mockGetAdwordsData).toHaveBeenCalledWith('video-1')
  })

  it('returns { data: null } when no adwords data exists', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetAdwordsData.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost'), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toBeNull()
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetAdwordsData.mockRejectedValue(new Error('Firestore error'))

    const response = await GET(new Request('http://localhost'), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })
})

describe('POST /api/videos/[videoId]/adwords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSaveAdwordsData.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guide: 'test', keywords: [] }),
    })

    const response = await POST(request, createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('saves adwords data and returns generatedAt', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guide: '# Guia', keywords: ['podcast'] }),
    })

    const response = await POST(request, createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toHaveProperty('generatedAt')
    expect(mockSaveAdwordsData).toHaveBeenCalledWith('video-1', {
      guide: '# Guia',
      keywords: ['podcast'],
    })
  })

  it('saves with additionalContext when provided', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guide: '# Guia', keywords: [], additionalContext: 'Focar em IA' }),
    })

    const response = await POST(request, createContext('video-1'))

    expect(response.status).toBe(200)
    expect(mockSaveAdwordsData).toHaveBeenCalledWith('video-1', {
      guide: '# Guia',
      keywords: [],
      additionalContext: 'Focar em IA',
    })
  })

  it('returns 400 on invalid body (missing guide)', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: [] }),
    })

    const response = await POST(request, createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 on invalid body (missing keywords)', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guide: 'test' }),
    })

    const response = await POST(request, createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 on malformed JSON body', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    })

    const response = await POST(request, createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockSaveAdwordsData.mockRejectedValue(new Error('Firestore error'))

    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guide: '# Guia', keywords: [] }),
    })

    const response = await POST(request, createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })
})
