import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test-utils'

import { NewsPanel } from './news-panel'

function createTimestamp(date: Date) {
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  }
}

const mockNewsItems = [
  {
    id: 'news-1',
    titulo: 'Notícia Alpha',
    descricao: 'Descrição da notícia alpha',
    resumo: 'Resumo completo alpha',
    comentarios: 'Comentários alpha',
    data: '2026-02-09',
    fonte: { nome: 'Fonte A', url: 'https://example.com/a' },
    importedAt: createTimestamp(new Date('2026-02-09T18:55:00Z')),
  },
  {
    id: 'news-2',
    titulo: 'Notícia Beta',
    descricao: 'Descrição da notícia beta',
    resumo: 'Resumo completo beta',
    comentarios: 'Comentários beta',
    data: '2026-02-08',
    fonte: { nome: 'Fonte B', url: 'https://example.com/b' },
    importedAt: createTimestamp(new Date('2026-02-08T10:00:00Z')),
  },
]

function mockFetchSuccess(items = mockNewsItems, nextCursor: string | null = null, totalCount = 2) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      data: { items, nextCursor, totalCount },
    }),
  } as never)
}

describe('NewsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders header', async () => {
    mockFetchSuccess()
    render(<NewsPanel />)

    expect(screen.getByText('Notícias')).toBeInTheDocument()
  })

  it('shows loading skeletons initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))

    render(<NewsPanel />)

    const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders news cards after loading', async () => {
    mockFetchSuccess()

    render(<NewsPanel />)

    await waitFor(() => {
      expect(screen.getByText('Notícia Alpha')).toBeInTheDocument()
      expect(screen.getByText('Notícia Beta')).toBeInTheDocument()
    })
  })

  it('fetches with limit=8 by default', async () => {
    mockFetchSuccess()

    render(<NewsPanel />)

    await waitFor(() => {
      expect(screen.getByText('Notícia Alpha')).toBeInTheDocument()
    })

    const firstCall = vi.mocked(fetch).mock.calls[0]
    expect(firstCall?.[0]).toContain('limit=8')
  })

  it('shows empty state message when no news', async () => {
    mockFetchSuccess([], null)

    render(<NewsPanel />)

    await waitFor(() => {
      expect(screen.getByText(/nenhuma notícia encontrada/i)).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: { message: 'Erro ao carregar notícias' },
      }),
    } as never)

    render(<NewsPanel />)

    await waitFor(() => {
      expect(screen.getByText('Erro ao carregar notícias')).toBeInTheDocument()
    })
  })

  it('shows detail placeholder before selection', async () => {
    mockFetchSuccess()

    render(<NewsPanel />)

    await waitFor(() => {
      expect(screen.getByText(/selecione uma notícia/i)).toBeInTheDocument()
    })
  })

  it('shows news detail when card is clicked', async () => {
    mockFetchSuccess()

    render(<NewsPanel />)

    await waitFor(() => {
      expect(screen.getByText('Notícia Alpha')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Notícia Alpha'))

    // descricao appears in both card (truncated) and detail (full), so use getAllByText
    const descricaoElements = screen.getAllByText('Descrição da notícia alpha')
    expect(descricaoElements.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Resumo completo alpha')).toBeInTheDocument()
    expect(screen.getByText('Comentários alpha')).toBeInTheDocument()
  })

  describe('Pagination', () => {
    it('does not show pagination when there is only one page', async () => {
      mockFetchSuccess(mockNewsItems, null)

      render(<NewsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Notícia Alpha')).toBeInTheDocument()
      })

      expect(screen.queryByText('Próxima')).not.toBeInTheDocument()
    })

    it('shows pagination buttons and page indicator when there are more pages', async () => {
      mockFetchSuccess(mockNewsItems, '2026-02-07T00:00:00.000Z', 20)

      render(<NewsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Notícia Alpha')).toBeInTheDocument()
      })

      expect(screen.getByText('Próxima')).toBeInTheDocument()
      expect(screen.getByText('Anterior')).toBeInTheDocument()
      // 20 total / 8 per page = 3 pages, current page 1
      expect(screen.getByText('1 / 3')).toBeInTheDocument()
    })

    it('disables Anterior on first page', async () => {
      mockFetchSuccess(mockNewsItems, '2026-02-07T00:00:00.000Z', 20)

      render(<NewsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Notícia Alpha')).toBeInTheDocument()
      })

      expect(screen.getByText('Anterior').closest('button')).toBeDisabled()
      expect(screen.getByText('Próxima').closest('button')).toBeEnabled()
    })

    it('fetches next page and updates page indicator when Próxima is clicked', async () => {
      mockFetchSuccess(mockNewsItems, '2026-02-07T00:00:00.000Z', 20)

      render(<NewsPanel />)

      await waitFor(() => {
        expect(screen.getByText('Notícia Alpha')).toBeInTheDocument()
      })

      expect(screen.getByText('1 / 3')).toBeInTheDocument()

      // Setup next page response
      mockFetchSuccess([{
        ...mockNewsItems[0],
        id: 'news-3',
        titulo: 'Notícia Gamma',
      }], null, 20)

      fireEvent.click(screen.getByText('Próxima'))

      await waitFor(() => {
        expect(screen.getByText('Notícia Gamma')).toBeInTheDocument()
      })

      // Page indicator should update to 2/3
      expect(screen.getByText('2 / 3')).toBeInTheDocument()

      // Verify cursor was passed
      const lastCall = vi.mocked(fetch).mock.calls.at(-1)
      expect(lastCall?.[0]).toContain('cursor=2026-02-07')
    })
  })
})
