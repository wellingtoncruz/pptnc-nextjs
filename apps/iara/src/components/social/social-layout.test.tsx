import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { useVideos } from '@/hooks/use-videos'

import { SocialLayout } from './social-layout'

// Mock next/navigation
const mockGet = vi.fn()
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    get: mockGet,
  })),
  useRouter: vi.fn(() => ({
    push: mockPush,
  })),
  usePathname: vi.fn(() => '/videos'),
}))

// Mock VideoListPanel — captures videos, excludeTypes, and variant props
let capturedVideos: unknown[] = []
let capturedExcludeTypes: string[] | undefined
let capturedVariant: string | undefined
vi.mock('@/components/videos/video-list-panel', () => ({
  VideoListPanel: ({
    videos,
    excludeTypes,
    variant,
    onVideoSelect,
    onSync,
  }: {
    videos?: { id: string }[]
    excludeTypes?: string[]
    variant?: string
    onVideoSelect?: (id: string) => void
    onSync?: () => void
  }) => {
    capturedVideos = videos ?? []
    capturedExcludeTypes = excludeTypes
    capturedVariant = variant
    return (
      <div data-testid="video-list-panel">
        VideoListPanel
        {onSync && <button data-testid="sync-button">Sync</button>}
        <button onClick={() => onVideoSelect?.('video-1')}>Select Video</button>
        <span data-testid="video-ids">{(videos ?? []).map((v: { id: string }) => v.id).join(',')}</span>
      </div>
    )
  },
}))

// Mock SocialColumnsLayout
vi.mock('./social-columns-layout', () => ({
  SocialColumnsLayout: ({ video, enabledNetworks }: { video: { id: string }; enabledNetworks: unknown[] }) => (
    <div data-testid="social-columns-layout">
      SocialColumnsLayout video={video.id} networks={enabledNetworks.length}
    </div>
  ),
}))

// Mock useVideos hook
const mockVideos = [
  {
    id: 'video-123',
    title: 'Test Video',
    theme: 'tech',
    description: 'A test video',
    duration: 600,
    status: 'draft',
    videoType: 'cut',
  },
]
vi.mock('@/hooks/use-videos', () => ({
  useVideos: vi.fn(() => ({
    videos: mockVideos,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    page: 1,
    totalPages: 1,
    setPage: vi.fn(),
    typeFilter: 'all',
    setTypeFilter: vi.fn(),
    statusFilter: 'not_sent',
    setStatusFilter: vi.fn(),
  })),
}))

describe('SocialLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedVideos = []
    capturedExcludeTypes = undefined
    capturedVariant = undefined
    mockGet.mockReturnValue(null)
    // Mock fetch for social-networks
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { id: 'instagram', name: 'Instagram', icon: '📸' },
          { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
        ],
      }),
    })
  })

  it('exibe empty state quando nenhum vídeo selecionado', () => {
    render(<SocialLayout />)

    expect(screen.getByText('Selecione um vídeo para ver os posts sociais')).toBeInTheDocument()
    expect(screen.queryByTestId('social-columns-layout')).not.toBeInTheDocument()
  })

  it('exibe VideoListPanel sem botão de sync', () => {
    render(<SocialLayout />)

    expect(screen.getByTestId('video-list-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('sync-button')).not.toBeInTheDocument()
  })

  it('renders SocialColumnsLayout when video is selected', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'selected') return 'video-123'
      return null
    })

    render(<SocialLayout enabledSocialNetworks={['instagram', 'linkedin']} />)

    // Wait for social-networks fetch to resolve
    const columnsLayout = await screen.findByTestId('social-columns-layout')
    expect(columnsLayout).toBeInTheDocument()
    expect(columnsLayout).toHaveTextContent('video-123')
    expect(columnsLayout).toHaveTextContent('networks=2')
    expect(screen.queryByText('Selecione um vídeo para ver os posts sociais')).not.toBeInTheDocument()
  })

  it('does not render columns when no video selected (empty state maintained)', () => {
    render(<SocialLayout enabledSocialNetworks={['instagram']} />)

    expect(screen.queryByTestId('social-columns-layout')).not.toBeInTheDocument()
    expect(screen.getByText('Selecione um vídeo para ver os posts sociais')).toBeInTheDocument()
  })

  it('navega para URL correta ao selecionar vídeo', async () => {
    const user = userEvent.setup()

    render(<SocialLayout />)

    await user.click(screen.getByRole('button', { name: /select video/i }))

    expect(mockPush).toHaveBeenCalledWith('/videos?view=social&selected=video-1')
  })

  it('chama useVideos com statusFilter "ready_sent" (Epic 26 / TD-11)', () => {
    render(<SocialLayout />)

    expect(useVideos).toHaveBeenCalledWith({ statusFilter: 'ready_sent' })
  })

  it('NÃO passa excludeTypes — episódios agora aparecem na aba social (Epic 26)', () => {
    render(<SocialLayout />)

    expect(capturedExcludeTypes).toBeUndefined()
  })

  it('passa variant="social" para VideoListPanel', () => {
    render(<SocialLayout />)

    expect(capturedVariant).toBe('social')
  })

  it('inclui episódios e preserva a ordem recent-first da API (não força sent pro topo)', () => {
    // Epic 26: episódios agora aparecem na aba social (sem exclusão por tipo).
    // A API entrega recent-first (publishedAt desc) já escopada a ready+sent;
    // o social-layout NÃO deve reordenar sent pro topo (Story 25.12).
    const mixedVideos = [
      { id: 'v-ready-cut', status: 'ready', videoType: 'cut' },
      { id: 'v-sent-reel', status: 'sent', videoType: 'reel' },
      { id: 'v-ready-episode', status: 'ready', videoType: 'episode' },
      { id: 'v-sent-episode', status: 'sent', videoType: 'episode' },
    ]
    vi.mocked(useVideos).mockReturnValueOnce({
      videos: mixedVideos,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      page: 1,
      totalPages: 1,
      setPage: vi.fn(),
      typeFilter: 'all',
      setTypeFilter: vi.fn(),
      statusFilter: 'ready_sent',
      setStatusFilter: vi.fn(),
    } as ReturnType<typeof useVideos>)

    render(<SocialLayout />)

    // Episódios incluídos; ordem da API preservada (sent NÃO vai pro topo)
    const videoIds = screen.getByTestId('video-ids').textContent
    expect(videoIds).toBe('v-ready-cut,v-sent-reel,v-ready-episode,v-sent-episode')
  })
})
