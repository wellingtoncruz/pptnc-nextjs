import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test-utils'

import type { VideoSummary } from '@/types/video'

import { SocialColumnsLayout } from './social-columns-layout'
import type { EnabledNetworkInfo } from '@/hooks/use-social-posts'

const mockUseSocialPosts = vi.fn()

vi.mock('@/hooks/use-social-posts', () => ({
  useSocialPosts: (...args: unknown[]) => mockUseSocialPosts(...args),
}))

vi.mock('./social-post-column', () => ({
  SocialPostColumn: ({ networkName, isGenerating, isLoading, isReprocessing, error, post, videoId }: {
    networkName: string
    isGenerating: boolean
    isLoading: boolean
    isReprocessing: boolean
    error: string | null
    post: unknown
    videoId: string
  }) => (
    <div data-testid="social-post-column" data-network={networkName} data-video-id={videoId}>
      {isLoading && 'loading'}
      {isGenerating && 'generating'}
      {isReprocessing && 'reprocessing'}
      {error && `error:${error}`}
      {post && 'has-post'}
    </div>
  ),
}))

const enabledNetworks: EnabledNetworkInfo[] = [
  { id: 'instagram', name: 'Instagram', icon: '📸' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
]

const createVideo = (overrides: Partial<VideoSummary> = {}): VideoSummary => ({
  id: 'video-1',
  title: 'Test Title',
  theme: 'tech',
  description: 'Test description',
  thumbnails: { medium: { url: 'https://example.com/thumb.jpg' } },
  duration: 600,
  status: 'draft',
  videoType: 'episode',
  ...overrides,
})

describe('SocialColumnsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSocialPosts.mockReturnValue({
      posts: [],
      isLoading: false,
      isGenerating: false,
      generatingNetworkId: null,
      reprocessingNetworkId: null,
      errors: new Map(),
      retryNetwork: vi.fn(),
      reprocessNetwork: vi.fn(),
      updatePost: vi.fn(),
    })
  })

  it('renders one column per enabled network', () => {
    render(<SocialColumnsLayout video={createVideo()} enabledNetworks={enabledNetworks} />)

    const columns = screen.getAllByTestId('social-post-column')
    expect(columns).toHaveLength(2)
    expect(columns[0]).toHaveAttribute('data-network', 'Instagram')
    expect(columns[1]).toHaveAttribute('data-network', 'LinkedIn')
  })

  it('shows prerequisite message listing missing fields when video lacks data', () => {
    render(
      <SocialColumnsLayout
        video={createVideo({ title: '', theme: undefined, description: undefined })}
        enabledNetworks={enabledNetworks}
      />
    )

    expect(screen.getByTestId('social-columns-prerequisites')).toBeInTheDocument()
    expect(screen.getByText(/título, tema, descrição/)).toBeInTheDocument()
    expect(screen.queryByTestId('social-post-column')).not.toBeInTheDocument()
  })

  it('shows only the specific missing field in prerequisite message', () => {
    render(
      <SocialColumnsLayout
        video={createVideo({ theme: undefined })}
        enabledNetworks={enabledNetworks}
      />
    )

    expect(screen.getByTestId('social-columns-prerequisites')).toBeInTheDocument()
    const msg = screen.getByText(/campos processados/)
    expect(msg.textContent).toContain('tema')
    expect(msg.textContent).not.toContain('título')
    expect(msg.textContent).not.toContain('descrição')
  })

  it('shows loading state while fetching posts', () => {
    mockUseSocialPosts.mockReturnValue({
      posts: [],
      isLoading: true,
      isGenerating: false,
      generatingNetworkId: null,
      reprocessingNetworkId: null,
      errors: new Map(),
      retryNetwork: vi.fn(),
      reprocessNetwork: vi.fn(),
      updatePost: vi.fn(),
    })

    render(<SocialColumnsLayout video={createVideo()} enabledNetworks={enabledNetworks} />)

    const columns = screen.getAllByTestId('social-post-column')
    expect(columns[0]).toHaveTextContent('loading')
    expect(columns[1]).toHaveTextContent('loading')
  })

  it('passes videoId to each SocialPostColumn', () => {
    render(<SocialColumnsLayout video={createVideo()} enabledNetworks={enabledNetworks} />)

    const columns = screen.getAllByTestId('social-post-column')
    expect(columns[0]).toHaveAttribute('data-video-id', 'video-1')
    expect(columns[1]).toHaveAttribute('data-video-id', 'video-1')
  })

  it('shows reprocessing state for the correct network', () => {
    mockUseSocialPosts.mockReturnValue({
      posts: [{ networkId: 'instagram', cta: 'CTA', body: 'Body', hashtags: [], updatedAt: '', processedBy: 'llm' }],
      isLoading: false,
      isGenerating: false,
      generatingNetworkId: null,
      reprocessingNetworkId: 'instagram',
      errors: new Map(),
      retryNetwork: vi.fn(),
      reprocessNetwork: vi.fn(),
      updatePost: vi.fn(),
    })

    render(<SocialColumnsLayout video={createVideo()} enabledNetworks={enabledNetworks} />)

    const columns = screen.getAllByTestId('social-post-column')
    expect(columns[0]).toHaveTextContent('reprocessing')
    expect(columns[1]).not.toHaveTextContent('reprocessing')
  })

  it('passes correct props to each SocialPostColumn', () => {
    const mockPost = {
      networkId: 'instagram',
      cta: 'CTA',
      body: 'Body',
      hashtags: ['#test'],
      updatedAt: '2026-02-24T00:00:00Z',
      processedBy: 'llm' as const,
    }

    mockUseSocialPosts.mockReturnValue({
      posts: [mockPost],
      isLoading: false,
      isGenerating: true,
      generatingNetworkId: 'linkedin',
      reprocessingNetworkId: null,
      errors: new Map(),
      retryNetwork: vi.fn(),
      reprocessNetwork: vi.fn(),
      updatePost: vi.fn(),
    })

    render(<SocialColumnsLayout video={createVideo()} enabledNetworks={enabledNetworks} />)

    const columns = screen.getAllByTestId('social-post-column')
    // Instagram has post
    expect(columns[0]).toHaveTextContent('has-post')
    // LinkedIn is generating
    expect(columns[1]).toHaveTextContent('generating')

    // Verify hook was called with correct args
    expect(mockUseSocialPosts).toHaveBeenCalledWith('video-1', enabledNetworks, true)
  })
})
