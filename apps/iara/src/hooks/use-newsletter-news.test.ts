import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, renderHook, waitFor } from '@/test-utils'

import { useNewsletterNews } from './use-newsletter-news'

const mockFetch = vi.fn()

const existingConfirmedNewsletter = {
  status: 'news_selected',
  draft: 'Some draft',
  news: [
    { id: 'n1', title: 'News 1', description: 'Desc 1' },
    { id: 'n2', title: 'News 2', description: 'Desc 2' },
    { id: 'n3', title: 'News 3', description: 'Desc 3' },
  ],
}

const draftNewsletter = {
  status: 'draft',
  draft: 'Some draft',
}

const candidatesResponse = {
  items: [
    { id: 'c1', title: 'Candidate 1', description: 'Desc 1', source: 'Source', url: 'https://example.com', publishedAt: '2026-02-23' },
    { id: 'c2', title: 'Candidate 2', description: 'Desc 2', source: 'Source', url: 'https://example.com', publishedAt: '2026-02-23' },
    { id: 'c3', title: 'Candidate 3', description: 'Desc 3', source: 'Source', url: 'https://example.com', publishedAt: '2026-02-23' },
  ],
  totalFound: 5,
  llmFiltered: false,
}

describe('useNewsletterNews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna estado inicial quando videoId é null', () => {
    const { result } = renderHook(() => useNewsletterNews(null))

    expect(result.current.candidates).toBeNull()
    expect(result.current.confirmedNews).toBeNull()
    expect(result.current.newsletterStatus).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFetching).toBe(false)
    expect(result.current.isConfirming).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.totalFound).toBe(0)
    expect(result.current.llmFiltered).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('carrega notícias confirmadas via GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingConfirmedNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterNews('video-1'))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.confirmedNews).toHaveLength(3)
    expect(result.current.newsletterStatus).toBe('news_selected')
    expect(result.current.candidates).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('não carrega confirmedNews quando status é draft', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: draftNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterNews('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.confirmedNews).toBeNull()
    expect(result.current.newsletterStatus).toBe('draft')
  })

  it('busca candidatas via fetchNews()', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: draftNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterNews('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: candidatesResponse }),
    })

    await act(async () => {
      await result.current.fetchNews()
    })

    expect(result.current.candidates).toHaveLength(3)
    expect(result.current.totalFound).toBe(5)
    expect(result.current.llmFiltered).toBe(false)
    expect(result.current.isFetching).toBe(false)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter/news',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) })
    )
  })

  it('retorna candidatas vazias quando nenhuma notícia encontrada', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: draftNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterNews('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { items: [], totalFound: 0, llmFiltered: false } }),
    })

    await act(async () => {
      await result.current.fetchNews()
    })

    expect(result.current.candidates).toHaveLength(0)
    expect(result.current.totalFound).toBe(0)
  })

  it('confirma seleção via confirmSelection()', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: draftNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterNews('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const selectedNews = [
      { id: 'c1', title: 'Candidate 1' },
      { id: 'c2', title: 'Candidate 2' },
      { id: 'c3', title: 'Candidate 3' },
    ]

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { status: 'news_selected' } }),
    })

    await act(async () => {
      await result.current.confirmSelection(selectedNews)
    })

    expect(result.current.confirmedNews).toHaveLength(3)
    expect(result.current.newsletterStatus).toBe('news_selected')
    expect(result.current.candidates).toBeNull()
    expect(result.current.isConfirming).toBe(false)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter/news',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news: selectedNews }),
      })
    )
  })

  it('lida com erro no fetchNews', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: draftNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterNews('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
    })

    await act(async () => {
      await result.current.fetchNews()
    })

    expect(result.current.error).toBe('Rate limit exceeded')
    expect(result.current.isFetching).toBe(false)
    expect(result.current.candidates).toBeNull()
  })

  it('cancela request ao trocar videoId', async () => {
    let resolveFirst: (value: unknown) => void
    mockFetch.mockImplementationOnce(() =>
      new Promise(resolve => { resolveFirst = resolve })
    )

    const { result, rerender } = renderHook(
      ({ videoId }) => useNewsletterNews(videoId),
      { initialProps: { videoId: 'video-1' as string | null } }
    )

    expect(result.current.isLoading).toBe(true)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingConfirmedNewsletter }),
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

    expect(result.current.confirmedNews).toHaveLength(3)
  })

  it('fetchNews limpa confirmedNews para mostrar candidatas', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingConfirmedNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterNews('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.confirmedNews).toHaveLength(3)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: candidatesResponse }),
    })

    await act(async () => {
      await result.current.fetchNews()
    })

    expect(result.current.confirmedNews).toBeNull()
    expect(result.current.candidates).toHaveLength(3)
  })

  it('re-fetch limpa candidatas anteriores', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: draftNewsletter }),
    })

    const { result } = renderHook(() => useNewsletterNews('video-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // First fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: candidatesResponse }),
    })

    await act(async () => {
      await result.current.fetchNews()
    })

    expect(result.current.candidates).toHaveLength(3)

    // Second fetch (re-fetch)
    const newCandidates = {
      items: [{ id: 'x1', title: 'New 1' }],
      totalFound: 1,
      llmFiltered: false,
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: newCandidates }),
    })

    await act(async () => {
      await result.current.fetchNews()
    })

    expect(result.current.candidates).toHaveLength(1)
    expect(result.current.candidates![0].id).toBe('x1')
  })
})
