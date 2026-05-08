import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, renderHook, waitFor } from '@/test-utils'

import { useNewsletterReport } from './use-newsletter-report'
import type { NewsletterData } from '@/types/newsletter'

const mockFetch = vi.fn()
global.fetch = mockFetch

const existingNewsletterData: NewsletterData = {
  status: 'image_ready',
  draft: '# Newsletter\n\nConteúdo do draft...',
  news: [{ id: 'n1', title: 'Notícia 1' }],
  imagePrompt: 'prompt para imagem',
  imageUrl: 'newsletters/video-1/cover.png',
}

const completedNewsletterData: NewsletterData = {
  ...existingNewsletterData,
  status: 'completed',
  report: '# Relatório Final\n\nConteúdo formatado...',
}

describe('useNewsletterReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna estado inicial quando report não existe', () => {
    const { result } = renderHook(() =>
      useNewsletterReport('video-1', existingNewsletterData, 'Default prompt')
    )

    expect(result.current.report).toBeNull()
    expect(result.current.formatPrompt).toBe('Default prompt')
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('retorna report existente quando presente nos dados', () => {
    const { result } = renderHook(() =>
      useNewsletterReport('video-1', completedNewsletterData, 'Default prompt')
    )

    expect(result.current.report).toBe('# Relatório Final\n\nConteúdo formatado...')
    // formatPrompt sempre reflete o default atual das configurações, não o valor histórico
    expect(result.current.formatPrompt).toBe('Default prompt')
  })

  it('usa defaultFormatPrompt quando newsletterData não tem formatPrompt', () => {
    const { result } = renderHook(() =>
      useNewsletterReport('video-1', existingNewsletterData, 'Prompt padrão do podcast')
    )

    expect(result.current.formatPrompt).toBe('Prompt padrão do podcast')
  })

  it('gera report via generate()', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { report: 'Relatório gerado' } }),
    })

    const { result } = renderHook(() =>
      useNewsletterReport('video-1', existingNewsletterData, 'Default prompt')
    )

    let generateResult: boolean | undefined
    await act(async () => {
      generateResult = await result.current.generate('Formate a newsletter')
    })

    expect(generateResult).toBe(true)
    expect(result.current.report).toBe('Relatório gerado')
    expect(result.current.isGenerating).toBe(false)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter/format',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formatPrompt: 'Formate a newsletter' }),
      })
    )
  })

  it('retorna false quando generate falha', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Rate limit' } }),
    })

    const { result } = renderHook(() =>
      useNewsletterReport('video-1', existingNewsletterData, 'Default prompt')
    )

    let generateResult: boolean | undefined
    await act(async () => {
      generateResult = await result.current.generate('test')
    })

    expect(generateResult).toBe(false)
    expect(result.current.error).toBe('Rate limit')
    expect(result.current.isGenerating).toBe(false)
  })

  it('salva report via PATCH', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { updatedAt: '2026-02-28' } }),
    })

    const { result } = renderHook(() =>
      useNewsletterReport('video-1', completedNewsletterData, 'Default prompt')
    )

    await act(async () => {
      await result.current.saveReport('Report editado')
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/newsletter',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: 'Report editado' }),
      })
    )
  })

  it('lida com erro no saveReport', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    const { result } = renderHook(() =>
      useNewsletterReport('video-1', completedNewsletterData, 'Default prompt')
    )

    await expect(
      act(async () => {
        await result.current.saveReport('Report editado')
      })
    ).rejects.toThrow('Server error')
  })

  it('retry re-dispara generate com último formatPrompt', async () => {
    // First generate fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Timeout' } }),
    })

    const { result } = renderHook(() =>
      useNewsletterReport('video-1', existingNewsletterData, 'Default prompt')
    )

    await act(async () => {
      await result.current.generate('Meu prompt editado')
    })

    expect(result.current.error).toBe('Timeout')

    // Retry
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { report: 'Retry report' } }),
    })

    await act(async () => {
      result.current.retry()
    })

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false)
    })

    expect(result.current.report).toBe('Retry report')
    expect(result.current.error).toBeNull()
    // Second call should use the same formatPrompt
    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/videos/video-1/newsletter/format',
      expect.objectContaining({
        body: JSON.stringify({ formatPrompt: 'Meu prompt editado' }),
      })
    )
  })

  it('retorna false quando videoId é null', async () => {
    const { result } = renderHook(() =>
      useNewsletterReport(null, existingNewsletterData, 'Default prompt')
    )

    let generateResult: boolean | undefined
    await act(async () => {
      generateResult = await result.current.generate('test')
    })

    expect(generateResult).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('atualiza formatPrompt via setFormatPrompt', () => {
    const { result } = renderHook(() =>
      useNewsletterReport('video-1', existingNewsletterData, 'Default prompt')
    )

    act(() => {
      result.current.setFormatPrompt('Novo prompt editado')
    })

    expect(result.current.formatPrompt).toBe('Novo prompt editado')
  })
})
