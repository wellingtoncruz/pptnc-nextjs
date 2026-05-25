'use client'

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test-utils'

import { WizardLayout } from './wizard-layout'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { WizardState } from '@/lib/wizard'

// Mock video data
const mockVideo: Video = {
  id: 'test-video-123',
  podcastId: 'test-podcast',
  title: 'Entrevista Incrível com Especialista em IA',
  description: 'Uma conversa fascinante sobre inteligência artificial',
  thumbnail: 'https://example.com/thumb.jpg',
  duration: 3665, // 1h 1m 5s
  publishedAt: '2024-01-15T10:30:00Z',
  status: 'processing',
  videoType: 'episode',
  transcriptionTXT: 'Test transcript',
  transcriptionSRT: '00:00:00,000 --> 00:00:05,000\nTest',
  createdAt: { toDate: () => new Date('2024-01-10T10:00:00Z') } as never,
  updatedAt: { toDate: () => new Date('2024-01-20T14:30:00Z') } as never,
}

// Create mock wizard state
function createMockWizardState(
  currentPhase: WizardState['currentPhase'] = 'critique'
): WizardState {
  return {
    videoId: 'test-video-123',
    videoType: 'episode',
    currentPhase,
    phases: {
      critique: { status: 'pending', data: null, error: null },
      'edit-check': { status: 'pending', data: null, error: null },
      risk: { status: 'pending', data: null, error: null },
      chapters: { status: 'pending', data: null, error: null },
      title: { status: 'pending', data: null, error: null },
      description: { status: 'pending', data: null, error: null },
      tags: { status: 'pending', data: null, error: null },
      publish: { status: 'pending', data: null, error: null },
    },
  }
}

// Create mock wizard
function createMockWizard(overrides: Partial<UseWizardReturn> = {}): UseWizardReturn {
  return {
    state: createMockWizardState(),
    currentPhase: 'critique',
    phases: {
      critique: { status: 'pending', data: null, error: null },
      'edit-check': { status: 'pending', data: null, error: null },
      risk: { status: 'pending', data: null, error: null },
      chapters: { status: 'pending', data: null, error: null },
      title: { status: 'pending', data: null, error: null },
      description: { status: 'pending', data: null, error: null },
      tags: { status: 'pending', data: null, error: null },
      publish: { status: 'pending', data: null, error: null },
    },
    consoleMessages: [],
    setPhaseStatus: vi.fn(),
    setPhaseLoading: vi.fn(),
    setPhaseError: vi.fn(),
    setPhaseData: vi.fn(),
    goToPhase: vi.fn(),
    canNavigateToPhase: vi.fn().mockReturnValue(false),
    completePhaseAndAdvance: vi.fn(),
    addSpinner: vi.fn(() => 'spinner-1'),
    removeSpinner: vi.fn(),
    addAlert: vi.fn(),
    removeAlert: vi.fn(),
    reset: vi.fn(),
    invalidateFromPhase: vi.fn(),
    ...overrides,
  } as unknown as UseWizardReturn
}

