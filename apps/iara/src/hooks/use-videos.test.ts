import { renderHook, waitFor } from '@/test-utils'

import type { VideoSummary } from '@/types/video'

import { useVideos } from './use-videos'

const mockVideos: VideoSummary[] = [
  {
    id: 'video-1',
    title: 'Video 1',
    thumbnails: { medium: { url: 'https://example.com/1.jpg' } },
    duration: 600,
    status: 'new',
    videoType: 'episode',
  },
  {
    id: 'video-2',
    title: 'Video 2',
    thumbnails: { medium: { url: 'https://example.com/2.jpg' } },
    duration: 300,
    status: 'draft',
    videoType: 'cut',
  },
]

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('useVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna estado inicial de loading', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

    const { result } = renderHook(() => useVideos())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.videos).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('carrega vídeos com sucesso', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: mockVideos,
        pagination: { page: 1, limit: 20, totalCount: 2, totalPages: 1 },
      }),
    })

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.videos).toEqual(mockVideos)
    expect(result.current.error).toBeNull()
    expect(result.current.page).toBe(1)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.totalCount).toBe(2)
    expect(mockFetch).toHaveBeenCalledWith('/api/videos?page=1&limit=20&status=not_sent', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('trata erro de carregamento', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Falha ao carregar vídeos' } }),
    })

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.videos).toEqual([])
    expect(result.current.error).toBe('Falha ao carregar vídeos')
  })

  it('trata erro de rede', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.videos).toEqual([])
    expect(result.current.error).toBe('Network error')
  })

  it('recarrega quando refresh é chamado', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: mockVideos,
        pagination: { page: 1, limit: 20, totalCount: 2, totalPages: 1 },
      }),
    })

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Call refresh
    await result.current.refresh()

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('atualiza página quando setPage é chamado', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: mockVideos,
        pagination: { page: 1, limit: 20, totalCount: 50, totalPages: 3 },
      }),
    })

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Change to page 2
    result.current.setPage(2)

    await waitFor(() => {
      expect(result.current.page).toBe(2)
    })

    expect(mockFetch).toHaveBeenLastCalledWith('/api/videos?page=2&limit=20&status=not_sent', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('filtra por tipo quando setTypeFilter é chamado', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: mockVideos.filter(v => v.videoType === 'episode'),
        pagination: { page: 1, limit: 20, totalCount: 1, totalPages: 1 },
      }),
    })

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Change filter to episode
    result.current.setTypeFilter('episode')

    await waitFor(() => {
      expect(result.current.typeFilter).toBe('episode')
    })

    expect(mockFetch).toHaveBeenLastCalledWith('/api/videos?page=1&limit=20&type=episode&status=not_sent', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('reseta página para 1 quando filtro muda', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: mockVideos,
        pagination: { page: 2, limit: 20, totalCount: 50, totalPages: 3 },
      }),
    })

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // First set page to 2
    result.current.setPage(2)

    await waitFor(() => {
      expect(result.current.page).toBe(2)
    })

    // Then change filter - should reset to page 1
    result.current.setTypeFilter('cut')

    await waitFor(() => {
      expect(result.current.page).toBe(1)
      expect(result.current.typeFilter).toBe('cut')
    })
  })
})
