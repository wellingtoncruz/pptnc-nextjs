import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { useNewsletterImage } from './use-newsletter-image'

/**
 * Creates a mock fetch response that returns an SSE stream.
 */
function createSSEResponse(events: Array<{ event: string; data: Record<string, unknown> }>) {
  const chunks = events.map(
    (e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`
  )
  const encoder = new TextEncoder()

  let resolveRead: ((value: ReadableStreamReadResult<Uint8Array>) => void) | null = null
  let chunkIndex = 0

  const body = new ReadableStream<Uint8Array>({
    start() {},
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(chunks[chunkIndex]))
        chunkIndex++
      } else {
        controller.close()
      }
    },
  })

  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body,
    json: () => Promise.reject(new Error('SSE stream, not JSON')),
  }
}

/** SSE response a partir de chunks brutos (p/ testar heartbeats ': ping'). */
function createRawSSEResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]))
        i++
      } else {
        controller.close()
      }
    },
  })
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body,
    json: () => Promise.reject(new Error('SSE stream, not JSON')),
  }
}

describe('useNewsletterImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in loading state when videoId is provided', () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsletterImage('video-1'))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.imageUrl).toBeNull()
    expect(result.current.imagePrompt).toBeNull()
    expect(result.current.generatingStep).toBeNull()
  })

  it('fetches existing image data on mount and constructs proxy URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          status: 'image_ready',
          imageUrl: 'newsletters/pptnc/video-1/123.png',
          imagePrompt: 'A beautiful podcast studio',
        },
      }),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsletterImage('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Hook constructs a proxy URL (not the raw GCS path)
    expect(result.current.imageUrl).toMatch(/^\/api\/videos\/video-1\/newsletter\/image\?t=\d+$/)
    expect(result.current.imagePrompt).toBe('A beautiful podcast studio')
    expect(result.current.newsletterStatus).toBe('image_ready')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('generates image via POST SSE stream and returns true on success', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { status: 'news_selected' } }),
      })
      .mockResolvedValueOnce(createSSEResponse([
        { event: 'progress', data: { step: 'generating_prompt' } },
        { event: 'progress', data: { step: 'generating_image' } },
        { event: 'progress', data: { step: 'uploading' } },
        { event: 'progress', data: { step: 'saving' } },
        { event: 'complete', data: { imagePath: 'newsletters/pptnc/video-1/456.png', imagePrompt: 'Generated prompt' } },
      ]))
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsletterImage('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.generate('Use blue tones')
    })

    expect(success).toBe(true)
    expect(result.current.imageUrl).toMatch(/^\/api\/videos\/video-1\/newsletter\/image\?t=\d+$/)
    expect(result.current.imagePrompt).toBe('Generated prompt')
    expect(result.current.newsletterStatus).toBe('image_ready')
    expect(result.current.isGenerating).toBe(false)

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter/image',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalContext: 'Use blue tones' }),
      })
    )
  })

  it('ignores SSE heartbeat comments interleaved with events (Epic 27 / ADR-27.3)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { status: 'news_selected' } }),
      })
      .mockResolvedValueOnce(createRawSSEResponse([
        ': ping\n\n',
        'event: progress\ndata: {"step":"generating_image"}\n\n',
        ': ping\n\n',
        'event: complete\ndata: {"imagePath":"newsletters/pptnc/video-1/789.png","imagePrompt":"P"}\n\n',
      ]))
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsletterImage('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.generate()
    })

    // Heartbeats não quebram o parser; o complete é processado normalmente.
    expect(success).toBe(true)
    expect(result.current.imagePrompt).toBe('P')
    expect(result.current.newsletterStatus).toBe('image_ready')
  })

  it('returns false when generation fails via SSE error event', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { status: 'news_selected' } }),
      })
      .mockResolvedValueOnce(createSSEResponse([
        { event: 'progress', data: { step: 'generating_prompt' } },
        { event: 'error', data: { code: 'API_ERROR', message: 'Image gen failed', imagePrompt: 'The prompt' } },
      ]))
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsletterImage('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.generate()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Image gen failed')
    expect(result.current.errorImagePrompt).toBe('The prompt')
  })

  it('returns false when validation fails (non-200 JSON)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { status: 'news_selected' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        body: null,
        json: () => Promise.resolve({
          error: { code: 'MISSING_DRAFT', message: 'Draft not found' },
        }),
      })
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsletterImage('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.generate()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Draft not found')
  })

  it('sends editedPrompt via regenerateFromPrompt', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { status: 'image_ready', imageUrl: 'path.png', imagePrompt: 'old' } }),
      })
      .mockResolvedValueOnce(createSSEResponse([
        { event: 'progress', data: { step: 'generating_image' } },
        { event: 'complete', data: { imagePath: 'new.png', imagePrompt: 'edited prompt' } },
      ]))
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsletterImage('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.regenerateFromPrompt('edited prompt')
    })

    expect(success).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter/image',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedPrompt: 'edited prompt' }),
      })
    )
  })

  it('retries with last editedPrompt', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { status: 'news_selected' } }),
      })
      // First: regenerateFromPrompt fails
      .mockResolvedValueOnce(createSSEResponse([
        { event: 'error', data: { code: 'TIMEOUT', message: 'Timeout' } },
      ]))
      // Retry succeeds
      .mockResolvedValueOnce(createSSEResponse([
        { event: 'complete', data: { imagePath: 'new.png', imagePrompt: 'my edited prompt' } },
      ]))
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsletterImage('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.regenerateFromPrompt('my edited prompt')
    })

    expect(result.current.error).toBe('Timeout')

    await act(async () => {
      result.current.retry()
    })

    await waitFor(() => {
      expect(result.current.imageUrl).toMatch(/^\/api\/videos\/video-1\/newsletter\/image\?t=\d+$/)
    })

    // Verify retry used editedPrompt
    const lastCall = mockFetch.mock.calls[2]
    expect(JSON.parse(lastCall[1].body)).toEqual({ editedPrompt: 'my edited prompt' })
  })

  it('resets state when videoId changes to null', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          status: 'image_ready',
          imageUrl: 'newsletters/pptnc/video-1/123.png',
          imagePrompt: 'prompt',
        },
      }),
    })
    global.fetch = mockFetch

    const { result, rerender } = renderHook(
      ({ videoId }) => useNewsletterImage(videoId),
      { initialProps: { videoId: 'video-1' as string | null } }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    rerender({ videoId: null })

    expect(result.current.imageUrl).toBeNull()
    expect(result.current.imagePrompt).toBeNull()
    expect(result.current.newsletterStatus).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.generatingStep).toBeNull()
  })

  it('handles fetch error gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    })
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsletterImage('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Falha ao carregar dados da newsletter')
  })
})
