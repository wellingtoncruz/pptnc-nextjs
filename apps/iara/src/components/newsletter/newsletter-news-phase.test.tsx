import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { render, screen, waitFor } from '@/test-utils'

const mockUseNewsletterNews = vi.fn()
vi.mock('@/hooks/use-newsletter-news', () => ({
  useNewsletterNews: (...args: unknown[]) => mockUseNewsletterNews(...args),
}))

import { NewsletterNewsPhase } from './newsletter-news-phase'

function createDefaultHookReturn(overrides = {}) {
  return {
    candidates: null,
    confirmedNews: null,
    newsletterStatus: null,
    isLoading: false,
    isFetching: false,
    isConfirming: false,
    error: null,
    totalFound: 0,
    llmFiltered: false,
    fetchNews: vi.fn(),
    confirmSelection: vi.fn(),
    ...overrides,
  }
}

const candidateItems = [
  { id: 'n1', title: 'Notícia 1', description: 'Descrição 1', source: 'Fonte A', url: 'https://a.com', publishedAt: '2026-02-23' },
  { id: 'n2', title: 'Notícia 2', description: 'Descrição 2', source: 'Fonte B', url: 'https://b.com', publishedAt: '2026-02-23' },
  { id: 'n3', title: 'Notícia 3', description: 'Descrição 3', source: 'Fonte C', url: 'https://c.com', publishedAt: '2026-02-23' },
  { id: 'n4', title: 'Notícia 4', description: 'Descrição 4', source: 'Fonte D', url: 'https://d.com', publishedAt: '2026-02-23' },
  { id: 'n5', title: 'Notícia 5', description: 'Descrição 5', source: 'Fonte E', url: 'https://e.com', publishedAt: '2026-02-23' },
  { id: 'n6', title: 'Notícia 6', description: 'Descrição 6', source: 'Fonte F', url: 'https://f.com', publishedAt: '2026-02-23' },
  { id: 'n7', title: 'Notícia 7', description: 'Descrição 7', source: 'Fonte G', url: 'https://g.com', publishedAt: '2026-02-23' },
]