describe('WizardLayout Integration Tests', () => {
  describe('AC1 & AC2: VideoHeader displays video information', () => {
    it('displays video title in header', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.getByText('Entrevista Incrível com Especialista em IA')).toBeInTheDocument()
    })

    it('displays video duration in metadata below player', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      // Duration should be formatted as HH:MM:SS (01:01:05 for 3665 seconds)
      expect(screen.getByText('01:01:05')).toBeInTheDocument()
    })

    it('displays video with zero duration shows no duration', () => {
      const wizard = createMockWizard()
      const videoNoDuration = { ...mockVideo, duration: 0 }
      render(
        <WizardLayout
          wizard={wizard}
          video={videoNoDuration}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      // Should NOT show "0s" or similar - duration should be hidden when zero
      expect(screen.queryByText(/0s/i)).not.toBeInTheDocument()
    })

    it('displays created date when available', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      // Date should be formatted in pt-BR locale with "Criado em"
      expect(screen.getByText(/criado em/i)).toBeInTheDocument()
    })

    it('displays last updated time', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      // Should show "Atualizado" with the date
      expect(screen.getByText(/atualizado/i)).toBeInTheDocument()
    })
  })

  describe('AC3: ProcessingSpinner in phase components', () => {
    it('renders interactive panel content', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div data-testid="test-spinner">Processing...</div>}
        />
      )

      expect(screen.getByTestId('test-spinner')).toBeInTheDocument()
    })
  })

  describe('AC5: Console area with collapsible alerts', () => {
    it('displays console messages', () => {
      const consoleMessages = [
        {
          id: 'alert-1',
          phase: 'critique' as const,
          type: 'alert' as const,
          timestamp: new Date(),
          alertTitle: 'Crítica concluída',
          alertText: 'Detalhes da crítica aqui',
          alertSeverity: 'success' as const,
        },
      ]
      const wizard = createMockWizard({ consoleMessages })
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.getByText('Crítica concluída')).toBeInTheDocument()
    })

    it('shows spinner messages in console', () => {
      const consoleMessages = [
        {
          id: 'spinner-1',
          phase: 'edit-check' as const,
          type: 'spinner' as const,
          timestamp: new Date(),
          spinnerText: 'Analisando edição do vídeo...',
        },
      ]
      const wizard = createMockWizard({ consoleMessages })
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.getByText('Analisando edição do vídeo...')).toBeInTheDocument()
    })

    it('allows clicking on alert to toggle collapse', () => {
      const consoleMessages = [
        {
          id: 'alert-1',
          phase: 'critique' as const,
          type: 'alert' as const,
          timestamp: new Date(),
          alertTitle: 'Alerta com texto',
          alertText: 'Este é o texto detalhado do alerta',
          alertSeverity: 'info' as const,
        },
      ]
      const wizard = createMockWizard({ consoleMessages })
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      // Alert text should be visible initially
      expect(screen.getByText('Este é o texto detalhado do alerta')).toBeInTheDocument()

      // Click on the collapse button to toggle
      const collapseButton = screen.getByRole('button', { name: /colapsar/i })
      fireEvent.click(collapseButton)

      // After collapse, text should be hidden
      expect(screen.queryByText('Este é o texto detalhado do alerta')).not.toBeInTheDocument()
    })

    it('shows empty state when no messages', () => {
      const wizard = createMockWizard({ consoleMessages: [] })
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.getByText(/mensagens de processamento aparecerão aqui/i)).toBeInTheDocument()
    })
  })

  describe('Story 4.3: VideoShortTitle integration', () => {
    it('shows short title badge for cut videos with shortTitle', () => {
      const wizard = createMockWizard()
      const cutVideo = {
        ...mockVideo,
        videoType: 'cut' as const,
        shortTitle: 'IMPACTANTE!',
      }
      render(
        <WizardLayout
          wizard={wizard}
          video={cutVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.getByText('Thumb')).toBeInTheDocument()
      expect(screen.getByText('IMPACTANTE!')).toBeInTheDocument()
    })

    it('does NOT show short title for cut videos without shortTitle', () => {
      const wizard = createMockWizard()
      const cutVideo = {
        ...mockVideo,
        videoType: 'cut' as const,
        shortTitle: undefined,
      }
      render(
        <WizardLayout
          wizard={wizard}
          video={cutVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.queryByText('Thumb')).not.toBeInTheDocument()
    })

    it('does NOT show short title for episode videos', () => {
      const wizard = createMockWizard()
      const episodeVideo = {
        ...mockVideo,
        videoType: 'episode' as const,
        shortTitle: 'Should not appear',
      }
      render(
        <WizardLayout
          wizard={wizard}
          video={episodeVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.queryByText('Thumb')).not.toBeInTheDocument()
    })

    it('does NOT show short title for reel videos', () => {
      const wizard = createMockWizard()
      const reelVideo = {
        ...mockVideo,
        videoType: 'reel' as const,
        shortTitle: 'Should not appear',
      }
      render(
        <WizardLayout
          wizard={wizard}
          video={reelVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.queryByText('Thumb')).not.toBeInTheDocument()
    })

    it('updates short title when video prop changes (AC3 - real-time update)', () => {
      const wizard = createMockWizard()
      const cutVideo = {
        ...mockVideo,
        videoType: 'cut' as const,
        shortTitle: 'TÍTULO ORIGINAL',
      }

      const { rerender } = render(
        <WizardLayout
          wizard={wizard}
          video={cutVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.getByText('TÍTULO ORIGINAL')).toBeInTheDocument()

      // Simulate video update (as would happen via optimistic update)
      const updatedVideo = {
        ...cutVideo,
        shortTitle: 'NOVO TÍTULO',
      }

      rerender(
        <WizardLayout
          wizard={wizard}
          video={updatedVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      expect(screen.queryByText('TÍTULO ORIGINAL')).not.toBeInTheDocument()
      expect(screen.getByText('NOVO TÍTULO')).toBeInTheDocument()
    })
  })

  describe('Layout structure', () => {
    it('renders breadcrumb navigation', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      // Should show phase names in breadcrumb
      expect(screen.getByText('Crítica')).toBeInTheDocument()
      expect(screen.getByText('Publicar')).toBeInTheDocument()
    })

    it('renders video preview section', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      // VideoPreview should render (even if iframe is blocked in tests)
      const videoSection = document.querySelector('.lg\\:w-1\\/2')
      expect(videoSection).toBeInTheDocument()
    })

    it('renders interactive panel in right column', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div data-testid="interactive-content">Custom Content</div>}
        />
      )

      expect(screen.getByTestId('interactive-content')).toBeInTheDocument()
      expect(screen.getByText('Custom Content')).toBeInTheDocument()
    })

    it('renders console area at bottom', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
        />
      )

      // Console area should have the muted background
      const consoleArea = document.querySelector('.bg-muted\\/30')
      expect(consoleArea).toBeInTheDocument()
    })

    it('applies custom className', () => {
      const wizard = createMockWizard()
      render(
        <WizardLayout
          wizard={wizard}
          video={mockVideo}
          interactivePanel={<div>Test Panel</div>}
          className="custom-class"
        />
      )

      const layout = document.querySelector('.custom-class')
      expect(layout).toBeInTheDocument()
    })
  })
})
