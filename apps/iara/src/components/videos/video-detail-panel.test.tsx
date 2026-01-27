import { render, screen } from '@/test-utils'

import { VideoDetailPanel } from './video-detail-panel'

describe('VideoDetailPanel', () => {
  it('mostra empty state quando nenhum vídeo está selecionado', () => {
    render(<VideoDetailPanel />)

    expect(screen.getByText('Selecione um vídeo')).toBeInTheDocument()
  })

  it('mostra empty state com videoId null', () => {
    render(<VideoDetailPanel videoId={null} />)

    expect(screen.getByText('Selecione um vídeo')).toBeInTheDocument()
  })

  it('mostra descrição no empty state', () => {
    render(<VideoDetailPanel />)

    expect(
      screen.getByText(/escolha um vídeo da lista para ver os detalhes/i)
    ).toBeInTheDocument()
  })

  it('mostra detalhes quando videoId é fornecido', () => {
    render(<VideoDetailPanel videoId="abc123" />)

    expect(screen.getByText('Detalhes do Vídeo')).toBeInTheDocument()
    expect(screen.getByText(/vídeo selecionado: abc123/i)).toBeInTheDocument()
  })

  it('renderiza com data-testid correto', () => {
    render(<VideoDetailPanel />)

    expect(screen.getByTestId('video-detail-panel')).toBeInTheDocument()
  })

  it('renderiza com data-testid quando videoId presente', () => {
    render(<VideoDetailPanel videoId="test-id" />)

    expect(screen.getByTestId('video-detail-panel')).toBeInTheDocument()
  })
})
