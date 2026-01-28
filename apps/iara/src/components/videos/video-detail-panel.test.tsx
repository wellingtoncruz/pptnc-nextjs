import { render, screen } from '@/test-utils'
import { vi } from 'vitest'

import { VideoDetailPanel } from './video-detail-panel'

// Mock the WizardOrchestrator since it has complex dependencies
vi.mock('@/components/wizard', () => ({
  WizardOrchestrator: ({ video }: { video: { title: string } }) => (
    <div data-testid="wizard-orchestrator">Wizard: {video.title}</div>
  ),
}))

const mockVideo = {
  id: 'test-video-123',
  title: 'Test Episode',
  description: 'Test description',
  duration: 3600,
  status: 'new' as const,
  videoType: 'episode' as const,
}

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

  it('mostra estado de carregamento quando videoId existe mas video não', () => {
    render(<VideoDetailPanel videoId="abc123" />)

    expect(screen.getByText('Carregando vídeo...')).toBeInTheDocument()
  })

  it('renderiza wizard quando video está disponível', () => {
    render(<VideoDetailPanel videoId="test-video-123" video={mockVideo} />)

    expect(screen.getByTestId('wizard-orchestrator')).toBeInTheDocument()
    expect(screen.getByText('Wizard: Test Episode')).toBeInTheDocument()
  })

  it('renderiza com data-testid correto no empty state', () => {
    render(<VideoDetailPanel />)

    expect(screen.getByTestId('video-detail-panel')).toBeInTheDocument()
  })

  it('renderiza com data-testid quando wizard está ativo', () => {
    render(<VideoDetailPanel videoId="test-id" video={mockVideo} />)

    expect(screen.getByTestId('video-detail-panel')).toBeInTheDocument()
  })
})
