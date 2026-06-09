import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, renderHook, waitFor } from '@/test-utils'

import type { AdwordsData } from '@/types/adwords'

import { useAdwords } from './use-adwords'

// Epic 27: generate/reprocess agora usam runAsyncJob (job + polling). O GET de
// listagem continua em fetch. Mockamos runAsyncJob — ele retorna o payload
// diretamente (o mesmo `data` que o caminho síncrono devolvia).
vi.mock('@/lib/jobs/run-async-job', () => ({ runAsyncJob: vi.fn() }))

import { runAsyncJob } from '@/lib/jobs/run-async-job'

const mockFetch = vi.fn()
global.fetch = mockFetch
const mockRunAsyncJob = vi.mocked(runAsyncJob)

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
    // Apenas GET de listagem; nenhum job disparado
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockRunAsyncJob).not.toHaveBeenCalled()
  })

  it('auto-gera via job quando GET retorna null e hasPrerequisites é true', async () => {
    const generatedData = {
      guide: 'Guia gerado',
      keywords: ['kw1'],
      generatedAt: '2026-02-26T01:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })
    mockRunAsyncJob.mockResolvedValueOnce(generatedData)

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.data).toEqual(generatedData)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()

    expect(mockRunAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/videos/video-1/adwords/generate' })
    )
  })

  it('isGenerating fica true durante auto-geração', async () => {
    let resolveGenerate: (value: AdwordsData) => void
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })
    mockRunAsyncJob.mockImplementationOnce(
      () => new Promise(resolve => { resolveGenerate = resolve })
    )

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(true)
    })

    expect(result.current.isLoading).toBe(false)

    await act(async () => {
      resolveGenerate!(mockAdwordsData)
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
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockRunAsyncJob).not.toHaveBeenCalled()
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

  it('lida com erro no job de geração', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })
    mockRunAsyncJob.mockRejectedValueOnce(new Error('Rate limit exceeded'))

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false)
      expect(result.current.error).toBeTruthy()
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('Rate limit exceeded')
  })

  it('cancela request via AbortController ao trocar videoId', async () => {
    let resolveFirst: (value: unknown) => void
    mockFetch.mockImplementationOnce(() =>
      new Promise(resolve => { resolveFirst = resolve })
    )

    const { result, rerender } = renderHook(
      ({ videoId }) => useAdwords(videoId, true),
      { initialProps: { videoId: 'video-1' as string | null } }
    )

    expect(result.current.isLoading).toBe(true)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockAdwordsData }),
    })

    rerender({ videoId: 'video-2' })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-2/adwords',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )

    resolveFirst!({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })

    expect(result.current.data).toEqual(mockAdwordsData)
  })

  it('retry re-dispara o job de geração', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })
    mockRunAsyncJob.mockRejectedValueOnce(new Error('Timeout'))

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.error).toBe('Timeout')
    })

    mockRunAsyncJob.mockResolvedValueOnce(mockAdwordsData)

    await act(async () => {
      result.current.retry()
    })

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false)
    })

    expect(result.current.data).toEqual(mockAdwordsData)
    expect(result.current.error).toBeNull()
  })

  it('reprocess dispara job com additionalContext', async () => {
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
    mockRunAsyncJob.mockResolvedValueOnce(newData)

    await act(async () => {
      await result.current.reprocess('Foque mais no convidado')
    })

    expect(result.current.data).toEqual(newData)
    expect(result.current.error).toBeNull()
    expect(mockRunAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/videos/video-1/adwords/generate',
        body: { additionalContext: 'Foque mais no convidado' },
      })
    )
  })

  it('reprocess seta isGenerating=true durante chamada', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockAdwordsData }),
    })

    const { result } = renderHook(() => useAdwords('video-1', true))

    await waitFor(() => {
      expect(result.current.data).toEqual(mockAdwordsData)
    })

    let resolveReprocess: (value: AdwordsData) => void
    mockRunAsyncJob.mockImplementationOnce(
      () => new Promise(resolve => { resolveReprocess = resolve })
    )

    act(() => {
      result.current.reprocess('contexto')
    })

    expect(result.current.isGenerating).toBe(true)

    await act(async () => {
      resolveReprocess!(mockAdwordsData)
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

    mockRunAsyncJob.mockRejectedValueOnce(new Error('Erro de reprocessamento'))

    await act(async () => {
      await expect(result.current.reprocess('contexto')).rejects.toThrow('Erro de reprocessamento')
    })

    expect(result.current.data).toEqual(mockAdwordsData)
  })
})
