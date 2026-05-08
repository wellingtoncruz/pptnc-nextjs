import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { VideoSummary } from '@/types/video'

import { NewsletterLayout } from './newsletter-layout'

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

describe('NewsletterLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVideos.length = 0
    mockSearchParams.delete('selected')
    // WorkPanel fetches newsletter status on mount
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renderiza layout com data-testid newsletter-layout', () => {
    render(<NewsletterLayout />)
    expect(screen.getByTestId('newsletter-layout')).toBeInTheDocument()
  })

  it('exibe todos os vídeos retornados pelo hook', () => {
    mockVideos.push(
      createMockVideo({ id: 'ep-1', videoType: 'episode', title: 'Episode 1' }),
      createMockVideo({ id: 'ep-2', videoType: 'episode', title: 'Episode 2' }),
    )

    render(<NewsletterLayout />)

    expect(screen.getByText('Episode 1')).toBeInTheDocument()
    expect(screen.getByText('Episode 2')).toBeInTheDocument()
  })

  it('ordena vídeos sent primeiro', () => {
    mockVideos.push(
      createMockVideo({ id: 'ep-1', videoType: 'episode', title: 'Episode New', status: 'new' }),
      createMockVideo({ id: 'ep-2', videoType: 'episode', title: 'Episode Sent', status: 'sent' }),
    )

    render(<NewsletterLayout />)

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('Episode Sent')
    expect(options[1]).toHaveTextContent('Episode New')
  })

  it('exibe estado vazio quando nenhum vídeo selecionado', () => {
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode' }))

    render(<NewsletterLayout />)

    expect(screen.getByText('Selecione um episódio para gerar a newsletter')).toBeInTheDocument()
  })

  it('atualiza URL com view=newsletter&selected ao selecionar vídeo', async () => {
    const user = userEvent.setup()
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode', title: 'Episode 1' }))

    render(<NewsletterLayout />)

    await user.click(screen.getByRole('option'))
    expect(mockPush).toHaveBeenCalledWith('/videos?view=newsletter&selected=ep-1')
  })

  it('renderiza NewsletterWorkPanel quando vídeo selecionado', async () => {
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode', title: 'Episode 1' }))
    mockSearchParams.set('selected', 'ep-1')

    render(<NewsletterLayout />)

    // Work panel fetches newsletter status on mount — wait for loading to finish
    await waitFor(() => {
      expect(screen.getByTestId('newsletter-work-panel')).toBeInTheDocument()
    })

    expect(screen.queryByText('Selecione um episódio para gerar a newsletter')).not.toBeInTheDocument()
  })

  it('chama useVideos com statusFilter all e typeFilter episode', () => {
    render(<NewsletterLayout />)

    expect(mockUseVideos).toHaveBeenCalledWith({ statusFilter: 'all', typeFilter: 'episode' })
  })

  it('usa variant newsletter no VideoListPanel (sem tabs de tipo)', () => {
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode' }))

    render(<NewsletterLayout />)

    expect(screen.queryByRole('tab', { name: 'Todos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Episódios' })).not.toBeInTheDocument()
  })

  it('oculta toggle "Só novos" no variant newsletter', () => {
    mockVideos.push(createMockVideo({ id: 'ep-1', videoType: 'episode' }))

    render(<NewsletterLayout />)

    expect(screen.queryByLabelText('Só novos')).not.toBeInTheDocument()
  })
})
