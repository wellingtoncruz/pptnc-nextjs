import { render, screen, waitFor, act } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { VideoSummary } from '@/types/video'
import type { NewsletterStatus } from '@/lib/newsletter/types'

// Capture onStatusChange callbacks from mocked phase components
const captured = vi.hoisted(() => ({
  draftOnStatusChange: undefined as ((s: NewsletterStatus) => void) | undefined,
  newsOnStatusChange: undefined as ((s: NewsletterStatus) => void) | undefined,
  imageOnStatusChange: undefined as ((s: NewsletterStatus) => void) | undefined,
  reportOnStatusChange: undefined as ((s: NewsletterStatus) => void) | undefined,
}))

vi.mock('./newsletter-draft-phase', () => ({
  NewsletterDraftPhase: (props: { onStatusChange?: (s: NewsletterStatus) => void }) => {
    captured.draftOnStatusChange = props.onStatusChange
    return <div data-testid="newsletter-draft-phase">Draft Phase</div>
  },
}))

vi.mock('./newsletter-news-phase', () => ({
  NewsletterNewsPhase: (props: { onStatusChange?: (s: NewsletterStatus) => void }) => {
    captured.newsOnStatusChange = props.onStatusChange
    return <div data-testid="newsletter-news-phase">News Phase</div>
  },
}))

vi.mock('./newsletter-image-phase', () => ({
  NewsletterImagePhase: (props: { onStatusChange?: (s: NewsletterStatus) => void }) => {
    captured.imageOnStatusChange = props.onStatusChange
    return <div data-testid="newsletter-image-phase">Image Phase</div>
  },
}))

vi.mock('./newsletter-report-phase', () => ({
  NewsletterReportPhase: (props: { onStatusChange?: (s: NewsletterStatus) => void }) => {
    captured.reportOnStatusChange = props.onStatusChange
    return <div data-testid="newsletter-report-phase">Report Phase</div>
  },
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { NewsletterWorkPanel } from './newsletter-work-panel'

const createMockVideo = (overrides: Partial<VideoSummary> = {}): VideoSummary => ({
  id: 'video-123',
  title: 'Episódio de Teste',
  thumbnails: {
    medium: { url: 'https://example.com/thumb.jpg', width: 320, height: 180 },
  },
  duration: 3600,
  status: 'sent',
  videoType: 'episode',
  transcriptionSRT: 'mock-srt',
  transcriptionTXT: 'mock-txt',
  ...overrides,
})

function mockFetchNewsletterStatus(status: string | null) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/podcast')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: {
            prompts: { episode: { newsletter: { format: { description: 'Default format prompt' } } } },
          },
        }),
      })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        data: status ? { status } : null,
      }),
    })
  })
}

