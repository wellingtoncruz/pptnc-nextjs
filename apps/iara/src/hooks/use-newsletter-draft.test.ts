import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, renderHook, waitFor } from '@/test-utils'

// Epic 27: generate usa runAsyncJob (job+polling); GET/PATCH seguem em fetch.
vi.mock('@/lib/jobs/run-async-job', () => ({ runAsyncJob: vi.fn() }))

import { runAsyncJob } from '@/lib/jobs/run-async-job'
import { useNewsletterDraft } from './use-newsletter-draft'

const mockRunAsyncJob = vi.mocked(runAsyncJob)
const mockFetch = vi.fn()

const existingNewsletter = {
  status: 'draft',
  draft: '# Newsletter\n\nConteúdo existente...',
}

describe('useNewsletterDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna estado inicial quando videoId é null', () => {
    const { result } = renderHook(() => useNewsletterDraft(null))

    expect(result.current.draft).toBeNull()
    expect(result.current.newsletterStatus).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('carrega dados existentes via GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterDraft('video-1'))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.draft).toBe('# Newsletter\n\nConteúdo existente...')
    expect(result.current.newsletterStatus).toBe('draft')
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('NÃO auto-gera quando GET retorna null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })

    const { result } = renderHook(() => useNewsletterDraft('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.draft).toBeNull()
    expect(result.current.newsletterStatus).toBeNull()
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    // Apenas GET, sem POST
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('gera draft via generate()', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      })

    const { result } = renderHook(() => useNewsletterDraft('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    mockRunAsyncJob.mockResolvedValueOnce({ draft: '# Draft Gerado\n\nConteúdo novo...' })

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.draft).toBe('# Draft Gerado\n\nConteúdo novo...')
    expect(result.current.newsletterStatus).toBe('draft')
    expect(result.current.isGenerating).toBe(false)
    expect(mockRunAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/videos/video-1/newsletter/draft' })
    )
  })

  it('envia additionalContext no generate', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })

    const { result } = renderHook(() => useNewsletterDraft('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    mockRunAsyncJob.mockResolvedValueOnce({ draft: 'draft' })

    await act(async () => {
      await result.current.generate('Foque nos highlights')
    })

    expect(mockRunAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/videos/video-1/newsletter/draft',
        body: { additionalContext: 'Foque nos highlights' },
      })
    )
  })

  it('salva draft via PATCH', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterDraft('video-1'))

    await waitFor(() => {
      expect(result.current.draft).toBe('# Newsletter\n\nConteúdo existente...')
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { updatedAt: '2026-02-27' } }),
    })

    await act(async () => {
      await result.current.saveDraft('Draft editado')
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: 'Draft editado' }),
      })
    )
  })

  it('lida com erro no GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    const { result } = renderHook(() => useNewsletterDraft('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.draft).toBeNull()
    expect(result.current.error).toBe('Falha ao carregar dados da newsletter')
  })

  it('lida com erro no generate', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      })

    const { result } = renderHook(() => useNewsletterDraft('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    mockRunAsyncJob.mockRejectedValueOnce(new Error('Rate limit exceeded'))

    await act(async () => {
      await result.current.generate()
    })

    expect(result.current.error).toBe('Rate limit exceeded')
    expect(result.current.isGenerating).toBe(false)
  })

  it('retry re-dispara generate com último additionalContext', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })

    const { result } = renderHook(() => useNewsletterDraft('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // First generate fails
    mockRunAsyncJob.mockRejectedValueOnce(new Error('Timeout'))

    await act(async () => {
      await result.current.generate('Contexto específico')
    })

    expect(result.current.error).toBe('Timeout')

    // Retry
    mockRunAsyncJob.mockResolvedValueOnce({ draft: 'Retry draft' })

    await act(async () => {
      result.current.retry()
    })

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false)
    })

    expect(result.current.draft).toBe('Retry draft')
    expect(result.current.error).toBeNull()
  })

  it('cancela request ao trocar videoId', async () => {
    let resolveFirst: (value: unknown) => void
    mockFetch.mockImplementationOnce(() =>
      new Promise(resolve => { resolveFirst = resolve })
    )

    const { result, rerender } = renderHook(
      ({ videoId }) => useNewsletterDraft(videoId),
      { initialProps: { videoId: 'video-1' as string | null } }
    )

    expect(result.current.isLoading).toBe(true)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingNewsletter }),
    })

    rerender({ videoId: 'video-2' })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-2/newsletter',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )

    // Resolve first to cleanup
    resolveFirst!({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })

    expect(result.current.draft).toBe('# Newsletter\n\nConteúdo existente...')
  })
})
