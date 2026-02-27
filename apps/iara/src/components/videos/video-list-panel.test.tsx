import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { VideoSummary } from '@/types/video'

import { VideoListPanel } from './video-list-panel'

// Mock do contexto de processamento LLM
vi.mock('@/contexts', () => ({
  useLLMProcessing: () => ({
    isProcessing: false,
    startProcessing: vi.fn(),
    stopProcessing: vi.fn(),
  }),
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

    it('renderiza o botão de sincronização quando onSync é fornecido', () => {
      render(<VideoListPanel onSync={vi.fn()} />)

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
      render(<VideoListPanel onSync={vi.fn()} isSyncing={true} />)

      const syncButton = screen.getByRole('button', { name: /verificando/i })
      expect(syncButton).toBeDisabled()
    })

    it('oculta botão sync quando onSync não é fornecido', () => {
      render(<VideoListPanel />)

      expect(screen.queryByRole('button', { name: /verificar novos/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /verificando/i })).not.toBeInTheDocument()
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

    it('mostra dica de sync no empty state quando onSync é fornecido', () => {
      render(<VideoListPanel videos={[]} onSync={vi.fn()} />)

      expect(screen.getByText('Nenhum vídeo encontrado')).toBeInTheDocument()
      expect(screen.getByText(/buscar vídeos do seu canal/)).toBeInTheDocument()
    })

    it('oculta dica de sync no empty state quando onSync não é fornecido', () => {
      render(<VideoListPanel videos={[]} />)

      expect(screen.getByText('Nenhum vídeo encontrado')).toBeInTheDocument()
      expect(screen.queryByText(/buscar vídeos do seu canal/)).not.toBeInTheDocument()
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

    it('abre reopen dialog ao navegar para vídeo sent com ArrowDown (Story 11-2)', async () => {
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

      // Sent videos open reopen dialog instead of selecting
      expect(onVideoSelect).not.toHaveBeenCalled()
      expect(screen.getByText('Deseja reabrir esse vídeo para edição dos metadados?')).toBeInTheDocument()
    })

    it('abre reopen dialog ao navegar para vídeo sent com ArrowUp (Story 11-2)', async () => {
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

      // Sent videos open reopen dialog instead of selecting
      expect(onVideoSelect).not.toHaveBeenCalled()
      expect(screen.getByText('Deseja reabrir esse vídeo para edição dos metadados?')).toBeInTheDocument()
    })

    it('abre reopen dialog ao navegar quando vídeos abaixo são sent (Story 11-2)', async () => {
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

      // Sent videos open reopen dialog
      expect(onVideoSelect).not.toHaveBeenCalled()
      expect(screen.getByText('Deseja reabrir esse vídeo para edição dos metadados?')).toBeInTheDocument()
    })

    it('abre reopen dialog com ArrowDown quando nenhum selecionado e primeiro é sent (Story 11-2)', async () => {
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

      // Sent videos open reopen dialog instead of selecting
      expect(onVideoSelect).not.toHaveBeenCalled()
      expect(screen.getByText('Deseja reabrir esse vídeo para edição dos metadados?')).toBeInTheDocument()
    })
  })

  describe('variant social (Story 14.13)', () => {
    it('oculta toggle "Só novos" quando variant=social', () => {
      const videos = [createMockVideo()]
      render(<VideoListPanel videos={videos} variant="social" />)

      expect(screen.queryByLabelText('Só novos')).not.toBeInTheDocument()
    })

    it('renderiza toggle "Só novos" quando variant=editorial (default)', () => {
      const videos = [createMockVideo()]
      render(<VideoListPanel videos={videos} />)

      expect(screen.getByLabelText('Só novos')).toBeInTheDocument()
    })

    it('não renderiza ReopenVideoDialog quando variant=social', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'sent' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId={null}
          onVideoSelect={onVideoSelect}
          variant="social"
        />
      )

      // Click on sent video — should call onVideoSelect directly
      await user.click(screen.getByRole('option'))
      expect(onVideoSelect).toHaveBeenCalledWith('video-1')
      // No reopen dialog should appear
      expect(screen.queryByText('Deseja reabrir esse vídeo para edição dos metadados?')).not.toBeInTheDocument()
    })

    it('seleciona vídeo sent diretamente via ArrowDown quando variant=social', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'new' }),
        createMockVideo({ id: 'video-2', status: 'sent' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-1"
          onVideoSelect={onVideoSelect}
          variant="social"
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowDown}')

      expect(onVideoSelect).toHaveBeenCalledWith('video-2')
    })

    it('seleciona vídeo sent diretamente via ArrowUp quando variant=social', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'sent' }),
        createMockVideo({ id: 'video-2', status: 'new' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-2"
          onVideoSelect={onVideoSelect}
          variant="social"
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowUp}')

      expect(onVideoSelect).toHaveBeenCalledWith('video-1')
    })
  })

  describe('variant adwords (Story 15.6)', () => {
    it('oculta toggle "Só novos" quando variant=adwords', () => {
      const videos = [createMockVideo()]
      render(<VideoListPanel videos={videos} variant="adwords" />)

      expect(screen.queryByLabelText('Só novos')).not.toBeInTheDocument()
    })

    it('oculta tabs de filtro de tipo quando variant=adwords', () => {
      const videos = [createMockVideo()]
      render(<VideoListPanel videos={videos} variant="adwords" />)

      expect(screen.queryByRole('tab', { name: 'Todos' })).not.toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Episódios' })).not.toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Cortes' })).not.toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Reels' })).not.toBeInTheDocument()
    })

    it('não renderiza ReopenVideoDialog quando variant=adwords', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'sent' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId={null}
          onVideoSelect={onVideoSelect}
          variant="adwords"
        />
      )

      // Click on sent video — should call onVideoSelect directly
      await user.click(screen.getByRole('option'))
      expect(onVideoSelect).toHaveBeenCalledWith('video-1')
      // No reopen dialog should appear
      expect(screen.queryByText('Deseja reabrir esse vídeo para edição dos metadados?')).not.toBeInTheDocument()
    })

    it('seleciona vídeo sent diretamente via ArrowDown quando variant=adwords', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'new' }),
        createMockVideo({ id: 'video-2', status: 'sent' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-1"
          onVideoSelect={onVideoSelect}
          variant="adwords"
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowDown}')

      expect(onVideoSelect).toHaveBeenCalledWith('video-2')
    })

    it('seleciona vídeo sent diretamente via ArrowUp quando variant=adwords', async () => {
      const user = userEvent.setup()
      const onVideoSelect = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1', status: 'sent' }),
        createMockVideo({ id: 'video-2', status: 'new' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-2"
          onVideoSelect={onVideoSelect}
          variant="adwords"
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{ArrowUp}')

      expect(onVideoSelect).toHaveBeenCalledWith('video-1')
    })

    it('usa sentAppearance highlighted quando variant=adwords (sent sem opacity)', () => {
      const videos = [
        createMockVideo({ id: 'video-1', status: 'sent' }),
        createMockVideo({ id: 'video-2', status: 'new' }),
      ]
      render(<VideoListPanel videos={videos} variant="adwords" />)

      const options = screen.getAllByRole('option')
      // Sent video should NOT have opacity-60 (highlighted = sent is prominent)
      expect(options[0]).not.toHaveClass('opacity-60')
      // Non-sent video should have opacity-60 (highlighted inverts dimming)
      expect(options[1]).toHaveClass('opacity-60')
    })
  })

  describe('Enter key (onEnterDetail)', () => {
    it('chama onEnterDetail com Enter quando vídeo está selecionado', async () => {
      const user = userEvent.setup()
      const onEnterDetail = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1' }),
        createMockVideo({ id: 'video-2' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId="video-1"
          onVideoSelect={vi.fn()}
          onEnterDetail={onEnterDetail}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{Enter}')

      expect(onEnterDetail).toHaveBeenCalledTimes(1)
    })

    it('não chama onEnterDetail com Enter quando nenhum vídeo está selecionado', async () => {
      const user = userEvent.setup()
      const onEnterDetail = vi.fn()
      const videos = [
        createMockVideo({ id: 'video-1' }),
      ]
      render(
        <VideoListPanel
          videos={videos}
          selectedVideoId={null}
          onVideoSelect={vi.fn()}
          onEnterDetail={onEnterDetail}
        />
      )

      const listbox = screen.getByRole('listbox')
      listbox.focus()
      await user.keyboard('{Enter}')

      expect(onEnterDetail).not.toHaveBeenCalled()
    })
  })

  describe('excludeTypes', () => {
    it('oculta tabs dos tipos excluídos', () => {
      const videos = [createMockVideo()]
      render(<VideoListPanel videos={videos} excludeTypes={['episode']} />)

      expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Cortes' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Reels' })).toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Episódios' })).not.toBeInTheDocument()
    })

    it('renderiza todas as tabs quando excludeTypes não é fornecido', () => {
      const videos = [createMockVideo()]
      render(<VideoListPanel videos={videos} />)

      expect(screen.getByRole('tab', { name: 'Episódios' })).toBeInTheDocument()
    })
  })
})
