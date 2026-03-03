import type { Session } from 'next-auth'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockGetNewsById = vi.fn()
vi.mock('@/lib/firebase/news-admin', () => ({
  getNewsById: (...args: unknown[]) => mockGetNewsById(...args),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

const mockDownloadNewsImage = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  downloadNewsImage: (...args: unknown[]) => mockDownloadNewsImage(...args),
  CloudStorageError: class CloudStorageError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'CloudStorageError'
      this.code = code
    }
  },
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { CloudStorageError } from '@/lib/firebase/cloud-storage'

import { GET } from './route'

// --- Fixtures ---

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

function createContext(newsId: string) {
  return { params: Promise.resolve({ newsId }) }
}

function createGETRequest() {
  return new Request('http://localhost/api/news/news-1/image', {
    method: 'GET',
  })
}

// --- Tests ---

describe('GET /api/news/[newsId]/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await GET(createGETRequest(), createContext('news-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 404 when news not found', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue(null)

    const response = await GET(createGETRequest(), createContext('news-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns 404 when news has no imageUrl', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue({
      id: 'news-1',
      titulo: 'Test',
      descricao: '',
      resumo: '',
      comentarios: '',
      data: '2026-03-01',
      fonte: { nome: '', url: '' },
      importedAt: mockTimestamp,
    })

    const response = await GET(createGETRequest(), createContext('news-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('downloads and serves image as image/png with cache headers', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue({
      id: 'news-1',
      titulo: 'Test',
      imageUrl: 'news-images/pptnc/news-1/123.png',
      importedAt: mockTimestamp,
    })
    mockDownloadNewsImage.mockResolvedValue(Buffer.from('fake-png-data'))

    const response = await GET(createGETRequest(), createContext('news-1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600')
    expect(mockDownloadNewsImage).toHaveBeenCalledWith('news-images/pptnc/news-1/123.png')

    const buffer = Buffer.from(await response.arrayBuffer())
    expect(buffer.toString()).toBe('fake-png-data')
  })

  it('returns 404 on CloudStorageError', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue({
      id: 'news-1',
      titulo: 'Test',
      imageUrl: 'news-images/pptnc/news-1/123.png',
      importedAt: mockTimestamp,
    })
    mockDownloadNewsImage.mockRejectedValue(
      new CloudStorageError('File not found', 'DOWNLOAD_FAILED')
    )

    const response = await GET(createGETRequest(), createContext('news-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('STORAGE_ERROR')
  })

  it('returns 500 on unexpected error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue({
      id: 'news-1',
      titulo: 'Test',
      imageUrl: 'news-images/pptnc/news-1/123.png',
      importedAt: mockTimestamp,
    })
    mockDownloadNewsImage.mockRejectedValue(new Error('Network timeout'))

    const response = await GET(createGETRequest(), createContext('news-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })
})
