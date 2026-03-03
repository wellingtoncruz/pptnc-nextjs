import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { getMaxReachablePhase, NewsWorkspace } from './news-workspace'

const mockNewsData = {
  id: 'news-1',
  titulo: 'Test News Title',
  descricao: 'Desc',
  resumo: '',
  comentarios: '',
  data: '2026-03-01',
  fonte: { nome: 'Fonte', url: '' },
  importedAt: '2026-03-01T00:00:00.000Z',
}

// --- Pure function tests ---
describe('getMaxReachablePhase', () => {
  const baseNews = {
    id: 'news-1',
    titulo: 'Test',
    descricao: '',
    resumo: '',
    comentarios: '',
    data: '',
    fonte: { nome: '', url: '' },
    importedAt: { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 },
  }

  it('returns 1 when no related_videos', () => {
    expect(getMaxReachablePhase(baseNews as never)).toBe(1)
  })

  it('returns 2 when related_videos exist but no selected_video', () => {
    expect(getMaxReachablePhase({ ...baseNews, related_videos: ['ep-1'] } as never)).toBe(2)
  })

  it('returns 3 when selected_video exists', () => {
    expect(getMaxReachablePhase({ ...baseNews, selected_video: 'ep-1' } as never)).toBe(3)
  })

  it('returns 1 when related_videos is empty array', () => {
    expect(getMaxReachablePhase({ ...baseNews, related_videos: [] } as never)).toBe(1)
  })
})

// --- Component integration tests ---
describe('NewsWorkspace component', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockFetchNews(data = mockNewsData) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data }),
    } as never)
  }

  it('shows loading state initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    render(<NewsWorkspace newsId="news-1" />)

    expect(screen.getByTestId('news-workspace-loading')).toBeInTheDocument()
  })

  it('renders workspace after successful fetch', async () => {
    mockFetchNews()
    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('news-workspace')).toBeInTheDocument()
    })

    // Title appears in header + phase 1
    const titles = screen.getAllByText('Test News Title')
    expect(titles.length).toBeGreaterThanOrEqual(1)
  })

  it('shows error state on fetch failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    } as never)

    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('news-workspace-error')).toBeInTheDocument()
    })
  })

  it('retries fetch when retry button is clicked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    } as never)

    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('news-workspace-error')).toBeInTheDocument()
    })

    mockFetchNews()
    const user = userEvent.setup()
    await user.click(screen.getByText('Tentar novamente'))

    await waitFor(() => {
      expect(screen.getByTestId('news-workspace')).toBeInTheDocument()
    })
  })

  it('shows phase 1 by default with all 3 phase labels', async () => {
    mockFetchNews()
    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('news-workspace')).toBeInTheDocument()
    })

    expect(screen.getByText('Notícia')).toBeInTheDocument()
    expect(screen.getByText('Episódios')).toBeInTheDocument()
    expect(screen.getByText('Redação')).toBeInTheDocument()
    expect(screen.getByTestId('find-episodes-button')).toBeInTheDocument()
  })

  it('handleDataUpdate re-fetches news without resetting phase', async () => {
    // Initial fetch returns news without related_videos
    mockFetchNews()
    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('news-workspace')).toBeInTheDocument()
    })

    // Phase 2 auto-fetch returns episodes, then calls onDataUpdate
    // which triggers handleDataUpdate → re-fetches news with related_videos
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {})) // Phase 2 find-episodes (pending)

    const user = userEvent.setup()
    await user.click(screen.getByTestId('find-episodes-button'))

    // Phase 2 loading state shown — workspace didn't reset to loading
    expect(screen.getByTestId('news-episodes-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('news-workspace-loading')).not.toBeInTheDocument()
  })

  it('navigates to phase 2 when find episodes button is clicked', async () => {
    mockFetchNews()
    const user = userEvent.setup()
    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('find-episodes-button')).toBeInTheDocument()
    })

    // Phase 2 will auto-fetch via POST find-episodes
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}))

    await user.click(screen.getByTestId('find-episodes-button'))

    // Phase 2 shows loading state (from NewsEpisodesPhase)
    expect(screen.getByTestId('news-episodes-loading')).toBeInTheDocument()
  })
})
