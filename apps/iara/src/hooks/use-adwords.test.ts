import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, renderHook, waitFor } from '@/test-utils'

import type { AdwordsData } from '@/types/adwords'

import { useAdwords } from './use-adwords'

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockAdwordsData: AdwordsData = {
  guide: '# Guia AdWords\n\nConteúdo do guia...',
  keywords: ['keyword1', 'keyword2', 'keyword3'],
  generatedAt: '2026-02-26T00:00:00Z',
}

describe('useAdwords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna estado inicial quando videoId é null', () => {
    const { result } = renderHook(() => useAdwords(null, true))

    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('carrega dados existentes via GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockAdwordsData }),
    })

    const { result } = renderHook(() => useAdwords('video-1', true))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual(mockAdwordsData)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/adwords',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    // Apenas GET chamado, sem POST
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('auto-gera via POST quando GET retorna null e hasPrerequisites é true', async () => {
    const generatedData = {
      guide: 'Guia gerado',
      keywords: ['kw1'],
      generatedAt: '2026-02-26T01:00:00Z',
    }

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: generatedData }),
      })

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.data).toEqual(generatedData)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()

    // GET + POST generate
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/adwords/generate',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) })
    )
  })

  it('isGenerating fica true durante auto-geração', async () => {
    let resolveGenerate: (value: unknown) => void
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      })
      .mockImplementationOnce(() =>
        new Promise(resolve => { resolveGenerate = resolve })
      )

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(true)
    })

    expect(result.current.isLoading).toBe(false)

    // Resolver o generate
    await act(async () => {
      resolveGenerate!({
        ok: true,
        json: () => Promise.resolve({ data: mockAdwordsData }),
      })
    })

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false)
    })
  })

  it('não gera quando hasPrerequisites é false e GET retorna null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })

    const { result } = renderHook(() => useAdwords('video-1', false))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('ineligible')
    expect(result.current.isGenerating).toBe(false)
    // Apenas GET, sem POST
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('lida com erro no GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('Falha ao carregar dados AdWords')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('lida com erro no POST generate', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
      })

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false)
      expect(result.current.error).toBeTruthy()
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('Rate limit exceeded')
  })

  it('cancela request via AbortController ao trocar videoId', async () => {
    // Primeiro render: fetch lento que não resolve antes do rerender
    let resolveFirst: (value: unknown) => void
    mockFetch.mockImplementationOnce(() =>
      new Promise(resolve => { resolveFirst = resolve })
    )

    const { result, rerender } = renderHook(
      ({ videoId }) => useAdwords(videoId, true),
      { initialProps: { videoId: 'video-1' as string | null } }
    )

    expect(result.current.isLoading).toBe(true)

    // Trocar videoId — deve abortar o primeiro request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockAdwordsData }),
    })

    rerender({ videoId: 'video-2' })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Verificar que GET foi chamado para video-2
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-2/adwords',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )

    // Resolver o primeiro fetch (deve ser ignorado)
    resolveFirst!({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })

    // Dados devem ser do video-2
    expect(result.current.data).toEqual(mockAdwordsData)
  })

  it('retry re-dispara POST generate', async () => {
    // GET retorna null, POST falha
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Timeout' } }),
      })

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.error).toBe('Timeout')
    })

    // Retry
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockAdwordsData }),
    })

    await act(async () => {
      result.current.retry()
    })

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false)
    })

    expect(result.current.data).toEqual(mockAdwordsData)
    expect(result.current.error).toBeNull()
  })

  it('reprocess envia POST com additionalContext', async () => {
    // GET retorna dados existentes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockAdwordsData }),
    })

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.data).toEqual(mockAdwordsData)
    })

    const newData = {
      guide: 'Guia reprocessado',
      keywords: ['nova-kw'],
      generatedAt: '2026-02-26T02:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: newData }),
    })

    await act(async () => {
      await result.current.reprocess('Foque mais no convidado')
    })

    expect(result.current.data).toEqual(newData)
    expect(result.current.error).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/adwords/generate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalContext: 'Foque mais no convidado' }),
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('reprocess seta isGenerating=true durante chamada', async () => {
    // GET retorna dados existentes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockAdwordsData }),
    })

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.data).toEqual(mockAdwordsData)
    })

    // Reprocess com Promise pendente para capturar estado intermediário
    let resolveReprocess: (value: unknown) => void
    mockFetch.mockImplementationOnce(() =>
      new Promise(resolve => { resolveReprocess = resolve })
    )

    // Inicia reprocess sem await
    act(() => {
      result.current.reprocess('contexto')
    })

    // Estado intermediário: isGenerating deve ser true
    expect(result.current.isGenerating).toBe(true)

    // Resolver para limpar
    await act(async () => {
      resolveReprocess!({
        ok: true,
        json: () => Promise.resolve({ data: mockAdwordsData }),
      })
    })

    expect(result.current.isGenerating).toBe(false)
  })

  it('reprocess re-throws erro para caller', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockAdwordsData }),
    })

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.data).toEqual(mockAdwordsData)
    })

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Erro de reprocessamento' } }),
    })

    await act(async () => {
      await expect(result.current.reprocess('contexto')).rejects.toThrow('Erro de reprocessamento')
    })

    // Dados originais mantidos após erro
    expect(result.current.data).toEqual(mockAdwordsData)
  })
})