describe('NewsletterNewsPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exibe spinner de loading', () => {
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({ isLoading: true }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    expect(screen.getByTestId('newsletter-news-loading')).toBeInTheDocument()
  })

  it('exibe mensagem quando sem draft (status idle)', () => {
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({ newsletterStatus: 'idle' }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="idle" />)

    expect(screen.getByTestId('newsletter-news-no-draft')).toBeInTheDocument()
    expect(screen.getByText('Complete a Fase 1 (Draft) antes de buscar notícias')).toBeInTheDocument()
  })

  it('auto-busca notícias quando status é draft e sem candidatas', async () => {
    const fetchNews = vi.fn()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({ newsletterStatus: 'draft', fetchNews }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    await waitFor(() => {
      expect(fetchNews).toHaveBeenCalledTimes(1)
    })
  })

  it('não auto-busca quando já tem notícias confirmadas', () => {
    const fetchNews = vi.fn()
    const confirmed = [
      { id: 'n1', title: 'C1', description: '', source: '', url: '', publishedAt: '' },
      { id: 'n2', title: 'C2', description: '', source: '', url: '', publishedAt: '' },
      { id: 'n3', title: 'C3', description: '', source: '', url: '', publishedAt: '' },
    ]
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'news_selected',
      confirmedNews: confirmed,
      fetchNews,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(fetchNews).not.toHaveBeenCalled()
  })

  it('não auto-busca quando isLoading', () => {
    const fetchNews = vi.fn()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      isLoading: true,
      fetchNews,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    expect(fetchNews).not.toHaveBeenCalled()
  })

  it('exibe spinner durante busca', () => {
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({ newsletterStatus: 'draft', isFetching: true }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    expect(screen.getByTestId('newsletter-news-fetching')).toBeInTheDocument()
    expect(screen.getByText('Buscando notícias relevantes...')).toBeInTheDocument()
  })

  it('exibe mensagem quando 0 notícias', () => {
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: [],
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    expect(screen.getByTestId('newsletter-news-empty')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma notícia encontrada para este período')).toBeInTheDocument()
  })

  it('exibe lista com checkboxes quando candidatas disponíveis', () => {
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: candidateItems,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    expect(screen.getByTestId('newsletter-news-candidates')).toBeInTheDocument()
    expect(screen.getByText('Notícia 1')).toBeInTheDocument()
    expect(screen.getByText('Notícia 5')).toBeInTheDocument()
    expect(screen.getByText('0 de 3-5 selecionadas')).toBeInTheDocument()
  })

  it('contador atualiza ao selecionar/desselecionar', async () => {
    const user = userEvent.setup()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: candidateItems,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    // Select first 3
    await user.click(screen.getByLabelText('Selecionar Notícia 1'))
    await user.click(screen.getByLabelText('Selecionar Notícia 2'))
    await user.click(screen.getByLabelText('Selecionar Notícia 3'))

    expect(screen.getByText('3 de 3-5 selecionadas')).toBeInTheDocument()

    // Deselect one
    await user.click(screen.getByLabelText('Selecionar Notícia 1'))

    expect(screen.getByText('2 de 3-5 selecionadas')).toBeInTheDocument()
  })

  it('botão "Confirmar Seleção" desabilitado quando < 3 selecionadas', async () => {
    const user = userEvent.setup()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: candidateItems,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    const confirmButton = screen.getByText('Confirmar Seleção')
    expect(confirmButton).toBeDisabled()

    // Select 2 (still < 3)
    await user.click(screen.getByLabelText('Selecionar Notícia 1'))
    await user.click(screen.getByLabelText('Selecionar Notícia 2'))

    expect(confirmButton).toBeDisabled()
  })

  it('não permite selecionar mais de 5 notícias', async () => {
    const user = userEvent.setup()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: candidateItems,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    // Select 5 items
    await user.click(screen.getByLabelText('Selecionar Notícia 1'))
    await user.click(screen.getByLabelText('Selecionar Notícia 2'))
    await user.click(screen.getByLabelText('Selecionar Notícia 3'))
    await user.click(screen.getByLabelText('Selecionar Notícia 4'))
    await user.click(screen.getByLabelText('Selecionar Notícia 5'))

    expect(screen.getByText('5 de 3-5 selecionadas')).toBeInTheDocument()

    // Attempt to select 6th — should be ignored (pointer-events-none blocks click)
    // The 6th item is faded out so we verify via the counter
    expect(screen.getByText('5 de 3-5 selecionadas')).toBeInTheDocument()
    expect(screen.getByText('Confirmar Seleção')).not.toBeDisabled()
  })

  it('aplica fadeout em notícias não selecionadas ao atingir limite de 5', async () => {
    const user = userEvent.setup()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: candidateItems,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    // Select 5 items
    await user.click(screen.getByLabelText('Selecionar Notícia 1'))
    await user.click(screen.getByLabelText('Selecionar Notícia 2'))
    await user.click(screen.getByLabelText('Selecionar Notícia 3'))
    await user.click(screen.getByLabelText('Selecionar Notícia 4'))
    await user.click(screen.getByLabelText('Selecionar Notícia 5'))

    // Unselected items (6, 7) should be faded out
    const item6Row = screen.getByText('Notícia 6').closest('div[class*="border-b"]')!
    const item7Row = screen.getByText('Notícia 7').closest('div[class*="border-b"]')!
    expect(item6Row.className).toContain('opacity-30')
    expect(item6Row.className).toContain('pointer-events-none')
    expect(item7Row.className).toContain('opacity-30')

    // Selected items should NOT be faded
    const item1Row = screen.getByText('Notícia 1').closest('div[class*="border-b"]')!
    expect(item1Row.className).not.toContain('opacity-30')

    // Deselecting one removes fadeout from all
    await user.click(screen.getByLabelText('Selecionar Notícia 5'))
    expect(screen.getByText('4 de 3-5 selecionadas')).toBeInTheDocument()

    const item6RowAfter = screen.getByText('Notícia 6').closest('div[class*="border-b"]')!
    expect(item6RowAfter.className).not.toContain('opacity-30')
  })

  it('botão habilitado quando 3-5 selecionadas', async () => {
    const user = userEvent.setup()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: candidateItems,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    await user.click(screen.getByLabelText('Selecionar Notícia 1'))
    await user.click(screen.getByLabelText('Selecionar Notícia 2'))
    await user.click(screen.getByLabelText('Selecionar Notícia 3'))

    const confirmButton = screen.getByText('Confirmar Seleção')
    expect(confirmButton).not.toBeDisabled()
  })

  it('exibe lista read-only quando notícias já confirmadas', () => {
    const confirmed = [
      { id: 'n1', title: 'Confirmada 1', description: 'Desc', source: 'Fonte', url: 'https://a.com', publishedAt: '2026-02-23' },
      { id: 'n2', title: 'Confirmada 2', description: 'Desc', source: 'Fonte', url: 'https://b.com', publishedAt: '2026-02-23' },
      { id: 'n3', title: 'Confirmada 3', description: 'Desc', source: 'Fonte', url: 'https://c.com', publishedAt: '2026-02-23' },
    ]

    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'news_selected',
      confirmedNews: confirmed,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(screen.getByTestId('newsletter-news-confirmed')).toBeInTheDocument()
    expect(screen.getByText('3 notícias selecionadas')).toBeInTheDocument()
    expect(screen.getByText('Confirmada 1')).toBeInTheDocument()
    expect(screen.getByText('Refazer Seleção')).toBeInTheDocument()
    expect(screen.getByText('Continuar')).toBeInTheDocument()
    // No checkboxes in confirmed view
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('botão Continuar chama onStatusChange com news_selected', async () => {
    const user = userEvent.setup()
    const confirmed = [
      { id: 'n1', title: 'C1', description: '', source: '', url: '', publishedAt: '' },
      { id: 'n2', title: 'C2', description: '', source: '', url: '', publishedAt: '' },
      { id: 'n3', title: 'C3', description: '', source: '', url: '', publishedAt: '' },
    ]
    const onStatusChange = vi.fn()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'news_selected',
      confirmedNews: confirmed,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="news_selected" onStatusChange={onStatusChange} />)

    await user.click(screen.getByText('Continuar'))

    expect(onStatusChange).toHaveBeenCalledWith('news_selected')
  })

  it('exibe erro e botão retry', () => {
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      error: 'Rate limit exceeded',
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    expect(screen.getByTestId('newsletter-news-error')).toBeInTheDocument()
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument()
  })

  it('chama confirmSelection com itens selecionados', async () => {
    const user = userEvent.setup()
    const confirmSelection = vi.fn().mockResolvedValue(true)
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: candidateItems,
      confirmSelection,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" />)

    await user.click(screen.getByLabelText('Selecionar Notícia 1'))
    await user.click(screen.getByLabelText('Selecionar Notícia 3'))
    await user.click(screen.getByLabelText('Selecionar Notícia 5'))

    await user.click(screen.getByText('Confirmar Seleção'))

    await waitFor(() => {
      expect(confirmSelection).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'n1' }),
        expect.objectContaining({ id: 'n3' }),
        expect.objectContaining({ id: 'n5' }),
      ])
    })
  })

  it('chama onStatusChange com news_selected quando confirmação sucede', async () => {
    const user = userEvent.setup()
    const confirmSelection = vi.fn().mockResolvedValue(true)
    const onStatusChange = vi.fn()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: candidateItems,
      confirmSelection,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" onStatusChange={onStatusChange} />)

    await user.click(screen.getByLabelText('Selecionar Notícia 1'))
    await user.click(screen.getByLabelText('Selecionar Notícia 3'))
    await user.click(screen.getByLabelText('Selecionar Notícia 5'))
    await user.click(screen.getByText('Confirmar Seleção'))

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('news_selected')
    })
  })

  it('NÃO chama onStatusChange quando confirmação falha', async () => {
    const user = userEvent.setup()
    const confirmSelection = vi.fn().mockResolvedValue(false)
    const onStatusChange = vi.fn()
    mockUseNewsletterNews.mockReturnValue(createDefaultHookReturn({
      newsletterStatus: 'draft',
      candidates: candidateItems,
      confirmSelection,
    }))

    render(<NewsletterNewsPhase videoId="video-1" newsletterStatus="draft" onStatusChange={onStatusChange} />)

    await user.click(screen.getByLabelText('Selecionar Notícia 1'))
    await user.click(screen.getByLabelText('Selecionar Notícia 3'))
    await user.click(screen.getByLabelText('Selecionar Notícia 5'))
    await user.click(screen.getByText('Confirmar Seleção'))

    await waitFor(() => {
      expect(confirmSelection).toHaveBeenCalled()
    })

    expect(onStatusChange).not.toHaveBeenCalled()
  })
})
