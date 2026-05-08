import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { VideosLayout } from './videos-layout'

// Mock next/navigation
const mockGet = vi.fn()
const mockPush = vi.fn()
const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    get: mockGet,
  })),
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
  })),
  usePathname: vi.fn(() => '/videos'),
}))

// Mock child components to isolate testing
vi.mock('@/components/layout/sidebar', () => ({
  Sidebar: ({ userName, enabledSocialNetworks }: { userName?: string; enabledSocialNetworks?: string[] }) => (
    <div data-testid="sidebar" data-social-networks={enabledSocialNetworks?.join(',') ?? ''}>Sidebar {userName}</div>
  ),
}))

vi.mock('@/components/layout/master-detail-layout', () => ({
  MasterDetailLayout: ({
    sidebar,
    list,
    detail,
  }: {
    sidebar: React.ReactNode
    list: React.ReactNode
    detail: React.ReactNode
  }) => (
    <div data-testid="master-detail-layout">
      {sidebar}
      {list}
      {detail}
    </div>
  ),
}))

let capturedVideoListPanelVariant: string | undefined
vi.mock('@/components/videos/video-list-panel', () => ({
  VideoListPanel: ({
    videos,
    selectedVideoId,
    onVideoSelect,
    variant,
  }: {
    videos?: unknown[]
    selectedVideoId?: string | null
    onVideoSelect?: (id: string) => void
    variant?: string
  }) => {
    capturedVideoListPanelVariant = variant
    return (
      <div data-testid="video-list-panel">
        VideoListPanel videos={videos?.length ?? 0} selected={selectedVideoId}
        <button onClick={() => onVideoSelect?.('test-video')}>Select Video</button>
      </div>
    )
  },
}))

vi.mock('@/components/videos/video-detail-panel', () => ({
  VideoDetailPanel: ({ videoId }: { videoId?: string | null }) => (
    <div data-testid="video-detail-panel">VideoDetailPanel {videoId}</div>
  ),
}))

vi.mock('@/components/settings/settings-panel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel">SettingsPanel</div>,
}))

vi.mock('@/components/editorial/editorial-panel', () => ({
  EditorialPanel: () => <div data-testid="editorial-panel">EditorialPanel</div>,
}))

vi.mock('@/components/social/social-layout', () => ({
  SocialLayout: ({ enabledSocialNetworks }: { enabledSocialNetworks?: string[] }) => (
    <div data-testid="social-layout" data-networks={enabledSocialNetworks?.join(',') ?? ''}>SocialLayout</div>
  ),
}))

vi.mock('@/components/adwords/adwords-layout', () => ({
  AdwordsLayout: () => <div data-testid="adwords-layout">AdwordsLayout</div>,
}))

// Mock useVideos hook
vi.mock('@/hooks/use-videos', () => ({
  useVideos: vi.fn(() => ({
    videos: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })),
}))

// Mock useCurrentUser hook
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(() => ({
    isAdmin: false,
    isLoading: false,
  })),
}))

describe('VideosLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedVideoListPanelVariant = undefined
    mockGet.mockReturnValue(null)
    mockReplace.mockClear()
    // Mock fetch for podcast features
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { features: { editorial: true, news: true } } }),
    })
  })

  it('renderiza MasterDetailLayout por padrão', () => {
    render(<VideosLayout />)

    expect(screen.getByTestId('master-detail-layout')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('video-list-panel')).toBeInTheDocument()
    expect(screen.getByTestId('video-detail-panel')).toBeInTheDocument()
  })

  it('passa variant="editorial" para VideoListPanel na aba Vídeos', () => {
    render(<VideosLayout />)

    expect(capturedVideoListPanelVariant).toBe('editorial')
  })

  it('passa userName para Sidebar', () => {
    render(<VideosLayout userName="John Doe" />)

    expect(screen.getByText(/John Doe/)).toBeInTheDocument()
  })

  it('redireciona para /videos se acessado diretamente com ?selected', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'selected') return 'video-123'
      return null
    })

    render(<VideosLayout />)

    // Should redirect to /videos without the selected param
    expect(mockReplace).toHaveBeenCalledWith('/videos')

    // On initial render, selectedVideoId should be null (before redirect completes)
    expect(screen.getByTestId('video-detail-panel')).toHaveTextContent('VideoDetailPanel')
    expect(screen.getByTestId('video-detail-panel')).not.toHaveTextContent('video-123')
  })

  it('não redireciona quando não há ?selected na URL inicial', () => {
    mockGet.mockReturnValue(null)

    render(<VideosLayout />)

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('renderiza SettingsPanel quando view=settings', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'view') return 'settings'
      return null
    })

    render(<VideosLayout />)

    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument()
    expect(screen.queryByTestId('video-list-panel')).not.toBeInTheDocument()
  })

  it('mostra Sidebar mesmo em view=settings', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'view') return 'settings'
      return null
    })

    render(<VideosLayout userName="Test User" />)

    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByText(/Test User/)).toBeInTheDocument()
  })

  it('atualiza URL quando vídeo é selecionado', async () => {
    const user = userEvent.setup()
    render(<VideosLayout />)

    await user.click(screen.getByRole('button', { name: /select video/i }))

    expect(mockPush).toHaveBeenCalledWith('/videos?selected=test-video')
  })

  it('renderiza EditorialPanel quando view=editorial', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'view') return 'editorial'
      return null
    })

    render(<VideosLayout />)

    expect(screen.getByTestId('editorial-panel')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument()
    expect(screen.queryByTestId('video-list-panel')).not.toBeInTheDocument()
  })

  it('renderiza SocialLayout quando view=social', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'view') return 'social'
      return null
    })

    render(<VideosLayout />)

    expect(screen.getByTestId('social-layout')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument()
  })

  it('passa enabledSocialNetworks para SocialLayout', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'view') return 'social'
      return null
    })

    // Mock fetch to return enabledSocialNetworks
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: { features: { editorial: true, news: true, socialMedia: true }, enabledSocialNetworks: ['instagram', 'linkedin'] },
      }),
    })

    render(<VideosLayout />)

    await vi.waitFor(() => {
      const socialLayout = screen.getByTestId('social-layout')
      expect(socialLayout).toHaveAttribute('data-networks', 'instagram,linkedin')
    })
  })

  it('redireciona para /videos quando view=social e socialMedia desabilitado', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'view') return 'social'
      return null
    })

    // Mock fetch to return socialMedia: false
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { features: { editorial: true, news: true, socialMedia: false } } }),
    })

    render(<VideosLayout />)

    // Wait for the fetch to resolve and trigger redirect
    await vi.waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/videos')
    })
  })

  it('mostra Sidebar com userName em view=editorial', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'view') return 'editorial'
      return null
    })

    render(<VideosLayout userName="Test User" />)

    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByText(/Test User/)).toBeInTheDocument()
  })

  it('renderiza AdwordsLayout quando view=adwords', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'view') return 'adwords'
      return null
    })

    render(<VideosLayout />)

    expect(screen.getByTestId('adwords-layout')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument()
  })

  it('redireciona para /videos quando view=adwords e features.adwords desabilitado', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'view') return 'adwords'
      return null
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { features: { editorial: true, news: true, adwords: false } } }),
    })

    render(<VideosLayout />)

    await vi.waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/videos')
    })
  })
})
