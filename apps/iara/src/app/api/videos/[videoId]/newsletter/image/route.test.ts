import type { Session } from 'next-auth'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockGetVideoAdmin = vi.fn()
const mockGetPodcastAdmin = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: (...args: unknown[]) => mockGetVideoAdmin(...args),
}))
vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: (...args: unknown[]) => mockGetPodcastAdmin(...args),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

const mockGetNewsletterData = vi.fn()
const mockSaveNewsletterData = vi.fn()
vi.mock('@/lib/firebase/newsletter-admin', () => ({
  getNewsletterData: (...args: unknown[]) => mockGetNewsletterData(...args),
  saveNewsletterData: (...args: unknown[]) => mockSaveNewsletterData(...args),
}))

const mockCallGenAI = vi.fn()
vi.mock('@/lib/llm/client', () => ({
  callGenAI: (...args: unknown[]) => mockCallGenAI(...args),
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

const mockUploadNewsletterImage = vi.fn()
const mockDeleteNewsletterImage = vi.fn()
const mockDownloadNewsletterImage = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  uploadNewsletterImage: (...args: unknown[]) => mockUploadNewsletterImage(...args),
  deleteNewsletterImage: (...args: unknown[]) => mockDeleteNewsletterImage(...args),
  downloadNewsletterImage: (...args: unknown[]) => mockDownloadNewsletterImage(...args),
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

import { GET, POST } from './route'

// --- Fixtures ---

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

function createContext(videoId: string) {
  return { params: Promise.resolve({ videoId }) }
}

function createRequest(body?: Record<string, unknown>) {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
}

const validEpisode = {
  id: 'video-1',
  title: 'Episódio sobre IA',
  description: 'Discussão sobre IA generativa',
  videoType: 'episode',
}

const validPodcast = {
  id: 'pptnc',
  personas: {
    writer: {
      role: 'Redator de newsletters',
      objective: 'Criar newsletters engajantes',
      resume: '10 anos de experiência',
    },
  },
  prompts: {
    episode: {
      newsletter: {
        image: {
          description: 'Gere um prompt descritivo para a imagem de capa',
          expectedOutput: 'Um prompt detalhado para geração de imagem',
        },
      },
    },
  },
}

const validNewsletterData = {
  status: 'news_selected' as const,
  draft: '# Newsletter\n\nConteúdo sobre IA...',
  news: [
    { id: 'n1', title: 'AI News 1' },
    { id: 'n2', title: 'AI News 2' },
  ],
}

const validPromptLLMResponse = {
  data: { imagePrompt: 'A futuristic podcast studio with blue lighting and microphones' },
  usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
}

const validImageResponse = {
  imageBuffer: Buffer.from('fake-png-data'),
  mimeType: 'image/png',
}

// --- SSE helper ---

interface SSEEvent {
  event: string
  data: Record<string, unknown>
}

/**
 * Reads all SSE events from a Response body (ReadableStream).
 */
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

describe('POST /api/videos/[videoId]/newsletter/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation((fn: () => Promise<unknown>) => fn())
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockSaveNewsletterData.mockResolvedValue(undefined)
    mockDeleteNewsletterImage.mockResolvedValue(undefined)
  })

  // --- Validation phase (returns JSON) ---

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 404 when video not found', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(null)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns 400 for non-episode video', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({ ...validEpisode, videoType: 'cut' })
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
  })

  it('returns 400 when draft is missing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue({ status: 'idle' })

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_DRAFT')
  })

  it('returns 400 when image prompt config is missing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      prompts: { episode: { newsletter: {} } },
    })

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PROMPT')
  })

  // --- Generation phase (returns SSE stream) ---

  it('generates image successfully via SSE stream', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validPromptLLMResponse)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsletterImage.mockResolvedValue('newsletters/pptnc/video-1/123.png')

    const response = await POST(createRequest(), createContext('video-1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')

    const events = await readSSEEvents(response)

    // Progress events in order
    expect(events[0]).toEqual({ event: 'progress', data: { step: 'generating_prompt' } })
    expect(events[1]).toEqual({ event: 'progress', data: { step: 'generating_image' } })
    expect(events[2]).toEqual({ event: 'progress', data: { step: 'uploading' } })
    expect(events[3]).toEqual({ event: 'progress', data: { step: 'saving' } })

    // Complete event
    const complete = events.find(e => e.event === 'complete')
    expect(complete).toBeDefined()
    expect(complete!.data.imagePath).toBe('newsletters/pptnc/video-1/123.png')
    expect(complete!.data.imagePrompt).toBe('A futuristic podcast studio with blue lighting and microphones')

    expect(mockEnqueue).toHaveBeenCalledTimes(2)
    expect(mockCallGenAI).toHaveBeenCalledTimes(1)
    expect(mockCallGenAIImage).toHaveBeenCalledWith(
      'A futuristic podcast studio with blue lighting and microphones',
      undefined
    )
    expect(mockUploadNewsletterImage).toHaveBeenCalledWith('video-1', validImageResponse.imageBuffer)
  })

  it('emits error event with imagePrompt when Call 2 (image gen) fails', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validPromptLLMResponse)
    mockCallGenAIImage.mockRejectedValue(
      new LLMError('API_ERROR', 'Image generation failed', true)
    )

    const response = await POST(createRequest(), createContext('video-1'))
    const events = await readSSEEvents(response)

    // Should have progress for prompt gen, then generating_image, then error
    expect(events.some(e => e.event === 'progress' && e.data.step === 'generating_prompt')).toBe(true)
    expect(events.some(e => e.event === 'progress' && e.data.step === 'generating_image')).toBe(true)

    const errorEvent = events.find(e => e.event === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.data.code).toBe('API_ERROR')
    expect(errorEvent!.data.imagePrompt).toBe('A futuristic podcast studio with blue lighting and microphones')
  })

  it('emits error event without imagePrompt when Call 1 (prompt gen) fails', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockRejectedValue(
      new LLMError('TIMEOUT', 'Request timed out', true)
    )

    const response = await POST(createRequest(), createContext('video-1'))
    const events = await readSSEEvents(response)

    const errorEvent = events.find(e => e.event === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.data.code).toBe('TIMEOUT')
    expect(errorEvent!.data.imagePrompt).toBeUndefined()
  })

  it('emits error event when upload fails', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validPromptLLMResponse)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsletterImage.mockRejectedValue(
      new CloudStorageError('Upload failed', 'UPLOAD_FAILED')
    )

    const response = await POST(createRequest(), createContext('video-1'))
    const events = await readSSEEvents(response)

    const errorEvent = events.find(e => e.event === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.data.code).toBe('STORAGE_ERROR')
    // imagePrompt should be preserved since Call 1 succeeded
    expect(errorEvent!.data.imagePrompt).toBe('A futuristic podcast studio with blue lighting and microphones')
  })

  it('deletes previous image on regeneration and applies invalidation', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validPromptLLMResponse)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsletterImage.mockResolvedValue('newsletters/pptnc/video-1/new.png')
    mockGetNewsletterData.mockResolvedValue({
      ...validNewsletterData,
      status: 'image_ready',
      imageUrl: 'newsletters/pptnc/video-1/old.png',
      imagePrompt: 'old prompt',
      report: 'old report',
    })

    const response = await POST(createRequest(), createContext('video-1'))
    const events = await readSSEEvents(response)

    const complete = events.find(e => e.event === 'complete')
    expect(complete).toBeDefined()
    expect(complete!.data.imagePath).toBe('newsletters/pptnc/video-1/new.png')

    // Should delete previous image
    expect(mockDeleteNewsletterImage).toHaveBeenCalledWith('newsletters/pptnc/video-1/old.png')

    // Should apply invalidation via clearFields
    expect(mockSaveNewsletterData).toHaveBeenCalledWith(
      'video-1',
      expect.objectContaining({
        status: 'image_ready',
        imageUrl: 'newsletters/pptnc/video-1/new.png',
        imagePrompt: 'A futuristic podcast studio with blue lighting and microphones',
      }),
      ['report']
    )
  })

  it('emits error event on LLM RATE_LIMIT error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockRejectedValue(
      new LLMError('RATE_LIMIT', 'Rate limit exceeded', true)
    )

    const response = await POST(createRequest(), createContext('video-1'))
    const events = await readSSEEvents(response)

    // SSE stream always returns 200 — errors are in the stream
    expect(response.status).toBe(200)
    const errorEvent = events.find(e => e.event === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.data.code).toBe('RATE_LIMIT')
  })

  it('passes additionalContext to system prompt', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validPromptLLMResponse)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsletterImage.mockResolvedValue('newsletters/pptnc/video-1/img.png')

    const response = await POST(
      createRequest({ additionalContext: 'Use tons de azul' }),
      createContext('video-1')
    )

    // Consume the stream so all side-effects complete
    await readSSEEvents(response)

    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.stringContaining('<user-instruction>Use tons de azul</user-instruction>'),
      expect.any(String),
      60000,
      undefined,
      undefined
    )
  })

  it('skips Call 1 when editedPrompt is provided', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsletterImage.mockResolvedValue('newsletters/pptnc/video-1/edited.png')

    const response = await POST(
      createRequest({ editedPrompt: 'My custom image prompt' }),
      createContext('video-1')
    )
    const events = await readSSEEvents(response)

    // Should NOT have generating_prompt step
    expect(events.some(e => e.data.step === 'generating_prompt')).toBe(false)
    // Should have generating_image step
    expect(events.some(e => e.data.step === 'generating_image')).toBe(true)

    // Call 1 should NOT be called
    expect(mockCallGenAI).not.toHaveBeenCalled()
    // Call 2 should use the edited prompt
    expect(mockCallGenAIImage).toHaveBeenCalledWith('My custom image prompt', undefined)

    const complete = events.find(e => e.event === 'complete')
    expect(complete).toBeDefined()
    expect(complete!.data.imagePrompt).toBe('My custom image prompt')
  })

  it('skips prompt config validation when editedPrompt is provided', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    // Podcast without prompt config — would fail validation for normal flow
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      prompts: { episode: { newsletter: {} } },
    })
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsletterImage.mockResolvedValue('newsletters/pptnc/video-1/edited.png')

    const response = await POST(
      createRequest({ editedPrompt: 'Direct prompt' }),
      createContext('video-1')
    )
    const events = await readSSEEvents(response)

    // Should succeed despite missing prompt config
    const complete = events.find(e => e.event === 'complete')
    expect(complete).toBeDefined()
    expect(complete!.data.imagePrompt).toBe('Direct prompt')
  })

  it('passes 2 separate debugContexts when llmDebugMode enabled', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      features: { llmDebugMode: true },
    })
    mockCallGenAI.mockResolvedValue(validPromptLLMResponse)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsletterImage.mockResolvedValue('newsletters/pptnc/video-1/cover.png')

    const response = await POST(createRequest(), createContext('video-1'))
    await readSSEEvents(response)

    // Call 1 (text): newsletter/image-prompt
    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      undefined,
      expect.objectContaining({ component: 'newsletter/image-prompt' })
    )
    // Call 2 (image): newsletter/image-generate
    expect(mockCallGenAIImage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ component: 'newsletter/image-generate' })
    )
  })

  it('does NOT pass debugContext when llmDebugMode disabled', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validPromptLLMResponse)
    mockCallGenAIImage.mockResolvedValue(validImageResponse)
    mockUploadNewsletterImage.mockResolvedValue('newsletters/pptnc/video-1/cover.png')

    const response = await POST(createRequest(), createContext('video-1'))
    await readSSEEvents(response)

    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      undefined,
      undefined
    )
    expect(mockCallGenAIImage).toHaveBeenCalledWith(
      expect.any(String),
      undefined
    )
  })
})

