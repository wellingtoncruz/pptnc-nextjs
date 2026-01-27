import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { VideoSummary } from '@/types/video'

import { VideoListItem } from './video-list-item'

const createMockVideo = (overrides: Partial<VideoSummary> = {}): VideoSummary => ({
  id: 'video-123',
  title: 'Test Video Title',
  thumbnails: {
    medium: { url: 'https://example.com/thumb.jpg', width: 320, height: 180 },
  },
  duration: 600,
  status: 'new',
  videoType: 'cut',
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

    it('renderiza placeholder quando não há thumbnail', () => {
      const video = createMockVideo({ thumbnails: undefined })
      render(<VideoListItem video={video} isSelected={false} onSelect={vi.fn()} />)

      // Should have a placeholder icon
      expect(screen.getByTestId('thumbnail-placeholder')).toBeInTheDocument()
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
})
