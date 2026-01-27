import { render, screen } from '@/test-utils'

import { VideosLayout } from './videos-layout'

// Mock next/navigation
const mockGet = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    get: mockGet,
  })),
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
  VideoListPanel: () => <div data-testid="video-list-panel">VideoListPanel</div>,
}))

vi.mock('@/components/videos/video-detail-panel', () => ({
  VideoDetailPanel: ({ videoId }: { videoId?: string | null }) => (
    <div data-testid="video-detail-panel">VideoDetailPanel {videoId}</div>
  ),
}))

vi.mock('@/components/settings/settings-panel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel">SettingsPanel</div>,
}))

describe('VideosLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue(null)
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

  it('passa selectedVideoId do URL para VideoDetailPanel', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'selected') return 'video-123'
      return null
    })

    render(<VideosLayout />)

    expect(screen.getByText(/video-123/)).toBeInTheDocument()
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
})