// --- GET proxy tests ---

function createGETRequest() {
  return new Request('http://localhost/api/videos/video-1/newsletter/image', {
    method: 'GET',
  })
}

describe('GET /api/videos/[videoId]/newsletter/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await GET(createGETRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 404 when newsletter data is missing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue(null)

    const response = await GET(createGETRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns 404 when newsletter has no imageUrl', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue({ status: 'draft', draft: 'some draft' })

    const response = await GET(createGETRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('downloads and serves image as image/png with cache headers', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue({
      status: 'image_ready',
      imageUrl: 'newsletters/pptnc/video-1/123.png',
    })
    mockDownloadNewsletterImage.mockResolvedValue(Buffer.from('fake-png-data'))

    const response = await GET(createGETRequest(), createContext('video-1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600')
    expect(mockDownloadNewsletterImage).toHaveBeenCalledWith('newsletters/pptnc/video-1/123.png')

    const buffer = Buffer.from(await response.arrayBuffer())
    expect(buffer.toString()).toBe('fake-png-data')
  })

  it('returns 404 on CloudStorageError', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue({
      status: 'image_ready',
      imageUrl: 'newsletters/pptnc/video-1/123.png',
    })
    mockDownloadNewsletterImage.mockRejectedValue(
      new CloudStorageError('File not found', 'DOWNLOAD_FAILED')
    )

    const response = await GET(createGETRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('STORAGE_ERROR')
  })

  it('returns 500 on unexpected error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue({
      status: 'image_ready',
      imageUrl: 'newsletters/pptnc/video-1/123.png',
    })
    mockDownloadNewsletterImage.mockRejectedValue(new Error('Network timeout'))

    const response = await GET(createGETRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })
})
