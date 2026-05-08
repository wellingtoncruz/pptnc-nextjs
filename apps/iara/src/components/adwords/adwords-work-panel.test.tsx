import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { VideoSummary } from '@/types/video'

import { AdwordsWorkPanel } from './adwords-work-panel'

// Mock useAdwords hook
const mockRetry = vi.fn()
const mockReprocess = vi.fn().mockResolvedValue(undefined)
const mockUseAdwords = vi.fn(() => ({
  data: null,
  isLoading: false,
  isGenerating: false,
  error: null,
  retry: mockRetry,
  reprocess: mockReprocess,
}))
vi.mock('@/hooks/use-adwords', () => ({
  useAdwords: (...args: unknown[]) => mockUseAdwords(...args),
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
  description: 'Test description',
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

describe('AdwordsWorkPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('chama useAdwords com videoId e hasPrerequisites corretos', () => {
    const video = createMockVideo()

    render(<AdwordsWorkPanel videoId="video-123" video={video} />)

    expect(mockUseAdwords).toHaveBeenCalledWith('video-123', true)
  })

  it('calcula hasPrerequisites como false quando falta título', () => {
    const video = createMockVideo({ title: '' })

    render(<AdwordsWorkPanel videoId="video-123" video={video} />)

    expect(mockUseAdwords).toHaveBeenCalledWith('video-123', false)
  })

  it('calcula hasPrerequisites como false quando falta descrição', () => {
    const video = createMockVideo({ description: undefined })

    render(<AdwordsWorkPanel videoId="video-123" video={video} />)

    expect(mockUseAdwords).toHaveBeenCalledWith('video-123', false)
  })

  it('calcula hasPrerequisites como false quando falta transcrição', () => {
    const video = createMockVideo({ transcriptionTXT: undefined })

    render(<AdwordsWorkPanel videoId="video-123" video={video} />)

    expect(mockUseAdwords).toHaveBeenCalledWith('video-123', false)
  })

  it('exibe spinner de loading quando isLoading', () => {
    mockUseAdwords.mockReturnValueOnce({
      data: null,
      isLoading: true,
      isGenerating: false,
      error: null,
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    expect(screen.getByTestId('adwords-loading')).toBeInTheDocument()
  })

  it('exibe spinner de generating com texto', () => {
    mockUseAdwords.mockReturnValueOnce({
      data: null,
      isLoading: false,
      isGenerating: true,
      error: null,
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    expect(screen.getByText('Gerando guia de tráfego pago...')).toBeInTheDocument()
  })

  it('exibe mensagem de inelegível quando error é "ineligible"', () => {
    mockUseAdwords.mockReturnValueOnce({
      data: null,
      isLoading: false,
      isGenerating: false,
      error: 'ineligible',
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    expect(screen.getByText(/título, descrição e transcrição/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument()
  })

  it('exibe mensagem de erro com botão "Tentar novamente"', () => {
    mockUseAdwords.mockReturnValueOnce({
      data: null,
      isLoading: false,
      isGenerating: false,
      error: 'Rate limit exceeded',
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument()
  })

  it('chama retry ao clicar "Tentar novamente"', async () => {
    const user = userEvent.setup()
    mockUseAdwords.mockReturnValue({
      data: null,
      isLoading: false,
      isGenerating: false,
      error: 'Erro',
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    await user.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(mockRetry).toHaveBeenCalledTimes(1)
  })

  it('renderiza guia e keywords quando data existe', () => {
    mockUseAdwords.mockReturnValueOnce({
      data: {
        guide: '# Guia de Tráfego',
        keywords: ['keyword1', 'keyword2'],
        generatedAt: '2026-02-26T00:00:00Z',
      },
      isLoading: false,
      isGenerating: false,
      error: null,
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    expect(screen.getByTestId('adwords-guide-display')).toBeInTheDocument()
    expect(screen.getByText('Keywords')).toBeInTheDocument()
    expect(screen.getByText('keyword1')).toBeInTheDocument()
    expect(screen.getByText('keyword2')).toBeInTheDocument()
  })

  it('exibe botão "Reprocessar" quando data existe', () => {
    mockUseAdwords.mockReturnValueOnce({
      data: {
        guide: 'Guia',
        keywords: ['kw'],
        generatedAt: '2026-02-26T00:00:00Z',
      },
      isLoading: false,
      isGenerating: false,
      error: null,
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    expect(screen.getByRole('button', { name: /reprocessar/i })).toBeInTheDocument()
  })

  it('toggle reprocessar: mostra textarea ao clicar', async () => {
    const user = userEvent.setup()
    mockUseAdwords.mockReturnValue({
      data: {
        guide: 'Guia',
        keywords: ['kw'],
        generatedAt: '2026-02-26T00:00:00Z',
      },
      isLoading: false,
      isGenerating: false,
      error: null,
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    await user.click(screen.getByRole('button', { name: /reprocessar/i }))

    expect(screen.getByPlaceholderText(/contexto adicional/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /gerar novamente/i })).toBeInTheDocument()
  })

  it('reprocessar: chama reprocess com additionalContext', async () => {
    const user = userEvent.setup()
    mockUseAdwords.mockReturnValue({
      data: {
        guide: 'Guia',
        keywords: ['kw'],
        generatedAt: '2026-02-26T00:00:00Z',
      },
      isLoading: false,
      isGenerating: false,
      error: null,
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    await user.click(screen.getByRole('button', { name: /reprocessar/i }))
    await user.type(screen.getByPlaceholderText(/contexto adicional/i), 'Foque no convidado')
    await user.click(screen.getByRole('button', { name: /gerar novamente/i }))

    expect(mockReprocess).toHaveBeenCalledWith('Foque no convidado')
  })

  it('exibe erro inline quando reprocess falha', async () => {
    const user = userEvent.setup()
    mockReprocess.mockRejectedValueOnce(new Error('Erro de reprocessamento'))
    mockUseAdwords.mockReturnValue({
      data: {
        guide: 'Guia',
        keywords: ['kw'],
        generatedAt: '2026-02-26T00:00:00Z',
      },
      isLoading: false,
      isGenerating: false,
      error: null,
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    await user.click(screen.getByRole('button', { name: /reprocessar/i }))
    await user.type(screen.getByPlaceholderText(/contexto adicional/i), 'contexto')
    await user.click(screen.getByRole('button', { name: /gerar novamente/i }))

    // Erro exibido inline perto do formulário
    expect(screen.getByText('Erro de reprocessamento')).toBeInTheDocument()
    // Textarea ainda visível (não fechou)
    expect(screen.getByPlaceholderText(/contexto adicional/i)).toBeInTheDocument()
  })

  it('textarea additionalContext tem max 500 caracteres', async () => {
    const user = userEvent.setup()
    mockUseAdwords.mockReturnValue({
      data: {
        guide: 'Guia',
        keywords: ['kw'],
        generatedAt: '2026-02-26T00:00:00Z',
      },
      isLoading: false,
      isGenerating: false,
      error: null,
      retry: mockRetry,
      reprocess: mockReprocess,
    })

    render(<AdwordsWorkPanel videoId="video-123" video={createMockVideo()} />)

    await user.click(screen.getByRole('button', { name: /reprocessar/i }))

    const textarea = screen.getByPlaceholderText(/contexto adicional/i)
    expect(textarea).toHaveAttribute('maxLength', '500')
  })
})
