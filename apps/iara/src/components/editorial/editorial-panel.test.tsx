import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

import { EditorialPanel } from './editorial-panel'

const mockEpisodes = [
  {
    id: 'ep-1',
    title: 'Episode Alpha',
    description: 'First episode',
    status: 'sent',
    thumbnailUrl: 'https://img.youtube.com/vi/ep-1/hqdefault.jpg',
    publishedAt: '2026-02-07T10:00:00Z',
  },
  {
    id: 'ep-2',
    title: 'Episode Beta',
    description: 'Second episode',
    status: 'draft',
    thumbnailUrl: 'https://img.youtube.com/vi/ep-2/hqdefault.jpg',
    publishedAt: '2026-02-06T10:00:00Z',
  },
]

function mockFetchSuccess(data: unknown = mockEpisodes) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ data }),
  } as any)
}

describe('EditorialPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exibe loading skeletons durante carregamento', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))

    render(<EditorialPanel />)

    const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('exibe episódios após carregamento', async () => {
    mockFetchSuccess()

    render(<EditorialPanel />)

    await waitFor(() => {
      expect(screen.getByText('Episode Alpha')).toBeInTheDocument()
    })
    expect(screen.getByText('Episode Beta')).toBeInTheDocument()
  })

  it('exibe empty state quando não há episódios', async () => {
    mockFetchSuccess([])

    render(<EditorialPanel />)

    await waitFor(() => {
      expect(screen.getByText('Nenhum episódio encontrado')).toBeInTheDocument()
    })
  })

  it('exibe mensagem de erro quando fetch falha', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: { message: 'Erro ao carregar episódios' } }),
    } as any)

    render(<EditorialPanel />)

    await waitFor(() => {
      expect(screen.getByText('Erro ao carregar episódios')).toBeInTheDocument()
    })
  })

  it('renderiza título Editorial no header', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))

    render(<EditorialPanel />)

    expect(screen.getByText('Editorial')).toBeInTheDocument()
  })

  it('renderiza campo de busca', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))

    render(<EditorialPanel />)

    expect(screen.getByPlaceholderText('Buscar por título...')).toBeInTheDocument()
  })

  it('chama fetch com limit=16 no mount', async () => {
    mockFetchSuccess([])

    render(<EditorialPanel />)

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('limit=16'),
      )
    })
  })

  it('exibe erro de rede', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    render(<EditorialPanel />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('filtra episódios ao digitar na busca', async () => {
    mockFetchSuccess()

    render(<EditorialPanel />)

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Episode Alpha')).toBeInTheDocument()
    })

    // Prepare mock for search response
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [mockEpisodes[0]] }),
    } as any)

    // Type in search input
    const searchInput = screen.getByPlaceholderText('Buscar por título...')
    await userEvent.type(searchInput, 'Alpha')

    // After debounce, fetch is called with search param
    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls
      const hasSearchCall = calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('search=Alpha')
      )
      expect(hasSearchCall).toBe(true)
    }, { timeout: 2000 })
  })
})
