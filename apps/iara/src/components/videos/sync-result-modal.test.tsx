import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { SyncResultModal, type SyncResultData } from './sync-result-modal'

const createMockResult = (overrides: Partial<SyncResultData> = {}): SyncResultData => ({
  newVideos: 0,
  reopenedVideos: 0,
  transcriptionsFetched: 0,
  transcriptionsUnavailable: 0,
  ...overrides,
})

describe('SyncResultModal', () => {
  describe('rendering', () => {
    it('não renderiza quando isOpen é false', () => {
      render(
        <SyncResultModal
          isOpen={false}
          onClose={vi.fn()}
          result={createMockResult({ newVideos: 5 })}
        />
      )

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renderiza modal quando isOpen é true', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({ newVideos: 1 })}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('success states', () => {
    it('mostra quantidade de novos vídeos (singular)', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({ newVideos: 1 })}
        />
      )

      expect(screen.getByText(/1/)).toBeInTheDocument()
      expect(screen.getByText(/novo vídeo encontrado/i)).toBeInTheDocument()
    })

    it('mostra quantidade de novos vídeos (plural)', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({ newVideos: 5 })}
        />
      )

      expect(screen.getByText(/5/)).toBeInTheDocument()
      expect(screen.getByText(/novos vídeos encontrados/i)).toBeInTheDocument()
    })

    it('mostra quantidade de vídeos reabertos (singular)', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({ reopenedVideos: 1 })}
        />
      )

      expect(screen.getByText(/1/)).toBeInTheDocument()
      expect(screen.getByText(/vídeo voltou/i)).toBeInTheDocument()
    })

    it('mostra quantidade de vídeos reabertos (plural)', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({ reopenedVideos: 3 })}
        />
      )

      expect(screen.getByText(/3/)).toBeInTheDocument()
      expect(screen.getByText(/vídeos voltaram/i)).toBeInTheDocument()
    })

    it('mostra mensagem quando nenhum vídeo foi encontrado', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({ newVideos: 0, reopenedVideos: 0 })}
        />
      )

      expect(screen.getByText(/nenhum vídeo novo foi encontrado no canal/i)).toBeInTheDocument()
    })

    it('mostra informação de transcrições baixadas', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({ newVideos: 2, transcriptionsFetched: 2 })}
        />
      )

      expect(screen.getByText(/2 transcrições baixadas/i)).toBeInTheDocument()
    })

    it('mostra aviso de vídeos aguardando transcrição', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({ newVideos: 3, transcriptionsUnavailable: 2 })}
        />
      )

      expect(screen.getByText(/2 vídeos aguardando transcrição/i)).toBeInTheDocument()
    })
  })

  describe('quota error', () => {
    it('mostra mensagem de erro de quota', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({
            newVideos: 1,
            quotaError: 'Limite de requisições excedido.',
          })}
        />
      )

      expect(screen.getByText(/limite de requisições excedido/i)).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('mostra mensagem de erro quando sync falha', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          error="Erro ao conectar com YouTube"
        />
      )

      expect(screen.getByText(/erro na sincronização/i)).toBeInTheDocument()
      expect(screen.getByText(/erro ao conectar com youtube/i)).toBeInTheDocument()
    })
  })

  describe('interaction', () => {
    it('chama onClose ao clicar no botão Entendi', async () => {
      const onClose = vi.fn()
      const user = userEvent.setup()

      render(
        <SyncResultModal
          isOpen={true}
          onClose={onClose}
          result={createMockResult({ newVideos: 1 })}
        />
      )

      await user.click(screen.getByRole('button', { name: /entendi/i }))

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
