import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { useNewsImage } from './use-news-image'

/**
 * Creates a mock fetch response that returns an SSE stream.
 */
function createSSEResponse(events: Array<{ event: string; data: Record<string, unknown> }>) {
  const chunks = events.map(
    (e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`
  )
  const encoder = new TextEncoder()
  let chunkIndex = 0

  const body = new ReadableStream<Uint8Array>({
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

describe('useNewsImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with null imageUrl when no initial image', () => {
    const { result } = renderHook(() => useNewsImage('news-1'))

    expect(result.current.imageUrl).toBeNull()
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('starts with proxy URL when initial imageUrl is provided', () => {
    const { result } = renderHook(() => useNewsImage('news-1', 'news-images/pptnc/news-1/123.png'))

    expect(result.current.imageUrl).toMatch(/^\/api\/news\/news-1\/image\?t=\d+$/)
  })

  it('generates image via POST SSE stream and returns true on success', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(createSSEResponse([
      { event: 'progress', data: { step: 'generating_image' } },
      { event: 'progress', data: { step: 'uploading' } },
      { event: 'progress', data: { step: 'saving' } },
      { event: 'complete', data: { imagePath: 'news-images/pptnc/news-1/456.png' } },
    ]))

    const { result } = renderHook(() => useNewsImage('news-1'))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.generateImage()
    })

    expect(success).toBe(true)
    expect(result.current.imageUrl).toMatch(/^\/api\/news\/news-1\/image\?t=\d+$/)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sends additionalContext in POST body', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(createSSEResponse([
      { event: 'complete', data: { imagePath: 'new.png' } },
    ]))
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsImage('news-1'))

    await act(async () => {
      await result.current.generateImage('Use tons de azul')
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/news/news-1/generate-image',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalContext: 'Use tons de azul' }),
      })
    )
  })

  it('sends POST without body when no additionalContext', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(createSSEResponse([
      { event: 'complete', data: { imagePath: 'new.png' } },
    ]))
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsImage('news-1'))

    await act(async () => {
      await result.current.generateImage()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/news/news-1/generate-image',
      expect.objectContaining({
        method: 'POST',
      })
    )
    // No body or headers when no additionalContext
    const callArgs = mockFetch.mock.calls[0][1]
    expect(callArgs.body).toBeUndefined()
  })

  it('returns false and sets error on SSE error event', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(createSSEResponse([
      { event: 'progress', data: { step: 'generating_image' } },
      { event: 'error', data: { code: 'API_ERROR', message: 'Image gen failed' } },
    ]))

    const { result } = renderHook(() => useNewsImage('news-1'))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.generateImage()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Image gen failed')
    expect(result.current.isGenerating).toBe(false)
  })

  it('returns false and sets error on validation failure (non-200)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: { code: 'MISSING_PROMPT', message: 'Prompt not configured' },
      }),
    })

    const { result } = renderHook(() => useNewsImage('news-1'))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.generateImage()
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('Prompt not configured')
  })

  it('aborts previous request when generating again', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(createSSEResponse([
        { event: 'complete', data: { imagePath: 'first.png' } },
      ]))
      .mockResolvedValueOnce(createSSEResponse([
        { event: 'complete', data: { imagePath: 'second.png' } },
      ]))
    global.fetch = mockFetch

    const { result } = renderHook(() => useNewsImage('news-1'))

    await act(async () => {
      await result.current.generateImage()
    })

    await act(async () => {
      await result.current.generateImage('new context')
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
