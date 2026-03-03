import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NewsEpisodesPhase } from './news-episodes-phase'

vi.mock('@/components/ui/video-thumbnail', () => ({
  VideoThumbnail: ({ alt }: { alt: string }) => <div data-testid="video-thumbnail">{alt}</div>,
}))

const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

const mockNews = {
  id: 'news-1',
  titulo: 'Test News',
  descricao: '',
  resumo: '',
  comentarios: '',
  data: '2026-03-01',
  fonte: { nome: '', url: '' },
  importedAt: mockTimestamp as never,
}

const mockEpisodes = [
  {
    id: 'ep-1',
    title: 'Episódio sobre IA',
    description: 'Análise sobre inteligência artificial',
    duration: 3600,
    status: 'ready',
    videoType: 'episode',
    guests: [{ name: 'João', role: 'CEO', linkedin: 'https://linkedin.com/in/joao' }],
  },
  {
    id: 'ep-2',
    title: 'Episódio sobre Cloud',
    description: 'Como a nuvem mudou o mercado',
    duration: 2400,
    status: 'ready',
    videoType: 'episode',
  },
]

describe('NewsEpisodesPhase', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockFindEpisodesSuccess(episodes = mockEpisodes) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { episodes } }),
    } as never)
  }

  it('shows loading state and auto-fetches on mount', async () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}))
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    expect(screen.getByTestId('news-episodes-loading')).toBeInTheDocument()
    expect(screen.getByText('Buscando episódios relacionados...')).toBeInTheDocument()
  })

  it('renders episode cards after successful fetch', async () => {
    mockFindEpisodesSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-phase')).toBeInTheDocument()
    })

    expect(screen.getByTestId('episode-card-ep-1')).toBeInTheDocument()
    expect(screen.getByTestId('episode-card-ep-2')).toBeInTheDocument()
  })

  it('calls POST find-episodes on mount', async () => {
    mockFindEpisodesSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-phase')).toBeInTheDocument()
    })

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/news/news-1/find-episodes',
      { method: 'POST' }
    )
  })

  it('calls onDataUpdate after fetching episodes', async () => {
    mockFindEpisodesSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(onDataUpdate).toHaveBeenCalledOnce()
    })
  })

  it('shows error state on fetch failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    } as never)
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-error')).toBeInTheDocument()
    })
  })

  it('shows empty state when no episodes found', async () => {
    mockFindEpisodesSuccess([])
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-empty')).toBeInTheDocument()
    })
  })

  it('disables advance button when no episode is selected', async () => {
    mockFindEpisodesSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-phase')).toBeInTheDocument()
    })

    expect(screen.getByTestId('advance-to-social-button')).toBeDisabled()
  })

  it('selects episode on click and enables advance button', async () => {
    mockFindEpisodesSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    // Mock PATCH call for selection persistence
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: { updatedAt: new Date().toISOString() } }),
    } as never)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-phase')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('episode-card-ep-1'))

    expect(screen.getByTestId('advance-to-social-button')).not.toBeDisabled()
  })

  it('persists selection via PATCH when card is clicked', async () => {
    mockFindEpisodesSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    // Mock PATCH call
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: {} }),
    } as never)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-phase')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('episode-card-ep-1'))

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(
        call => call[1] && (call[1] as RequestInit).method === 'PATCH'
      )
      expect(patchCall).toBeDefined()
      expect(patchCall?.[0]).toBe('/api/news/news-1')
      expect(JSON.parse((patchCall?.[1] as RequestInit).body as string)).toEqual({ selected_video: 'ep-1' })
    })
  })

  it('calls onAdvance when advance button is clicked', async () => {
    mockFindEpisodesSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const onAdvance = vi.fn()
    const user = userEvent.setup()

    // Mock PATCH call for selection
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: {} }),
    } as never)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={onAdvance} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-phase')).toBeInTheDocument()
    })

    // Select an episode first
    await user.click(screen.getByTestId('episode-card-ep-1'))

    await waitFor(() => {
      expect(screen.getByTestId('advance-to-social-button')).not.toBeDisabled()
    })

    await user.click(screen.getByTestId('advance-to-social-button'))

    expect(onAdvance).toHaveBeenCalledOnce()
  })

  it('pre-selects episode when news has selected_video', async () => {
    const newsWithSelection = { ...mockNews, selected_video: 'ep-2' }
    mockFindEpisodesSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)

    render(<NewsEpisodesPhase news={newsWithSelection} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-phase')).toBeInTheDocument()
    })

    // Advance button should be enabled (pre-selected)
    expect(screen.getByTestId('advance-to-social-button')).not.toBeDisabled()

    // The selected card should have primary border
    const selectedCard = screen.getByTestId('episode-card-ep-2')
    expect(selectedCard.className).toContain('border-primary')
  })

  it('allows switching selection from one episode to another', async () => {
    mockFindEpisodesSuccess()
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    // Mock 2 PATCH calls (first selection + switch)
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ data: {} }) } as never)
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ data: {} }) } as never)

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-phase')).toBeInTheDocument()
    })

    // Select ep-1
    await user.click(screen.getByTestId('episode-card-ep-1'))
    expect(screen.getByTestId('episode-card-ep-1').className).toContain('border-primary')

    // Switch to ep-2
    await user.click(screen.getByTestId('episode-card-ep-2'))
    expect(screen.getByTestId('episode-card-ep-2').className).toContain('border-primary')
    expect(screen.getByTestId('episode-card-ep-1').className).not.toContain('border-primary')

    // Both PATCH calls should have been made
    const patchCalls = vi.mocked(fetch).mock.calls.filter(
      call => call[1] && (call[1] as RequestInit).method === 'PATCH'
    )
    expect(patchCalls).toHaveLength(2)
    expect(JSON.parse((patchCalls[1]?.[1] as RequestInit).body as string)).toEqual({ selected_video: 'ep-2' })
  })

  it('retries on error when retry button is clicked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    } as never)
    const onDataUpdate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<NewsEpisodesPhase news={mockNews} onDataUpdate={onDataUpdate} onAdvance={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-error')).toBeInTheDocument()
    })

    mockFindEpisodesSuccess()

    await user.click(screen.getByText('Tentar novamente'))

    await waitFor(() => {
      expect(screen.getByTestId('news-episodes-phase')).toBeInTheDocument()
    })
  })
})
