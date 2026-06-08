import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@/test-utils'

import { Phase2EditCheck } from './phase-2-edit-check'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { Phase2Response } from '@/lib/llm'
import type { FirestoreTimestamp } from '@/types/podcast'

// Mock the YouTube context since ClickableTimestamp uses it
vi.mock('../youtube-context', () => ({
  useYouTubeOptional: () => ({
    seekTo: vi.fn(),
    player: null,
    setPlayer: vi.fn(),
    isReady: false,
    registerStartPlayback: vi.fn(),
  }),
}))

// Helper to create Firestore-like timestamp
function createTimestamp(date: Date): FirestoreTimestamp {
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  }
}

// Mock video
const mockVideo: Video = {
  id: 'test-video-123',
  title: 'Test Episode',
  description: 'Test description',
  duration: 3600,
  publishedAt: createTimestamp(new Date('2026-01-15')),
}

// Mock Phase2Response with issues
const mockPhase2WithIssues: Phase2Response = {
  hasIssues: true,
  issues: [
    { timestamp: '05:30', category: 'corte', description: 'Corte abrupto na fala do entrevistado' },
    { timestamp: '12:45', category: 'audio', description: 'Silêncio prolongado de 3 segundos' },
  ],
}

// Mock Phase2Response without issues
const mockPhase2NoIssues: Phase2Response = {
  hasIssues: false,
  issues: [],
}

// Create mock wizard return
function createMockWizard(overrides: Partial<UseWizardReturn> = {}): UseWizardReturn {
  return {
    state: {
      videoId: 'test-video-123',
      videoType: 'episode',
      currentPhase: 'edit-check',
      phases: {
        critique: { status: 'completed', data: {}, error: null },
        'edit-check': { status: 'pending', data: null, error: null },
        risk: { status: 'pending', data: null, error: null },
        chapters: { status: 'pending', data: null, error: null },
        title: { status: 'pending', data: null, error: null },
        description: { status: 'pending', data: null, error: null },
        tags: { status: 'pending', data: null, error: null },
        publish: { status: 'pending', data: null, error: null },
      },
    },
    currentPhase: 'edit-check',
    currentPhaseData: { status: 'pending', data: null, error: null },
    currentPhaseMetadata: {
      phase: 'edit-check',
      label: 'Edição',
      type: 'immutable',
      spinnerText: 'Verificando se existem falhas de edição perceptíveis...',
      alertTitle: 'Checagem de Edição',
    },
    progress: 12.5,
    isComplete: false,
    firstIncompletePhase: 'edit-check',
    goToPhase: vi.fn(),
    goToNextPhase: vi.fn(),
    canNavigateToPhase: vi.fn().mockReturnValue(true),
    setPhaseStatus: vi.fn(),
    setPhaseLoading: vi.fn(),
    setPhaseData: vi.fn(),
    setPhaseError: vi.fn(),
    invalidateFromPhase: vi.fn(),
    completePhaseAndAdvance: vi.fn(),
    reset: vi.fn(),
    consoleMessages: [],
    addSpinner: vi.fn().mockReturnValue('spinner-1'),
    removeSpinner: vi.fn(),
    addAlert: vi.fn().mockReturnValue('alert-1'),
    clearConsole: vi.fn(),
    ...overrides,
  }
}

