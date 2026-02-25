import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { SocialPost } from '@/types/social'

vi.mock('./social-post-editor', () => ({
  SocialPostEditor: ({ post }: { post: SocialPost }) => (
    <div data-testid="social-post-editor">
      <span>{post.cta}</span>
      <span>{post.body}</span>
      <span>{post.hashtags.join(' ')}</span>
    </div>
  ),
}))

import { SocialPostColumn } from './social-post-column'

const defaultProps = {
  networkId: 'instagram',
  networkName: 'Instagram',
  networkIcon: '📸',
  videoId: 'video-1',
  post: null as SocialPost | null,
  isGenerating: false,
  isLoading: false,
  isReprocessing: false,
  error: null as string | null,
  onRetry: vi.fn(),
  onReprocess: vi.fn().mockResolvedValue(undefined),
  onPostUpdated: vi.fn(),
}

const mockPost: SocialPost = {
  networkId: 'instagram',
  cta: 'Confira o novo episódio!',
  body: 'Neste episódio falamos sobre React 19 e suas novidades.',
  hashtags: ['#react', '#javascript', '#podcast'],
  updatedAt: '2026-02-24T00:00:00Z',
  processedBy: 'llm',
}

describe('SocialPostColumn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    defaultProps.onReprocess.mockResolvedValue(undefined)
  })

  it('renders post content when post exists', () => {
    render(<SocialPostColumn {...defaultProps} post={mockPost} />)

    expect(screen.getByTestId('social-post-editor')).toBeInTheDocument()
    expect(screen.getByText('Confira o novo episódio!')).toBeInTheDocument()
    expect(screen.getByText('Neste episódio falamos sobre React 19 e suas novidades.')).toBeInTheDocument()
    expect(screen.getByText('#react #javascript #podcast')).toBeInTheDocument()
  })

  it('renders spinner when generating', () => {
    render(<SocialPostColumn {...defaultProps} isGenerating={true} />)

    expect(screen.getByText(/Aguarde, gerando seu melhor post para o Instagram/)).toBeInTheDocument()
  })

  it('renders error with retry button', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <SocialPostColumn {...defaultProps} error="Rate limit exceeded" onRetry={onRetry} />
    )

    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
    const retryButton = screen.getByRole('button', { name: /tentar novamente/i })
    expect(retryButton).toBeInTheDocument()

    await user.click(retryButton)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders waiting state when queued', () => {
    render(<SocialPostColumn {...defaultProps} />)

    const column = screen.getByTestId('social-post-column')
    expect(column).toBeInTheDocument()
    expect(screen.queryByText(/Aguarde/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tentar novamente/)).not.toBeInTheDocument()
  })

  it('displays network icon and name in header', () => {
    render(<SocialPostColumn {...defaultProps} />)

    expect(screen.getByRole('img', { name: 'Instagram' })).toHaveTextContent('📸')
    expect(screen.getByText('Instagram')).toBeInTheDocument()
  })

  it('renders hashtags as formatted list', () => {
    render(<SocialPostColumn {...defaultProps} post={mockPost} />)

    expect(screen.getByText('#react #javascript #podcast')).toBeInTheDocument()
  })

  it('does not render hashtags section when hashtags array is empty', () => {
    const postWithoutHashtags = { ...mockPost, hashtags: [] }
    render(<SocialPostColumn {...defaultProps} post={postWithoutHashtags} />)

    expect(screen.getByText(mockPost.cta)).toBeInTheDocument()
    expect(screen.queryByText('#')).not.toBeInTheDocument()
  })

  // Reprocessing tests
  it('shows Reprocessar button when post exists', () => {
    render(<SocialPostColumn {...defaultProps} post={mockPost} />)

    expect(screen.getByRole('button', { name: /reprocessar/i })).toBeInTheDocument()
  })

  it('shows additionalContext form when Reprocessar clicked', async () => {
    const user = userEvent.setup()
    render(<SocialPostColumn {...defaultProps} post={mockPost} />)

    await user.click(screen.getByRole('button', { name: /reprocessar/i }))
    expect(screen.getByPlaceholderText(/Foque mais no convidado/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /gerar novamente/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })

  it('calls onReprocess with additionalContext', async () => {
    const user = userEvent.setup()
    const onReprocess = vi.fn().mockResolvedValue(undefined)
    render(<SocialPostColumn {...defaultProps} post={mockPost} onReprocess={onReprocess} />)

    await user.click(screen.getByRole('button', { name: /reprocessar/i }))
    await user.type(screen.getByPlaceholderText(/Foque mais no convidado/), 'Foque no tema AI')
    await user.click(screen.getByRole('button', { name: /gerar novamente/i }))

    expect(onReprocess).toHaveBeenCalledWith('instagram', 'Foque no tema AI')
  })

  it('shows spinner during reprocessing', () => {
    render(<SocialPostColumn {...defaultProps} post={mockPost} isReprocessing={true} />)

    expect(screen.getByText(/Aguarde, gerando seu melhor post para o Instagram/)).toBeInTheDocument()
    // Reprocess button should be hidden during reprocessing
    expect(screen.queryByRole('button', { name: /reprocessar/i })).not.toBeInTheDocument()
  })

  it('hides reprocess form after successful reprocess', async () => {
    const user = userEvent.setup()
    const onReprocess = vi.fn().mockResolvedValue(undefined)
    render(<SocialPostColumn {...defaultProps} post={mockPost} onReprocess={onReprocess} />)

    await user.click(screen.getByRole('button', { name: /reprocessar/i }))
    expect(screen.getByPlaceholderText(/Foque mais no convidado/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /gerar novamente/i }))

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Foque mais no convidado/)).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /reprocessar/i })).toBeInTheDocument()
  })

  it('shows error when reprocess fails', async () => {
    const user = userEvent.setup()
    const onReprocess = vi.fn().mockRejectedValue(new Error('Parse error'))
    render(<SocialPostColumn {...defaultProps} post={mockPost} onReprocess={onReprocess} />)

    await user.click(screen.getByRole('button', { name: /reprocessar/i }))
    await user.click(screen.getByRole('button', { name: /gerar novamente/i }))

    await waitFor(() => {
      expect(screen.getByText('Parse error')).toBeInTheDocument()
    })
  })
})
