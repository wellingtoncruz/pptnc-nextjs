import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test-utils'

// Hoisted mocks (available in vi.mock factories)
const { mockGetVideoAdmin, mockGetChildVideos, mockGetPodcastAdmin, mockNotFound } = vi.hoisted(() => ({
  mockGetVideoAdmin: vi.fn(),
  mockGetChildVideos: vi.fn(),
  mockGetPodcastAdmin: vi.fn(),
  mockNotFound: vi.fn(),
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: mockGetVideoAdmin,
  getChildVideos: mockGetChildVideos,
}))

vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: mockGetPodcastAdmin,
}))

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

vi.mock('@/components/editorial/editorial-report', () => ({
  EditorialReport: (props: Record<string, unknown>) => (
    <div data-testid="editorial-report" data-video-title={(props.video as { title: string })?.title} />
  ),
}))

import ReportPage from './page'

const mockTimestamp = { toDate: () => new Date('2024-01-15') }

describe('ReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('chama notFound quando vídeo não existe', async () => {
    mockGetVideoAdmin.mockResolvedValueOnce(null)

    await ReportPage({ params: Promise.resolve({ videoId: 'invalid' }) })

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('chama notFound quando vídeo não é episode', async () => {
    mockGetVideoAdmin.mockResolvedValueOnce({
      id: 'cut-1',
      title: 'Um corte',
      videoType: 'cut',
      duration: 60,
      publishedAt: mockTimestamp,
    })

    await ReportPage({ params: Promise.resolve({ videoId: 'cut-1' }) })

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('chama notFound quando Firestore lança erro', async () => {
    mockGetVideoAdmin.mockRejectedValueOnce(new Error('Firestore unavailable'))

    await ReportPage({ params: Promise.resolve({ videoId: 'err' }) })

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('renderiza EditorialReport para episódio válido', async () => {
    const mockVideo = {
      id: 'ep-1',
      title: 'Episódio Teste',
      videoType: 'episode',
      duration: 3600,
      publishedAt: mockTimestamp,
    }
    mockGetVideoAdmin.mockResolvedValueOnce(mockVideo)
    mockGetPodcastAdmin.mockResolvedValueOnce({ youtubeFooter: 'Footer' })
    mockGetChildVideos.mockResolvedValueOnce([
      { id: 'cut-1', videoType: 'cut', title: 'Corte 1', duration: 60, publishedAt: mockTimestamp },
      { id: 'reel-1', videoType: 'reel', title: 'Reel 1', duration: 30, publishedAt: mockTimestamp },
    ])

    const result = await ReportPage({ params: Promise.resolve({ videoId: 'ep-1' }) })
    render(result as JSX.Element)

    expect(screen.getByTestId('editorial-report')).toBeInTheDocument()
    expect(screen.getByTestId('editorial-report')).toHaveAttribute('data-video-title', 'Episódio Teste')
    expect(mockNotFound).not.toHaveBeenCalled()
  })
})
