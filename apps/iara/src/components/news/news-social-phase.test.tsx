import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

const mockGenerateImage = vi.fn()
vi.mock('@/hooks/use-news-image', () => ({
  useNewsImage: (newsId: string, initialImageUrl?: string) => ({
    imageUrl: initialImageUrl ? `/api/news/${newsId}/image?t=123` : null,
    isGenerating: false,
    generatingStep: null,
    error: null,
    generateImage: mockGenerateImage,
  }),
}))

import { NewsSocialPhase } from './news-social-phase'

const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

const baseNews = {
  id: 'news-1',
  titulo: 'Test News',
  descricao: '',
  resumo: '',
  comentarios: '',
  data: '2026-03-01',
  fonte: { nome: '', url: '' },
  importedAt: mockTimestamp as never,
  selected_video: 'ep-1',
  related_videos: ['ep-1'],
}

describe('NewsSocialPhase', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    mockGenerateImage.mockResolvedValue(true)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockGenerateSuccess(social = 'Texto social gerado pela IA') {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { social } }),
    } as never)
  }

  it('auto-generates social when social is null', async () => {
    const news = { ...baseNews, social: null }
    mockGenerateSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    // Shows generating state first
    expect(screen.getByTestId('news-social-generating')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('news-social-phase')).toBeInTheDocument()
    })

    expect(screen.getByTestId('social-editor')).toHaveValue('Texto social gerado pela IA')
  })

  it('auto-generates social when social is undefined', async () => {
    const news = { ...baseNews, social: undefined }
    mockGenerateSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-social-phase')).toBeInTheDocument()
    })

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/news/news-1/generate-social',
      { method: 'POST' }
    )
  })

  it('loads existing social text without calling LLM', async () => {
    const news = { ...baseNews, social: 'Texto existente' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    expect(screen.getByTestId('news-social-phase')).toBeInTheDocument()
    expect(screen.getByTestId('social-editor')).toHaveValue('Texto existente')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('shows error state when generation fails', async () => {
    const news = { ...baseNews, social: null }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: { message: 'Erro ao gerar' } }),
    } as never)
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-social-error')).toBeInTheDocument()
    })

    expect(screen.getByText('Erro ao gerar')).toBeInTheDocument()
  })

  it('retries generation when retry button is clicked', async () => {
    const news = { ...baseNews, social: null }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    } as never)
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-social-error')).toBeInTheDocument()
    })

    mockGenerateSuccess()

    await user.click(screen.getByText('Tentar novamente'))

    await waitFor(() => {
      expect(screen.getByTestId('news-social-phase')).toBeInTheDocument()
    })
  })

  it('allows editing the text', async () => {
    const news = { ...baseNews, social: 'Original' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    const editor = screen.getByTestId('social-editor')
    await user.clear(editor)
    await user.type(editor, 'Novo texto')

    expect(editor).toHaveValue('Novo texto')
  })

  it('regenerates when regenerate button is clicked and confirmed', async () => {
    const news = { ...baseNews, social: 'Texto antigo' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await user.click(screen.getByTestId('regenerate-social-button'))

    mockGenerateSuccess('Texto regenerado')

    await user.click(screen.getByTestId('confirm-regenerate-button'))

    await waitFor(() => {
      expect(screen.getByTestId('social-editor')).toHaveValue('Texto regenerado')
    })
  })

  it('copies text to clipboard and shows feedback', async () => {
    const news = { ...baseNews, social: 'Texto para copiar' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await user.click(screen.getByTestId('copy-social-button'))

    // Feedback visual confirma a cópia
    await waitFor(() => {
      expect(screen.getByText('Copiado!')).toBeInTheDocument()
    })
  })

  it('shows regenerate and copy buttons', () => {
    const news = { ...baseNews, social: 'Texto' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    expect(screen.getByTestId('regenerate-social-button')).toBeInTheDocument()
    expect(screen.getByTestId('copy-social-button')).toBeInTheDocument()
  })

  it('shows inline error when regeneration fails with existing text', async () => {
    const news = { ...baseNews, social: 'Texto existente' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: { message: 'Erro na regeneração' } }),
    } as never)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    // Click regenerate to show context input, then confirm
    await user.click(screen.getByTestId('regenerate-social-button'))
    await user.click(screen.getByTestId('confirm-regenerate-button'))

    await waitFor(() => {
      expect(screen.getByTestId('social-inline-error')).toBeInTheDocument()
    })

    expect(screen.getByText('Erro na regeneração')).toBeInTheDocument()
    // Editor still shows existing text
    expect(screen.getByTestId('social-editor')).toHaveValue('Texto existente')
  })

  it('calls onDataUpdate after generation', async () => {
    const news = { ...baseNews, social: null }
    mockGenerateSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await waitFor(() => {
      expect(onDataUpdate).toHaveBeenCalledOnce()
    })
  })

  it('shows additionalContext textarea when regenerate is clicked', async () => {
    const news = { ...baseNews, social: 'Texto existente' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await user.click(screen.getByTestId('regenerate-social-button'))

    expect(screen.getByTestId('additional-context-input')).toBeInTheDocument()
    expect(screen.getByText('Regenerar')).toBeInTheDocument()
    expect(screen.getByText('Cancelar')).toBeInTheDocument()
  })

  it('hides additionalContext textarea when cancel is clicked', async () => {
    const news = { ...baseNews, social: 'Texto existente' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await user.click(screen.getByTestId('regenerate-social-button'))
    expect(screen.getByTestId('additional-context-input')).toBeInTheDocument()

    await user.click(screen.getByText('Cancelar'))
    expect(screen.queryByTestId('additional-context-input')).not.toBeInTheDocument()
  })

  it('sends additionalContext in POST body when confirming regeneration with text', async () => {
    const news = { ...baseNews, social: 'Texto existente' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await user.click(screen.getByTestId('regenerate-social-button'))

    const contextInput = screen.getByTestId('additional-context-input')
    await user.type(contextInput, 'Foque no impacto econômico')

    mockGenerateSuccess('Texto regenerado com contexto')

    await user.click(screen.getByTestId('confirm-regenerate-button'))

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/news/news-1/generate-social',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ additionalContext: 'Foque no impacto econômico' }),
        })
      )
    })
  })

  it('sends POST without body when confirming regeneration with empty context', async () => {
    const news = { ...baseNews, social: 'Texto existente' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await user.click(screen.getByTestId('regenerate-social-button'))

    mockGenerateSuccess('Texto regenerado')

    await user.click(screen.getByTestId('confirm-regenerate-button'))

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/news/news-1/generate-social',
        { method: 'POST' }
      )
    })
  })

  it('clears additionalContext textarea after regeneration', async () => {
    const news = { ...baseNews, social: 'Texto existente' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await user.click(screen.getByTestId('regenerate-social-button'))

    const contextInput = screen.getByTestId('additional-context-input')
    await user.type(contextInput, 'Contexto adicional')

    mockGenerateSuccess('Texto regenerado')

    await user.click(screen.getByTestId('confirm-regenerate-button'))

    await waitFor(() => {
      expect(screen.getByTestId('social-editor')).toHaveValue('Texto regenerado')
    })

    // After regeneration, the context input should be hidden
    expect(screen.queryByTestId('additional-context-input')).not.toBeInTheDocument()
  })

  // ==========================================================================
  // Story 18.10 — Image section tests
  // ==========================================================================

  it('shows "Imagem Ilustrativa" section in phase 3', () => {
    const news = { ...baseNews, social: 'Texto existente' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    expect(screen.getByTestId('news-image-section')).toBeInTheDocument()
    expect(screen.getByText('Imagem Ilustrativa')).toBeInTheDocument()
  })

  it('shows "Gerar Imagem" button when no image exists', () => {
    const news = { ...baseNews, social: 'Texto' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    expect(screen.getByTestId('generate-image-button')).toHaveTextContent('Gerar Imagem')
  })

  it('shows "Regenerar Imagem" button when image exists', () => {
    const news = { ...baseNews, social: 'Texto', imageUrl: 'news-images/pptnc/news-1/123.png' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    expect(screen.getByTestId('generate-image-button')).toHaveTextContent('Regenerar Imagem')
  })

  it('shows image preview when imageUrl exists', () => {
    const news = { ...baseNews, social: 'Texto', imageUrl: 'news-images/pptnc/news-1/123.png' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    expect(screen.getByTestId('news-image-preview')).toBeInTheDocument()
  })

  it('shows image additional context textarea', () => {
    const news = { ...baseNews, social: 'Texto' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    expect(screen.getByTestId('image-additional-context')).toBeInTheDocument()
  })

  it('calls generateImage when button is clicked', async () => {
    const news = { ...baseNews, social: 'Texto' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await user.click(screen.getByTestId('generate-image-button'))

    expect(mockGenerateImage).toHaveBeenCalledWith(undefined)
  })

  it('sends additionalContext when generating image with instructions', async () => {
    const news = { ...baseNews, social: 'Texto' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    const contextInput = screen.getByTestId('image-additional-context')
    await user.type(contextInput, 'Use tons de azul')

    await user.click(screen.getByTestId('generate-image-button'))

    expect(mockGenerateImage).toHaveBeenCalledWith('Use tons de azul')
  })

  it('calls onDataUpdate after successful image generation', async () => {
    const news = { ...baseNews, social: 'Texto' }
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsSocialPhase news={news} onDataUpdate={onDataUpdate} />)

    await user.click(screen.getByTestId('generate-image-button'))

    await waitFor(() => {
      expect(onDataUpdate).toHaveBeenCalled()
    })
  })
})
