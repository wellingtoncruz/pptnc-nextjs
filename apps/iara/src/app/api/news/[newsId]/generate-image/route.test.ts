import type { Session } from 'next-auth'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockGetNewsById = vi.fn()
const mockUpdateNewsImageFields = vi.fn()
vi.mock('@/lib/firebase/news-admin', () => ({
  getNewsById: (...args: unknown[]) => mockGetNewsById(...args),
  updateNewsImageFields: (...args: unknown[]) => mockUpdateNewsImageFields(...args),
}))

const mockGetPodcastAdmin = vi.fn()
vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: (...args: unknown[]) => mockGetPodcastAdmin(...args),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

const mockCallGenAIImage = vi.fn()
vi.mock('@/lib/llm/image-client', () => ({
  callGenAIImage: (...args: unknown[]) => mockCallGenAIImage(...args),
}))

const mockEnqueue = vi.fn()
vi.mock('@/lib/llm/queue', () => ({
  llmQueue: {
    enqueue: (fn: () => Promise<unknown>) => mockEnqueue(fn),
  },
}))

const mockUploadNewsImage = vi.fn()
const mockDeleteNewsImage = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  uploadNewsImage: (...args: unknown[]) => mockUploadNewsImage(...args),
  deleteNewsImage: (...args: unknown[]) => mockDeleteNewsImage(...args),
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

import { LLMError } from '@/lib/llm/errors'
import { CloudStorageError } from '@/lib/firebase/cloud-storage'

import { POST } from './route'

// --- Fixtures ---

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

const validNews = {
  id: 'news-1',
  titulo: 'IA revoluciona mercado',
  descricao: 'Novas ferramentas de IA surgem',
  comentarios: 'Especialistas comentam',
  resumo: 'Resumo',
  data: '2026-03-01',
  fonte: { nome: 'TechCrunch', url: 'https://techcrunch.com' },
  importedAt: mockTimestamp,
}

const validPodcast = {
  id: 'pptnc',
  prompts: {
    news: {
      news_image: {
        description: 'Gere uma imagem ilustrativa',
        expectedOutput: 'Uma imagem PNG estilo editorial',
      },
    },
  },
}

const validImageResponse = {
  imageBuffer: Buffer.from('fake-png-data'),
  mimeType: 'image/png',
}

function createContext(newsId: string) {
  return { params: Promise.resolve({ newsId }) }
}

function createRequest(body?: Record<string, unknown>) {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
}

// --- SSE helper ---

interface SSEEvent {
  event: string
  data: Record<string, unknown>
}

async function readSSEEvents(response: Response): Promise<SSEEvent[]> {
  const text = await response.text()
  const events: SSEEvent[] = []

  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue
    const eventMatch = block.match(/event: (\w+)/)
    const dataMatch = block.match(/data: (.+)/)
    if (!eventMatch || !dataMatch) continue
    events.push({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) })
  }

  return events
}

// --- Tests ---

describe('POST /api/news/[newsId]/generate-image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation((fn: () => Promise<unknown>) => fn())
    mockUpdateNewsImageFields.mockResolvedValue(undefined)
    mockDeleteNewsImage.mockResolvedValue(undefined)
  })

  // --- Validation phase (returns JSON) ---

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await POST(createRequest(), createContext('news-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 404 when news not found', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue(null)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('news-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns 400 when prompt config not configured', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue(validNews)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      prompts: { news: {} },
    })

    const response = await POST(createRequest(), createContext('news-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PROMPT')
  })

  it('returns 400 when additionalContext exceeds 500 chars', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue(validNews)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(
      createRequest({ additionalContext: 'x'.repeat(501) }),
      createContext('news-1')
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  // --- Generation phase (returns SSE stream) ---

  it('generates image successfully via SSE stream', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue(validNews)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsImage.mockResolvedValue('news-images/pptnc/news-1/123.png')

    const response = await POST(createRequest(), createContext('news-1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')

    const events = await readSSEEvents(response)

    // 3 progress events in order
    expect(events[0]).toEqual({ event: 'progress', data: { step: 'generating_image' } })
    expect(events[1]).toEqual({ event: 'progress', data: { step: 'uploading' } })
    expect(events[2]).toEqual({ event: 'progress', data: { step: 'saving' } })

    // Complete event
    const complete = events.find(e => e.event === 'complete')
    expect(complete).toBeDefined()
    expect(complete!.data.imagePath).toBe('news-images/pptnc/news-1/123.png')

    // Verify callGenAIImage was called with prompt containing news fields
    expect(mockCallGenAIImage).toHaveBeenCalledWith(
      expect.stringContaining('IA revoluciona mercado'),
      undefined,
      undefined
    )
    expect(mockUploadNewsImage).toHaveBeenCalledWith('news-1', validImageResponse.imageBuffer)
    expect(mockUpdateNewsImageFields).toHaveBeenCalledWith(
      'pptnc',
      'news-1',
      expect.objectContaining({
        imageUrl: 'news-images/pptnc/news-1/123.png',
      })
    )
  })

  it('deletes previous image when regenerating', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue({
      ...validNews,
      imageUrl: 'news-images/pptnc/news-1/old.png',
    })
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsImage.mockResolvedValue('news-images/pptnc/news-1/new.png')

    const response = await POST(createRequest(), createContext('news-1'))
    await readSSEEvents(response)

    expect(mockDeleteNewsImage).toHaveBeenCalledWith('news-images/pptnc/news-1/old.png')
  })

  it('does NOT delete when no previous image', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue(validNews) // no imageUrl
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsImage.mockResolvedValue('news-images/pptnc/news-1/123.png')

    const response = await POST(createRequest(), createContext('news-1'))
    await readSSEEvents(response)

    expect(mockDeleteNewsImage).not.toHaveBeenCalled()
  })

  it('passes additionalContext to prompt', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue(validNews)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsImage.mockResolvedValue('news-images/pptnc/news-1/123.png')

    const response = await POST(
      createRequest({ additionalContext: 'Use tons de azul' }),
      createContext('news-1')
    )
    await readSSEEvents(response)

    expect(mockCallGenAIImage).toHaveBeenCalledWith(
      expect.stringContaining('Use tons de azul'),
      undefined,
      undefined
    )
  })

  it('emits error event when image generation fails', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue(validNews)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAIImage.mockRejectedValue(
      new LLMError('API_ERROR', 'Image generation failed', true)
    )

    const response = await POST(createRequest(), createContext('news-1'))
    const events = await readSSEEvents(response)

    expect(response.status).toBe(200) // SSE always 200
    const errorEvent = events.find(e => e.event === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.data.code).toBe('API_ERROR')
  })

  it('emits error event when upload fails', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsById.mockResolvedValue(validNews)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsImage.mockRejectedValue(
      new CloudStorageError('Upload failed', 'UPLOAD_FAILED')
    )

    const response = await POST(createRequest(), createContext('news-1'))
    const events = await readSSEEvents(response)

    const errorEvent = events.find(e => e.event === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.data.code).toBe('STORAGE_ERROR')
  })
})