describe('Phase2EditCheck', () => {
  describe('Loading state', () => {
    it('shows loading spinner when result is null', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={null} />
      )
      expect(screen.getByText(/analisando transcrição para falhas de edição/i)).toBeInTheDocument()
    })

    it('shows processing message in button area', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={null} />
      )
      expect(screen.getByText(/aguardando processamento da checagem de edição/i)).toBeInTheDocument()
    })

    it('disables advance button when loading', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={null} />
      )
      const button = screen.getByRole('button', { name: /avançar para compliance/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Success state (no issues)', () => {
    it('shows success card when no issues found', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2NoIssues} />
      )
      expect(screen.getByText(/parabéns, não há falhas de edição que eu possa identificar/i)).toBeInTheDocument()
    })

    it('enables advance button when result exists', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2NoIssues} />
      )
      const button = screen.getByRole('button', { name: /avançar para compliance/i })
      expect(button).toBeEnabled()
    })

    it('advances directly without confirmation dialog', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2NoIssues} />
      )
      const button = screen.getByRole('button', { name: /avançar para compliance/i })
      fireEvent.click(button)
      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith('edit-check', mockPhase2NoIssues)
    })
  })

  describe('Issues found state', () => {
    it('shows issues list when issues exist', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2WithIssues} />
      )
      expect(screen.getByText(/possíveis falhas de edição/i)).toBeInTheDocument()
      expect(screen.getByText(/corte abrupto na fala do entrevistado/i)).toBeInTheDocument()
      expect(screen.getByText(/silêncio prolongado de 3 segundos/i)).toBeInTheDocument()
    })

    it('shows correct issue count in card description', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2WithIssues} />
      )
      expect(screen.getByText(/encontrei 2 possíveis problemas/i)).toBeInTheDocument()
    })

    it('renders clickable timestamps for each issue', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2WithIssues} />
      )
      // Timestamps are now buttons (not links) that control in-page player
      // Find buttons by their aria-label pattern
      const timestampButtons = screen.getAllByRole('button', { name: /ir para .* no vídeo/i })
      expect(timestampButtons).toHaveLength(2)
      expect(timestampButtons[0]).toHaveTextContent('05:30')
      expect(timestampButtons[1]).toHaveTextContent('12:45')
    })

    it('enables advance button when issues exist', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2WithIssues} />
      )
      const button = screen.getByRole('button', { name: /avançar para compliance/i })
      expect(button).toBeEnabled()
    })
  })

  describe('Confirmation dialog', () => {
    it('opens confirmation dialog when clicking advance with issues', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2WithIssues} />
      )
      const button = screen.getByRole('button', { name: /avançar para compliance/i })
      fireEvent.click(button)

      expect(screen.getByText(/tem certeza que deseja continuar\?/i)).toBeInTheDocument()
      expect(screen.getByText(/foram identificadas 2 possíveis falhas de edição/i)).toBeInTheDocument()
    })

    it('does not advance when clicking "No" in dialog', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2WithIssues} />
      )
      const advanceButton = screen.getByRole('button', { name: /avançar para compliance/i })
      fireEvent.click(advanceButton)

      const dialog = screen.getByRole('alertdialog')
      const cancelButton = within(dialog).getByRole('button', { name: /não, verificar/i })
      fireEvent.click(cancelButton)

      expect(wizard.completePhaseAndAdvance).not.toHaveBeenCalled()
    })

    it('advances when clicking "Yes" in dialog', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={mockPhase2WithIssues} />
      )
      const advanceButton = screen.getByRole('button', { name: /avançar para compliance/i })
      fireEvent.click(advanceButton)

      const dialog = screen.getByRole('alertdialog')
      const confirmButton = within(dialog).getByRole('button', { name: /sim, continuar/i })
      fireEvent.click(confirmButton)

      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith('edit-check', mockPhase2WithIssues)
    })
  })

  describe('Error state (AC8)', () => {
    it('shows error card when error prop is provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck
          wizard={wizard}
          video={mockVideo}
          editCheckResult={null}
          error="Erro ao conectar com o servidor"
        />
      )
      expect(screen.getByText(/erro na checagem de edição/i)).toBeInTheDocument()
      expect(screen.getByText(/erro ao conectar com o servidor/i)).toBeInTheDocument()
    })

    it('shows retry button when onRetry is provided', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase2EditCheck
          wizard={wizard}
          video={mockVideo}
          editCheckResult={null}
          error="Erro de timeout"
          onRetry={onRetry}
        />
      )
      const retryButton = screen.getByRole('button', { name: /tentar novamente/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('calls onRetry when retry button is clicked', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase2EditCheck
          wizard={wizard}
          video={mockVideo}
          editCheckResult={null}
          error="Erro de timeout"
          onRetry={onRetry}
        />
      )
      const retryButton = screen.getByRole('button', { name: /tentar novamente/i })
      fireEvent.click(retryButton)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('disables advance button when in error state', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck
          wizard={wizard}
          video={mockVideo}
          editCheckResult={null}
          error="Erro"
        />
      )
      const button = screen.getByRole('button', { name: /avançar para compliance/i })
      expect(button).toBeDisabled()
    })

    it('does not show loading spinner when in error state', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck
          wizard={wizard}
          video={mockVideo}
          editCheckResult={null}
          error="Erro"
        />
      )
      expect(screen.queryByText(/analisando transcrição/i)).not.toBeInTheDocument()
    })

    it('does not show error card when result exists (even if error prop set)', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck
          wizard={wizard}
          video={mockVideo}
          editCheckResult={mockPhase2NoIssues}
          error={null}
        />
      )
      expect(screen.queryByText(/erro na checagem/i)).not.toBeInTheDocument()
    })
  })

  describe('Single issue grammar', () => {
    it('uses singular form for single issue in card description', () => {
      const wizard = createMockWizard()
      const singleIssue: Phase2Response = {
        hasIssues: true,
        issues: [{ timestamp: '05:30', category: 'edicao', description: 'Um problema' }],
      }
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={singleIssue} />
      )
      expect(screen.getByText(/encontrei 1 possível problema/i)).toBeInTheDocument()
    })

    it('uses singular form for single issue in confirmation dialog', () => {
      const wizard = createMockWizard()
      const singleIssue: Phase2Response = {
        hasIssues: true,
        issues: [{ timestamp: '05:30', category: 'edicao', description: 'Um problema' }],
      }
      render(
        <Phase2EditCheck wizard={wizard} video={mockVideo} editCheckResult={singleIssue} />
      )
      const button = screen.getByRole('button', { name: /avançar para compliance/i })
      fireEvent.click(button)

      expect(screen.getByText(/foram identificadas 1 possível falha de edição/i)).toBeInTheDocument()
    })
  })

  describe('Reprocess (Epic 26)', () => {
    it('shows a "Reprocessar" button when a result exists and onReprocess is provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck
          wizard={wizard}
          video={mockVideo}
          editCheckResult={mockPhase2WithIssues}
          onReprocess={vi.fn()}
        />
      )
      expect(screen.getByRole('button', { name: /reprocessar/i })).toBeInTheDocument()
    })

    it('does not show "Reprocessar" without a result', () => {
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck
          wizard={wizard}
          video={mockVideo}
          editCheckResult={null}
          onReprocess={vi.fn()}
        />
      )
      expect(screen.queryByRole('button', { name: /reprocessar/i })).not.toBeInTheDocument()
    })

    it('calls onReprocess when clicked', () => {
      const onReprocess = vi.fn()
      const wizard = createMockWizard()
      render(
        <Phase2EditCheck
          wizard={wizard}
          video={mockVideo}
          editCheckResult={mockPhase2WithIssues}
          onReprocess={onReprocess}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /reprocessar/i }))
      expect(onReprocess).toHaveBeenCalledTimes(1)
    })
  })
})