describe('NewsletterWorkPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    captured.draftOnStatusChange = undefined
    captured.newsOnStatusChange = undefined
    captured.imageOnStatusChange = undefined
    captured.reportOnStatusChange = undefined
    mockFetchNewsletterStatus(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exibe loading spinner enquanto busca status', () => {
    // Fetch that never resolves
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    expect(screen.getByTestId('newsletter-work-panel-loading')).toBeInTheDocument()
  })

  it('exibe título do vídeo no header após loading', async () => {
    mockFetchNewsletterStatus(null)
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo({ title: 'Meu Episódio' })} />)

    await waitFor(() => {
      expect(screen.getByText('Meu Episódio')).toBeInTheDocument()
    })
  })

  it('exibe step indicator com 4 fases', async () => {
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-phase-nav')).toBeInTheDocument()
    })

    expect(screen.getByTestId('phase-1')).toBeInTheDocument()
    expect(screen.getByTestId('phase-2')).toBeInTheDocument()
    expect(screen.getByTestId('phase-3')).toBeInTheDocument()
    expect(screen.getByTestId('phase-4')).toBeInTheDocument()
  })

  it('mostra Fase 1 como ativa quando newsletter inexistente', async () => {
    mockFetchNewsletterStatus(null)
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-draft-phase')).toBeInTheDocument()
    })

    expect(screen.getByTestId('phase-1')).toHaveClass('bg-primary')
  })

  it('navega para maxReachable quando status é draft (phase 2)', async () => {
    mockFetchNewsletterStatus('draft')
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-news-phase')).toBeInTheDocument()
    })

    expect(screen.getByTestId('phase-2')).toHaveClass('bg-primary')
    // Phase 1 should be reachable (completed)
    expect(screen.getByTestId('phase-1')).not.toBeDisabled()
  })

  it('navega para maxReachable quando status é news_selected (phase 3)', async () => {
    mockFetchNewsletterStatus('news_selected')
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-image-phase')).toBeInTheDocument()
    })

    expect(screen.getByTestId('phase-3')).toHaveClass('bg-primary')
  })

  it('permite clicar em fases anteriores ao status', async () => {
    const user = userEvent.setup()
    mockFetchNewsletterStatus('news_selected')
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-image-phase')).toBeInTheDocument()
    })

    // Phase 1 should be clickable (completed phase)
    await user.click(screen.getByTestId('phase-1'))
    expect(screen.getByTestId('newsletter-draft-phase')).toBeInTheDocument()
  })

  it('desabilita fases futuras ao status', async () => {
    mockFetchNewsletterStatus('draft')
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-news-phase')).toBeInTheDocument()
    })

    // maxReachable for 'draft' is 2
    expect(screen.getByTestId('phase-3')).toBeDisabled()
    expect(screen.getByTestId('phase-4')).toBeDisabled()
  })

  it('exibe conteúdo de cada fase acessível', async () => {
    const user = userEvent.setup()
    mockFetchNewsletterStatus('completed')
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    // Default to phase 4 (maxReachable for 'completed')
    await waitFor(() => {
      expect(screen.getByTestId('newsletter-report-phase')).toBeInTheDocument()
    })

    // Navigate to phase 1
    await user.click(screen.getByTestId('phase-1'))
    expect(screen.getByTestId('newsletter-draft-phase')).toBeInTheDocument()

    // Navigate to phase 3
    await user.click(screen.getByTestId('phase-3'))
    expect(screen.getByTestId('newsletter-image-phase')).toBeInTheDocument()
  })

  it('fetches status from newsletter API and podcast', async () => {
    mockFetchNewsletterStatus('image_ready')
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-work-panel')).toBeInTheDocument()
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/videos/v1/newsletter')
    expect(global.fetch).toHaveBeenCalledWith('/api/podcast')
  })

  it('exibe UI de erro quando fetch falha', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-work-panel-error')).toBeInTheDocument()
    })

    expect(screen.getByText(/Falha ao carregar dados da newsletter/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument()
  })

  it('retry button re-fetches data after error', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-work-panel-error')).toBeInTheDocument()
    })

    // Now make fetch succeed on retry
    mockFetchNewsletterStatus('draft')

    await user.click(screen.getByRole('button', { name: /Tentar novamente/ }))

    // Should show loading then resolve to phase 2
    await waitFor(() => {
      expect(screen.getByTestId('newsletter-news-phase')).toBeInTheDocument()
    })
  })

  // --- Regression navigation tests (Story 16-11) ---

  it('navega para fase 1 quando status regride de completed para draft', async () => {
    const user = userEvent.setup()
    mockFetchNewsletterStatus('completed')
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    // Starts at phase 4 (maxReachable for completed)
    await waitFor(() => {
      expect(screen.getByTestId('newsletter-report-phase')).toBeInTheDocument()
    })

    // Navigate to Phase 1
    await user.click(screen.getByTestId('phase-1'))
    expect(screen.getByTestId('newsletter-draft-phase')).toBeInTheDocument()

    // Simulate draft regeneration: phase 1 calls onStatusChange('draft')
    act(() => { captured.draftOnStatusChange?.('draft') })

    // Should stay at Phase 1 (regression: completed → draft navigates to statusToPhase('draft') = 1)
    await waitFor(() => {
      expect(screen.getByTestId('newsletter-draft-phase')).toBeInTheDocument()
    })
    expect(screen.getByTestId('phase-1')).toHaveClass('bg-primary')

    // Phases 3, 4 should be disabled (maxReachable for 'draft' = 2)
    expect(screen.getByTestId('phase-3')).toBeDisabled()
    expect(screen.getByTestId('phase-4')).toBeDisabled()
  })

  it('avança para próxima fase quando status progride (forward)', async () => {
    mockFetchNewsletterStatus(null)
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-draft-phase')).toBeInTheDocument()
    })

    // Simulate draft generated: phase 1 calls onStatusChange('draft')
    act(() => { captured.draftOnStatusChange?.('draft') })

    // Should advance to Phase 2 (progression: undefined → draft navigates to maxReachable = 2)
    await waitFor(() => {
      expect(screen.getByTestId('newsletter-news-phase')).toBeInTheDocument()
    })
    expect(screen.getByTestId('phase-2')).toHaveClass('bg-primary')
  })

  it('mantém fase atual se ainda acessível após invalidação de imagem', async () => {
    const user = userEvent.setup()
    mockFetchNewsletterStatus('completed')
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-report-phase')).toBeInTheDocument()
    })

    // Navigate to Phase 3 (image phase)
    await user.click(screen.getByTestId('phase-3'))
    expect(screen.getByTestId('newsletter-image-phase')).toBeInTheDocument()

    // Simulate image regeneration: phase 3 calls onStatusChange('image_ready')
    // This is technically a regression (completed → image_ready), phase stays at 3
    act(() => { captured.imageOnStatusChange?.('image_ready') })

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-image-phase')).toBeInTheDocument()
    })
    expect(screen.getByTestId('phase-3')).toHaveClass('bg-primary')
  })

  it('re-fetches newsletter data after status change', async () => {
    mockFetchNewsletterStatus('completed')
    render(<NewsletterWorkPanel videoId="v1" video={createMockVideo()} />)

    await waitFor(() => {
      expect(screen.getByTestId('newsletter-report-phase')).toBeInTheDocument()
    })

    // Clear fetch mock to track new calls
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockClear()

    // Simulate status change
    act(() => { captured.reportOnStatusChange?.('completed') })

    // Should trigger a re-fetch of newsletter data
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/videos/v1/newsletter')
    })
  })
})
