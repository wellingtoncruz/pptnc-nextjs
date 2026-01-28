import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { VideoSummary } from '@/types/video'

import { VideoListPanel } from './video-list-panel'

const createMockVideo = (overrides: Partial<VideoSummary> = {}): VideoSummary => ({
  id: 'video-123',
  title: 'Test Video Title',
  thumbnails: {
    medium: { url: 'https://example.com/thumb.jpg', width: 320, height: 180 },
  },
  duration: 600,
  status: 'new',
  videoType: 'cut',
  // Default to having transcription so video is not blocked
  transcriptionSRT: 'mock-srt',
  transcriptionTXT: 'mock-txt',
  ...overrides,
})

describe('VideoListPanel', () => {
  describe('header', () => {
    it('renderiza o header com título', () => {
      render(<VideoListPanel />)

      expect(screen.getByText('Vídeos')).toBeInTheDocument()
    })

    it('renderiza o botão de sincronização', () => {
      render(<VideoListPanel />)

      expect(screen.getByRole('button', { name: /verificar novos/i })).toBeInTheDocument()
    })

    it('chama onSync quando botão é clicado', async () => {
      const user = userEvent.setup()
      const onSync = vi.fn()

      render(<VideoListPanel onSync={onSync} />)

      const syncButton = screen.getByRole('button', { name: /verificar novos/i })
      await user.click(syncButton)

      expect(onSync).toHaveBeenCalledTimes(1)
    })

    it('desabilita botão e mostra loading durante sync', () => {
      render(<VideoListPanel isSyncing={true} />)

      const syncButton = screen.getByRole('button', { name: /verificando/i })
      expect(syncButton).toBeDisabled()
    })
  })

  describe('empty state', () => {
    it('mostra empty state quando não há vídeos', () => {
      render(<VideoListPanel videos={[]} />)

      expect(screen.getByTestId('video-list-empty')).toBeInTheDocument()
      expect(screen.getByText('Nenhum vídeo encontrado')).toBeInTheDocument()
    })

    it('mostra empty state quando videos é undefined', () => {
      render(<VideoListPanel />)

      expect(screen.getByTestId('video-list-empty')).toBeInTheDocument()
    })
  })

  describe('video list', () => {
    it('renderiza lista de vídeos', () => {
      const videos = [
        createMockVideo({ id: 'video-1', title: 'Video 1' }),
        createMockVideo({ id: 'video-2', title: 'Video 2' }),
      ]
      render(<VideoListPanel videos={videos} />)

      expect(screen.getByText('Video 1')).toBeInTheDocument()
      expect(screen.getByText('Video 2')).toBeInTheDocument()
    })

    it('tem role="listbox" para a11y', () => {
      const videos = [createMockVideo()]
      render(<VideoListPanel videos={videos} />)

      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('renderiza VideoListItem para cada vídeo', () => {
      const videos = [
        createMockVideo({ id: 'video-1' }),
        createMockVideo({ id: 'video-2' }),
      ]
      render(<VideoListPanel videos={videos} />)

      const items = screen.getAllByRole('option')
      expect(items).toHaveLength(2)
    })

    it('marca item selecionado baseado em selectedVideoId', () => {
      const videos = [
        createMockVideo({ id: 'video-1' }),
        createMockVideo({ id: 'video-2' }),
      ]
      render(<VideoListPanel videos={videos} selectedVideoId="video-2" />)

      const items = screen.getAllByRole('option')
      expect(items[0]).toHaveAttribute('aria-selected', 'false')
      expect(items[1]).toHaveAttribute('aria-selected', 'true')
    })

    it('chama onVideoSelect quando vídeo é clicado', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [createMockVideo({ id: 'video-1' })]
      render(<VideoListPanel videos={videos} onVideoSelect={onVideoSelect} />)

      await user.click(screen.getByRole('option'))

      expect(onVideoSelect).toHaveBeenCalledWith('video-1')
    })
  })

  describe('loading state', () => {
    it('mostra skeletons quando isLoading é true', () => {
      render(<VideoListPanel isLoading={true} />)

      expect(screen.getByTestId('video-list-loading')).toBeInTheDocument()
    })

    it('não mostra empty state quando isLoading é true', () => {
      render(<VideoListPanel isLoading={true} videos={[]} />)

      expect(screen.queryByTestId('video-list-empty')).not.toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('mostra mensagem de erro quando error é fornecido', () => {
      render(<VideoListPanel error="Falha ao carregar vídeos" />)

      expect(screen.getByText('Falha ao carregar vídeos')).toBeInTheDocument()
    })
  })

  it('renderiza com data-testid correto', () => {
    render(<VideoListPanel />)

    expect(screen.getByTestId('video-list-panel')).toBeInTheDocument()
  })

  describe('keyboard navigation', () => {
    it('seleciona próximo vídeo com ArrowDown', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1' }),
        createMockVideo({ id: 'video-2' }),
        createMockVideo({ id: 'video-3' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-1"
          onVideoSelect={onVideoSelect}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowDown}')

      expect(onVideoSelect).toHaveBeenCalledWith('video-2')
    })

    it('seleciona vídeo anterior com ArrowUp', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1' }),
        createMockVideo({ id: 'video-2' }),
        createMockVideo({ id: 'video-3' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-2"
          onVideoSelect={onVideoSelect}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowUp}')

      expect(onVideoSelect).toHaveBeenCalledWith('video-1')
    })

    it('não navega para cima do primeiro item', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1' }),
        createMockVideo({ id: 'video-2' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-1"
          onVideoSelect={onVideoSelect}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowUp}')

      expect(onVideoSelect).not.toHaveBeenCalled()
    })

    it('não navega para baixo do último item', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1' }),
        createMockVideo({ id: 'video-2' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-2"
          onVideoSelect={onVideoSelect}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowDown}')

      expect(onVideoSelect).not.toHaveBeenCalled()
    })

    it('seleciona primeiro vídeo com ArrowDown quando nenhum está selecionado', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1' }),
        createMockVideo({ id: 'video-2' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId={null}
          onVideoSelect={onVideoSelect}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowDown}')

      expect(onVideoSelect).toHaveBeenCalledWith('video-1')
    })

    it('pula vídeo sent ao navegar com ArrowDown', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'new' }),
        createMockVideo({ id: 'video-2', status: 'sent' }),
        createMockVideo({ id: 'video-3', status: 'draft' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-1"
          onVideoSelect={onVideoSelect}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowDown}')

      // Should skip video-2 (sent) and select video-3
      expect(onVideoSelect).toHaveBeenCalledWith('video-3')
    })

    it('pula vídeo sent ao navegar com ArrowUp', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'new' }),
        createMockVideo({ id: 'video-2', status: 'sent' }),
        createMockVideo({ id: 'video-3', status: 'draft' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-3"
          onVideoSelect={onVideoSelect}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowUp}')

      // Should skip video-2 (sent) and select video-1
      expect(onVideoSelect).toHaveBeenCalledWith('video-1')
    })

    it('não navega quando todos os vídeos abaixo são sent', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'new' }),
        createMockVideo({ id: 'video-2', status: 'sent' }),
        createMockVideo({ id: 'video-3', status: 'sent' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-1"
          onVideoSelect={onVideoSelect}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowDown}')

      // Should not select any video since all below are sent
      expect(onVideoSelect).not.toHaveBeenCalled()
    })

    it('seleciona primeiro vídeo não-sent com ArrowDown quando nenhum selecionado', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'sent' }),
        createMockVideo({ id: 'video-2', status: 'new' }),
        createMockVideo({ id: 'video-3', status: 'draft' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId={null}
          onVideoSelect={onVideoSelect}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowDown}')

      // Should skip video-1 (sent) and select video-2
      expect(onVideoSelect).toHaveBeenCalledWith('video-2')
    })
  })
})
