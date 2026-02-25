import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { VideoSummary } from '@/types/video'

import { VideoListItem } from './video-list-item'

// Mock do contexto de processamento LLM
const mockUseLLMProcessing = vi.fn(() => ({
  isProcessing: false,
  startProcessing: vi.fn(),
  stopProcessing: vi.fn(),
}))

vi.mock('@/contexts', () => ({
  useLLMProcessing: () => mockUseLLMProcessing(),
}))

const createMockVideo = (overrides: Partial<VideoSummary> = {}): VideoSummary => ({
  id: 'video-123',
  title: 'Test Video Title',
  thumbnails: {
    medium: { url: 'https://example.com/thumb.jpg', width: 320, height: 180 },
  },
  duration: 600,
  status: 'new',
  videoType: 'cut',
  // Note: Transcription fields are optional - videos are not blocked for missing transcription
  // Transcription is fetched on-demand when producer selects video (Story 5.6)
  ...overrides,
})

describe('VideoListItem', () => {
  describe('rendering', () => {
    it('renderiza thumbnail com aspect ratio 16:9', () => {
      const video = createMockVideo()
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const img = screen.getByRole('img', { name: video.title })
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src')
    })

    it('renderiza título truncado', () => {
      const video = createMockVideo({ title: 'A very long video title that should be truncated' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      expect(screen.getByText(video.title)).toBeInTheDocument()
    })

    it('renderiza VideoThumbnail com fallback do YouTube quando não há thumbnail customizado', () => {
      const video = createMockVideo({ thumbnails: undefined })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      // VideoThumbnail uses YouTube fallback when no custom thumbnail
      // It will try hqdefault -> default -> "Sem thumbnail"
      // hqdefault is used because it's guaranteed to exist for ALL videos
      const img = screen.getByRole('img', { name: video.title })
      expect(img).toBeInTheDocument()
      // Should start with YouTube hqdefault fallback (guaranteed to exist)
      expect(img).toHaveAttribute('src', expect.stringContaining('hqdefault.jpg'))
    })
  })

  describe('status badges', () => {
    it('renderiza badge de status "novo" com cor gray', () => {
      const video = createMockVideo({ status: 'new' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const badge = screen.getByText('novo')
      expect(badge).toHaveClass('bg-gray-500/20')
    })

    it('renderiza badge de status "processando" com cor blue e animação pulse', () => {
      const video = createMockVideo({ status: 'processing' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const badge = screen.getByText('processando')
      expect(badge).toHaveClass('bg-blue-500/20')
      expect(badge).toHaveClass('animate-pulse')
    })

    it('renderiza badge de status "rascunho" com cor yellow', () => {
      const video = createMockVideo({ status: 'draft' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const badge = screen.getByText('rascunho')
      expect(badge).toHaveClass('bg-yellow-500/20')
    })

    it('renderiza badge de status "pronto" com cor green', () => {
      const video = createMockVideo({ status: 'ready' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const badge = screen.getByText('pronto')
      expect(badge).toHaveClass('bg-green-500/20')
    })

    it('renderiza badge de status "enviando" com cor blue e animação pulse', () => {
      const video = createMockVideo({ status: 'sending' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const badge = screen.getByText('enviando')
      expect(badge).toHaveClass('bg-blue-500/20')
      expect(badge).toHaveClass('animate-pulse')
    })

    it('renderiza badge de status "enviado" com cor green e ícone check', () => {
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const badge = screen.getByText('enviado')
      expect(badge).toHaveClass('bg-green-500/20')
      expect(screen.getByTestId('check-icon')).toBeInTheDocument()
    })
  })

  describe('type badges', () => {
    it('renderiza badge de tipo "episódio" com cor purple', () => {
      const video = createMockVideo({ videoType: 'episode' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const badge = screen.getByText('episódio')
      expect(badge).toHaveClass('bg-purple-500/20')
    })

    it('renderiza badge de tipo "corte" com cor orange', () => {
      const video = createMockVideo({ videoType: 'cut' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const badge = screen.getByText('corte')
      expect(badge).toHaveClass('bg-orange-500/20')
    })

    it('renderiza badge de tipo "reel" com cor pink', () => {
      const video = createMockVideo({ videoType: 'reel' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const badge = screen.getByText('reel')
      expect(badge).toHaveClass('bg-pink-500/20')
    })
  })

  describe('selection', () => {
    it('aplica estilo de seleção quando isSelected é true', () => {
      const video = createMockVideo()
      render(<VideoListItem video={video} isSelected={true} onSelect={vi.fn()} />)

      const item = screen.getByRole('option')
      expect(item).toHaveClass('ring-2')
      expect(item).toHaveClass('ring-blue-400')
      expect(item).toHaveAttribute('aria-selected', 'true')
    })

    it('não aplica estilo de seleção quando isSelected é false', () => {
      const video = createMockVideo()
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const item = screen.getByRole('option')
      expect(item).not.toHaveClass('ring-2')
      expect(item).toHaveAttribute('aria-selected', 'false')
    })

    it('chama onSelect com videoId ao clicar', async () => {
      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo()
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} />)

      await user.click(screen.getByRole('option'))

      expect(onSelect).toHaveBeenCalledWith(video.id)
    })
  })

  describe('accessibility', () => {
    it('tem role="option" para a11y', () => {
      const video = createMockVideo()
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      expect(screen.getByRole('option')).toBeInTheDocument()
    })

    it('suporta navegação por teclado (Enter)', async () => {
      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo()
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} />)

      const item = screen.getByRole('option')
      item.focus()
      await user.keyboard('{Enter}')

      expect(onSelect).toHaveBeenCalledWith(video.id)
    })

    it('suporta navegação por teclado (Space)', async () => {
      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo()
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} />)

      const item = screen.getByRole('option')
      item.focus()
      await user.keyboard(' ')

      expect(onSelect).toHaveBeenCalledWith(video.id)
    })
  })

  describe('sent videos behavior (Story 11-2)', () => {
    it('renderiza vídeo sent com opacidade reduzida', () => {
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const item = screen.getByRole('option')
      expect(item).toHaveClass('opacity-60')
    })

    it('renderiza vídeo sent como clicável (cursor-pointer)', () => {
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const item = screen.getByRole('option')
      expect(item).toHaveClass('cursor-pointer')
      expect(item).not.toHaveClass('cursor-not-allowed')
    })

    it('chama onSelect ao clicar em vídeo sent quando onReopenRequest não é fornecido', async () => {
      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} />)

      await user.click(screen.getByRole('option'))

      expect(onSelect).toHaveBeenCalledWith(video.id)
    })

    it('chama onReopenRequest ao clicar em vídeo sent', async () => {
      const onSelect = vi.fn()
      const onReopenRequest = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo({ status: 'sent' })
      render(
        <VideoListItem video={video} isSelected={false} onSelect={onSelect} onReopenRequest={onReopenRequest} />
      )

      await user.click(screen.getByRole('option'))

      expect(onReopenRequest).toHaveBeenCalledWith(video.id)
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('chama onReopenRequest ao pressionar Enter em vídeo sent', async () => {
      const onSelect = vi.fn()
      const onReopenRequest = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo({ status: 'sent' })
      render(
        <VideoListItem video={video} isSelected={false} onSelect={onSelect} onReopenRequest={onReopenRequest} />
      )

      const item = screen.getByRole('option')
      item.focus()
      await user.keyboard('{Enter}')

      expect(onReopenRequest).toHaveBeenCalledWith(video.id)
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('chama onSelect ao pressionar Enter em vídeo sent quando onReopenRequest não é fornecido', async () => {
      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} />)

      const item = screen.getByRole('option')
      item.focus()
      await user.keyboard('{Enter}')

      expect(onSelect).toHaveBeenCalledWith(video.id)
    })

    it('tem tabIndex=0 para vídeo sent (interativo)', () => {
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      const item = screen.getByRole('option')
      expect(item).toHaveAttribute('tabIndex', '0')
    })

    it('não aplica ring de seleção em vídeo sent mesmo se isSelected=true', () => {
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={true} onSelect={vi.fn()} />)

      const item = screen.getByRole('option')
      expect(item).not.toHaveClass('ring-2')
      expect(item).not.toHaveClass('ring-blue-400')
    })
  })

  describe('transcription on-demand behavior (Story 5.6)', () => {
    it('não bloqueia vídeo sem transcrição - transcrição é carregada sob demanda', async () => {
      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo({
        status: 'new',
        transcriptionSRT: undefined,
        transcriptionTXT: undefined,
      })
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} />)

      // Video without transcription should be selectable
      const item = screen.getByRole('option')
      expect(item).not.toHaveClass('opacity-50')
      expect(item).not.toHaveClass('cursor-not-allowed')

      await user.click(item)
      expect(onSelect).toHaveBeenCalledWith(video.id)
    })

    it('não bloqueia vídeo draft sem transcrição', async () => {
      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo({
        status: 'draft',
        transcriptionSRT: undefined,
        transcriptionTXT: undefined,
      })
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} />)

      await user.click(screen.getByRole('option'))
      expect(onSelect).toHaveBeenCalledWith(video.id)
    })
  })

  describe('sentAppearance highlighted (Story 14.13)', () => {
    it('aplica opacity-60 em vídeo NÃO-sent quando sentAppearance=highlighted', () => {
      const video = createMockVideo({ status: 'draft' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} sentAppearance="highlighted" />)

      const item = screen.getByRole('option')
      expect(item).toHaveClass('opacity-60')
    })

    it('não aplica opacity-60 em vídeo sent quando sentAppearance=highlighted', () => {
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} sentAppearance="highlighted" />)

      const item = screen.getByRole('option')
      expect(item).not.toHaveClass('opacity-60')
    })

    it('aplica ring de seleção em vídeo sent selecionado quando sentAppearance=highlighted', () => {
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={true} onSelect={vi.fn()} sentAppearance="highlighted" />)

      const item = screen.getByRole('option')
      expect(item).toHaveClass('ring-2')
      expect(item).toHaveClass('ring-blue-400')
    })

    it('chama onSelect diretamente ao clicar em vídeo sent sem onReopenRequest', async () => {
      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} sentAppearance="highlighted" />)

      await user.click(screen.getByRole('option'))

      expect(onSelect).toHaveBeenCalledWith(video.id)
    })

    it('chama onSelect diretamente ao pressionar Enter em vídeo sent sem onReopenRequest', async () => {
      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo({ status: 'sent' })
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} sentAppearance="highlighted" />)

      const item = screen.getByRole('option')
      item.focus()
      await user.keyboard('{Enter}')

      expect(onSelect).toHaveBeenCalledWith(video.id)
    })
  })

  describe('bloqueio durante processamento LLM', () => {
    it('bloqueia seleção quando LLM está processando e vídeo não está selecionado', async () => {
      // Override mock para simular processamento
      vi.mocked(await import('@/contexts')).useLLMProcessing = () => ({
        isProcessing: true,
        startProcessing: vi.fn(),
        stopProcessing: vi.fn(),
      })

      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo()
      render(<VideoListItem video={video} isSelected={false} onSelect={onSelect} />)

      await user.click(screen.getByRole('option'))
      expect(onSelect).not.toHaveBeenCalled()

      const item = screen.getByRole('option')
      expect(item).toHaveClass('cursor-wait')
      expect(item).toHaveClass('opacity-70')
    })

    it('permite interação no vídeo já selecionado durante processamento', async () => {
      vi.mocked(await import('@/contexts')).useLLMProcessing = () => ({
        isProcessing: true,
        startProcessing: vi.fn(),
        stopProcessing: vi.fn(),
      })

      const onSelect = vi.fn()
      const user = userEvent.setup()
      const video = createMockVideo()
      // Vídeo já está selecionado
      render(<VideoListItem video={video} isSelected={true} onSelect={onSelect} />)

      await user.click(screen.getByRole('option'))
      // Pode clicar no vídeo atual (para não bloquear o wizard)
      expect(onSelect).toHaveBeenCalledWith(video.id)
    })
  })
})
