import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { VideoSummary } from '@/types/video'

import { AdwordsLayout } from './adwords-layout'

// Mock next/navigation
const mockPush = vi.fn()
const mockSearchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/videos',
}))

// Mock useVideos
const mockVideos: VideoSummary[] = []
const mockSetPage = vi.fn()
const mockSetTypeFilter = vi.fn()
const mockSetStatusFilter = vi.fn()
const mockUseVideos = vi.fn(() => ({
  videos: mockVideos,
  isLoading: false,
  error: null,
  refresh: vi.fn(),
  page: 1,
  totalPages: 1,
  setPage: mockSetPage,
  typeFilter: 'all' as const,
  setTypeFilter: mockSetTypeFilter,
  statusFilter: 'all' as const,
  setStatusFilter: mockSetStatusFilter,
}))
vi.mock('@/hooks/use-videos', () => ({
  useVideos: (...args: unknown[]) => mockUseVideos(...args),
}))

// Mock LLM processing context
vi.mock('@/contexts', () => ({
  useLLMProcessing: () => ({
    isProcessing: false,
    startProcessing: vi.fn(),
    stopProcessing: vi.fn(),
  }),
}))

// Mock useAdwords (used by AdwordsWorkPanel)
vi.mock('@/hooks/use-adwords', () => ({
  useAdwords: () => ({
    data: null,
    isLoading: true,
    isGenerating: false,
    error: null,
    retry: vi.fn(),
    reprocess: vi.fn(),
  }),
}))

const createMockVideo = (overrides: Partial<VideoSummary> = {}): VideoSummary => ({
  id: 'video-123',
  title: 'Test Episode',
  thumbnails: {
    medium: { url: 'https://example.com/thumb.jpg', width: 320, height: 180 },
  },
  duration: 3600,
  status: 'new',
  videoType: 'episode',
  transcriptionSRT: 'mock-srt',
  transcriptionTXT: 'mock-txt',
  ...overrides,
})

describe('AdwordsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVideos.length = 0
    mockSearchParams.delete('selected')
  })

  it('renderiza layout com data-testid adwords-layout', () => {
    render(<AdwordsLayout />)
    expect(screen.getByTestId('adwords-layout')).toBeInTheDocument()
  })

  it('exibe todos os vídeos retornados pelo hook (server filtra episodes)', () => {
    // Server-side filtering via typeFilter: 'episode' means useVideos only returns episodes
    mockVideos.push(
      createMockVideo({ id: 'ep-1', videoType: 'episode', title: 'Episode 1' }),
      createMockVideo({ id: 'ep-2', videoType: 'episode', title: 'Episode 2' }),
    )

    render(<AdwordsLayout />)

    expect(screen.getByText('Episode 1')).toBeInTheDocument()
    expect(screen.getByText('Episode 2')).toBeInTheDocument()
  })

  it('ordena vídeos sent primeiro', () => {
    mockVideos.push(
      createMockVideo({ id: 'ep-1', videoType: 'episode', title: 'Episode New', status: 'new' }),
      createMockVideo({ id: 'ep-2', videoType: 'episode', title: 'Episode Sent', status: 'sent' }),
    )

    render(<AdwordsLayout />)

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    // Sent should be first
    expect(options[0]).toHaveTextContent('Episode Sent')
    expect(options[1]).toHaveTextContent('Episode New')
  })

  it('exibe estado vazio quando nenhum vídeo selecionado', () => {
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode' }))

    render(<AdwordsLayout />)

    expect(screen.getByText('Selecione um episódio para gerar o guia de tráfego pago')).toBeInTheDocument()
  })

  it('atualiza URL com view=adwords&selected ao selecionar vídeo', async () => {
    const user = userEvent.setup()
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode', title: 'Episode 1' }))

    render(<AdwordsLayout />)

    await user.click(screen.getByRole('option'))
    expect(mockPush).toHaveBeenCalledWith('/videos?view=adwords&selected=ep-1')
  })

  it('renderiza AdwordsWorkPanel quando vídeo selecionado', () => {
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode', title: 'Episode 1' }))
    mockSearchParams.set('selected', 'ep-1')

    render(<AdwordsLayout />)

    // Should not show empty state
    expect(screen.queryByText('Selecione um episódio para gerar o guia de tráfego pago')).not.toBeInTheDocument()
    // Should show work area with AdwordsWorkPanel (loading state renders spinner)
    expect(screen.getByTestId('adwords-work-area')).toBeInTheDocument()
  })

  it('chama useVideos com statusFilter all e typeFilter episode para filtrar server-side', () => {
    render(<AdwordsLayout />)

    expect(mockUseVideos).toHaveBeenCalledWith({ statusFilter: 'all', typeFilter: 'episode' })
  })

  it('usa variant adwords no VideoListPanel (sem tabs de tipo)', () => {
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode' }))

    render(<AdwordsLayout />)

    // Tabs should be hidden in adwords variant
    expect(screen.queryByRole('tab', { name: 'Todos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Episódios' })).not.toBeInTheDocument()
  })

  it('oculta toggle "Só novos" no variant adwords', () => {
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode' }))

    render(<AdwordsLayout />)

    expect(screen.queryByLabelText('Só novos')).not.toBeInTheDocument()
  })
})
