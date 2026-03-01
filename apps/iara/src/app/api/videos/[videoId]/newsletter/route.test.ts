import type { Session } from 'next-auth'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

const mockGetNewsletterData = vi.fn()
const mockPatchNewsletterFields = vi.fn()
vi.mock('@/lib/firebase/newsletter-admin', () => ({
  getNewsletterData: (...args: unknown[]) => mockGetNewsletterData(...args),
  patchNewsletterFields: (...args: unknown[]) => mockPatchNewsletterFields(...args),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { GET, PATCH } from './route'

// --- Fixtures ---

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

function createContext(videoId: string) {
  return { params: Promise.resolve({ videoId }) }
}

function createGetRequest() {
  return new Request('http://localhost', { method: 'GET' })
}

function createPatchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const existingData = {
  status: 'draft' as const,
  draft: '# Newsletter\n\nConteúdo existente...',
}

// --- Tests ---

describe('GET /api/videos/[videoId]/newsletter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await GET(createGetRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns null data when no newsletter data exists', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue(null)

    const response = await GET(createGetRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toBeNull()
  })

  it('returns existing newsletter data', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue(existingData)

    const response = await GET(createGetRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toEqual(existingData)
  })

  it('passes correct videoId to getNewsletterData', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue(null)

    await GET(createGetRequest(), createContext('video-42'))

    expect(mockGetNewsletterData).toHaveBeenCalledWith('video-42')
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockRejectedValue(new Error('Firestore error'))

    const response = await GET(createGetRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })
})

describe('PATCH /api/videos/[videoId]/newsletter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await PATCH(
      createPatchRequest({ draft: 'new' }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('updates draft field successfully', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockPatchNewsletterFields.mockResolvedValue(undefined)

    const response = await PATCH(
      createPatchRequest({ draft: 'Updated draft content' }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toHaveProperty('updatedAt')
    expect(mockPatchNewsletterFields).toHaveBeenCalledWith('video-1', {
      draft: 'Updated draft content',
    })
  })

  it('returns 500 when patchNewsletterFields throws', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockPatchNewsletterFields.mockRejectedValue(new Error('Firestore error'))

    const response = await PATCH(
      createPatchRequest({ draft: 'new draft' }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })

  it('returns 400 when no valid patch fields provided', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue(existingData)

    const response = await PATCH(
      createPatchRequest({}),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('INVALID_BODY')
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockRejectedValue(new Error('DB error'))

    const response = await PATCH(
      createPatchRequest({ draft: 'test' }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })
})
