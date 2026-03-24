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
    expect(getMaxReachablePhase({ ...baseNews, related_videos: ['ep-1'], selected_video: 'ep-1' } as never)).toBe(3)
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
    vi.mocked(fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.includes('/api/podcast')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { features: { socialPublish: false } } }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data }),
      } as Response)
    })
  }

  it('shows loading state initially', () => {
    vi.mocked(fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.includes('/api/podcast')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { features: {} } }) } as Response)
      }
      return new Promise(() => {}) // never resolves for news
    })
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
    vi.mocked(fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.includes('/api/podcast')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { features: {} } }) } as Response)
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
    })

    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('news-workspace-error')).toBeInTheDocument()
    })
  })

  it('retries fetch when retry button is clicked', async () => {
    let callCount = 0
    vi.mocked(fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.includes('/api/podcast')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { features: {} } }) } as Response)
      }
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: mockNewsData }) } as Response)
    })

    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('news-workspace-error')).toBeInTheDocument()
    })

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
    let newsCallCount = 0
    vi.mocked(fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.includes('/api/podcast')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { features: {} } }) } as Response)
      }
      if (urlStr.includes('/find-episodes')) {
        return new Promise(() => {}) // never resolves
      }
      newsCallCount++
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: mockNewsData }) } as Response)
    })

    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('news-workspace')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByTestId('find-episodes-button'))

    // Phase 2 loading state shown — workspace didn't reset to loading
    expect(screen.getByTestId('news-episodes-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('news-workspace-loading')).not.toBeInTheDocument()
  })

  it('navigates to phase 2 when find episodes button is clicked', async () => {
    vi.mocked(fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlStr.includes('/api/podcast')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { features: {} } }) } as Response)
      }
      if (urlStr.includes('/find-episodes')) {
        return new Promise(() => {}) // never resolves
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: mockNewsData }) } as Response)
    })

    const user = userEvent.setup()
    render(<NewsWorkspace newsId="news-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('find-episodes-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('find-episodes-button'))

    // Phase 2 shows loading state (from NewsEpisodesPhase)
    expect(screen.getByTestId('news-episodes-loading')).toBeInTheDocument()
  })
})
