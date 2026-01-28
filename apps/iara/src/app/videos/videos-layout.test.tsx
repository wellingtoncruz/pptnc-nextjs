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
  Sidebar: ({ userName }: { userName?: string }) => (
    <div data-testid="sidebar">Sidebar {userName}</div>
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

vi.mock('@/components/videos/video-list-panel', () => ({
  VideoListPanel: ({
    videos,
    selectedVideoId,
    onVideoSelect,
  }: {
    videos?: unknown[]
    selectedVideoId?: string | null
    onVideoSelect?: (id: string) => void
  }) => (
    <div data-testid="video-list-panel">
      VideoListPanel videos={videos?.length ?? 0} selected={selectedVideoId}
      <button onClick={() => onVideoSelect?.('test-video')}>Select Video</button>
    </div>
  ),
}))

vi.mock('@/components/videos/video-detail-panel', () => ({
  VideoDetailPanel: ({ videoId }: { videoId?: string | null }) => (
    <div data-testid="video-detail-panel">VideoDetailPanel {videoId}</div>
  ),
}))

vi.mock('@/components/settings/settings-panel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel">SettingsPanel</div>,
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

describe('VideosLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(null)
    mockReplace.mockClear()
  })

  it('renderiza MasterDetailLayout por padrão', () => {
    render(<VideosLayout />)

    expect(screen.getByTestId('master-detail-layout')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('video-list-panel')).toBeInTheDocument()
    expect(screen.getByTestId('video-detail-panel')).toBeInTheDocument()
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
})
