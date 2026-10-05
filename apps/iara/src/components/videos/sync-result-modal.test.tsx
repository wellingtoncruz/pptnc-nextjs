import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { SyncResultModal, type SyncResultData } from './sync-result-modal'

// Note: transcription fields removed per Story 5.6 (Transcrição On-Demand)
// Note: reopenedVideos removed — sent videos are never reopened by sync
const createMockResult = (overrides: Partial<SyncResultData> = {}): SyncResultData => ({
  newVideos: 0,
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

    it('mostra mensagem quando nenhum vídeo foi encontrado', () => {
      render(
        <SyncResultModal
          isOpen={true}
          onClose={vi.fn()}
          result={createMockResult({ newVideos: 0 })}
        />
      )

      expect(screen.getByText(/nenhum vídeo novo foi encontrado no canal/i)).toBeInTheDocument()
    })

    // Note: Transcription tests removed per Story 5.6 (Transcrição On-Demand)
    // Transcriptions are now fetched on-demand when producer selects a video
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

describe('SyncResultModal — vídeos apagados do YouTube (out/2026)', () => {
  const base: SyncResultData = { newVideos: 0 }

  it('sem o resultado de remoção (flag desligada), nada muda', () => {
    render(<SyncResultModal isOpen onClose={vi.fn()} result={base} />)
    expect(screen.getByText('Nenhum Vídeo Novo')).toBeInTheDocument()
    expect(screen.queryByText(/removid/)).not.toBeInTheDocument()
  })

  it('lista os removidos e conta como sincronização com mudança', () => {
    render(
      <SyncResultModal
        isOpen
        onClose={vi.fn()}
        result={{ ...base, removal: { removed: [{ id: 'g', title: 'Live apagada' }], skipped: [], missingFromPlaylist: 0, pendingWrongAccount: 0 } }}
      />
    )
    expect(screen.getByText('Sincronização Concluída')).toBeInTheDocument()
    expect(screen.getByText(/vídeo removido/)).toBeInTheDocument()
    expect(screen.getByText('Live apagada')).toBeInTheDocument()
  })

  it('mostra os que ficaram por vínculo, com o motivo', () => {
    render(
      <SyncResultModal
        isOpen
        onClose={vi.fn()}
        result={{ ...base, removal: { removed: [], skipped: [{ id: 'e', title: 'Episódio X', reason: 'linked' }], missingFromPlaylist: 0, pendingWrongAccount: 0 } }}
      />
    )
    expect(screen.getByText(/Episódio X — vinculado a outro vídeo/)).toBeInTheDocument()
  })

  it('avisa quando a conta não é a do canal', () => {
    render(
      <SyncResultModal
        isOpen
        onClose={vi.fn()}
        result={{ ...base, removal: { removed: [], skipped: [], missingFromPlaylist: 0, pendingWrongAccount: 2 } }}
      />
    )
    expect(screen.getByText(/2 vídeos não existem mais no YouTube/)).toBeInTheDocument()
    expect(screen.getByText(/não é a do canal/)).toBeInTheDocument()
  })

  it('informa quantos ficaram por a lista do YouTube vir incompleta', () => {
    render(
      <SyncResultModal
        isOpen
        onClose={vi.fn()}
        result={{ newVideos: 0, removal: { removed: [], skipped: [], missingFromPlaylist: 3, pendingWrongAccount: 0 } }}
      />
    )
    expect(screen.getByText(/3 vídeos não vieram na lista do YouTube, mas ainda existem/)).toBeInTheDocument()
  })
})
