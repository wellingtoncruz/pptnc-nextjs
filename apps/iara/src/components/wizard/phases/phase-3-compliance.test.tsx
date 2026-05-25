import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@/test-utils'

import { Phase3Compliance } from './phase-3-compliance'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { Phase3Response } from '@/lib/llm'
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

// Mock Phase3Response with risks
const mockPhase3WithRisks: Phase3Response = {
  hasRisks: true,
  risks: [
    { timestamp: '05:30', risk: 'brand_mention', description: 'Menção da marca XYZ sem divulgação' },
    { timestamp: '12:45', risk: 'medical_claim', description: 'Afirmação sobre tratamento médico não comprovado' },
  ],
}

// Mock Phase3Response without risks
const mockPhase3NoRisks: Phase3Response = {
  hasRisks: false,
  risks: [],
}

// Create mock wizard return
function createMockWizard(overrides: Partial<UseWizardReturn> = {}): UseWizardReturn {
  return {
    state: {
      videoId: 'test-video-123',
      videoType: 'episode',
      currentPhase: 'risk',
      phases: {
        critique: { status: 'completed', data: {}, error: null },
        'edit-check': { status: 'completed', data: {}, error: null },
        risk: { status: 'pending', data: null, error: null },
        chapters: { status: 'pending', data: null, error: null },
        title: { status: 'pending', data: null, error: null },
        description: { status: 'pending', data: null, error: null },
        tags: { status: 'pending', data: null, error: null },
        publish: { status: 'pending', data: null, error: null },
      },
    },
    currentPhase: 'risk',
    currentPhaseData: { status: 'pending', data: null, error: null },
    currentPhaseMetadata: {
      phase: 'risk',
      label: 'Compliance',
      type: 'immutable',
      spinnerText: 'Verificando se existem pontos polêmicos ou riscos de conformidade...',
      alertTitle: 'Riscos e Conformidade',
    },
    progress: 25,
    isComplete: false,
    firstIncompletePhase: 'risk',
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

describe('Phase3Compliance', () => {
  describe('Loading state', () => {
    it('shows loading spinner when result is null', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={null} />
      )
      expect(screen.getByText(/analisando riscos e conformidade/i)).toBeInTheDocument()
    })

    it('shows processing message in button area', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={null} />
      )
      expect(screen.getByText(/aguardando processamento da análise de compliance/i)).toBeInTheDocument()
    })

    it('disables advance button when loading', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={null} />
      )
      const button = screen.getByRole('button', { name: /avançar para cap.?tulos/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Success state (no risks)', () => {
    it('shows success card when no risks found', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3NoRisks} />
      )
      expect(screen.getByText(/não me parece haver riscos de compliance/i)).toBeInTheDocument()
    })

    it('enables advance button when result exists', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3NoRisks} />
      )
      const button = screen.getByRole('button', { name: /avançar para cap.?tulos/i })
      expect(button).toBeEnabled()
    })

    it('advances directly without confirmation dialog', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3NoRisks} />
      )
      const button = screen.getByRole('button', { name: /avançar para cap.?tulos/i })
      fireEvent.click(button)
      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith('risk', mockPhase3NoRisks)
    })
  })

  describe('Risks found state', () => {
    it('shows risks list when risks exist', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3WithRisks} />
      )
      // Card title shows "Possíveis Riscos de Compliance" - use getAllByText since it may appear in multiple places
      const titles = screen.getAllByText(/possíveis riscos de compliance/i)
      expect(titles.length).toBeGreaterThan(0)
      // Risk descriptions are shown
      expect(screen.getByText(/menção da marca xyz sem divulgação/i)).toBeInTheDocument()
      expect(screen.getByText(/afirmação sobre tratamento médico não comprovado/i)).toBeInTheDocument()
    })

    it('shows correct risk count in card description', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3WithRisks} />
      )
      expect(screen.getByText(/encontrei 2 possíveis riscos/i)).toBeInTheDocument()
    })

    it('renders clickable timestamps for each risk', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3WithRisks} />
      )
      // Timestamps are now buttons (not links) that control in-page player
      const timestampButtons = screen.getAllByRole('button', { name: /ir para .* no vídeo/i })
      expect(timestampButtons).toHaveLength(2)
      expect(timestampButtons[0]).toHaveTextContent('05:30')
      expect(timestampButtons[1]).toHaveTextContent('12:45')
    })

    it('renders risk type badges', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3WithRisks} />
      )
      expect(screen.getByText(/menção de marca/i)).toBeInTheDocument()
      expect(screen.getByText(/claim médico/i)).toBeInTheDocument()
    })

    it('enables advance button when risks exist', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3WithRisks} />
      )
      const button = screen.getByRole('button', { name: /avançar para cap.?tulos/i })
      expect(button).toBeEnabled()
    })
  })

  describe('Confirmation dialog', () => {
    it('opens confirmation dialog when clicking advance with risks', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3WithRisks} />
      )
      const button = screen.getByRole('button', { name: /avançar para cap.?tulos/i })
      fireEvent.click(button)

      expect(screen.getByText(/tem certeza que deseja continuar\?/i)).toBeInTheDocument()
      expect(screen.getByText(/foram identificados 2 possíveis riscos de compliance/i)).toBeInTheDocument()
    })

    it('does not advance when clicking "No" in dialog', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3WithRisks} />
      )
      const advanceButton = screen.getByRole('button', { name: /avançar para cap.?tulos/i })
      fireEvent.click(advanceButton)

      const dialog = screen.getByRole('alertdialog')
      const cancelButton = within(dialog).getByRole('button', { name: /não, verificar/i })
      fireEvent.click(cancelButton)

      expect(wizard.completePhaseAndAdvance).not.toHaveBeenCalled()
    })

    it('advances when clicking "Yes" in dialog', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={mockPhase3WithRisks} />
      )
      const advanceButton = screen.getByRole('button', { name: /avançar para cap.?tulos/i })
      fireEvent.click(advanceButton)

      const dialog = screen.getByRole('alertdialog')
      const confirmButton = within(dialog).getByRole('button', { name: /sim, continuar/i })
      fireEvent.click(confirmButton)

      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith('risk', mockPhase3WithRisks)
    })
  })

  describe('Single risk grammar', () => {
    it('uses singular form for single risk in card description', () => {
      const wizard = createMockWizard()
      const singleRisk: Phase3Response = {
        hasRisks: true,
        risks: [{ timestamp: '05:30', risk: 'brand_mention', description: 'Um risco' }],
      }
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={singleRisk} />
      )
      expect(screen.getByText(/encontrei 1 possível risco/i)).toBeInTheDocument()
    })

    it('uses singular form for single risk in confirmation dialog', () => {
      const wizard = createMockWizard()
      const singleRisk: Phase3Response = {
        hasRisks: true,
        risks: [{ timestamp: '05:30', risk: 'brand_mention', description: 'Um risco' }],
      }
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={singleRisk} />
      )
      const button = screen.getByRole('button', { name: /avançar para cap.?tulos/i })
      fireEvent.click(button)

      expect(screen.getByText(/foi identificado 1 possível risco de compliance/i)).toBeInTheDocument()
    })
  })

  describe('Error state', () => {
    it('shows error card when error prop is provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance
          wizard={wizard}
          video={mockVideo}
          complianceResult={null}
          error="Erro ao conectar com o servidor"
        />
      )
      expect(screen.getByText(/erro na análise/i)).toBeInTheDocument()
      expect(screen.getByText(/erro ao conectar com o servidor/i)).toBeInTheDocument()
    })

    it('shows retry button when onRetry is provided', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase3Compliance
          wizard={wizard}
          video={mockVideo}
          complianceResult={null}
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
        <Phase3Compliance
          wizard={wizard}
          video={mockVideo}
          complianceResult={null}
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
        <Phase3Compliance
          wizard={wizard}
          video={mockVideo}
          complianceResult={null}
          error="Erro"
        />
      )
      const button = screen.getByRole('button', { name: /avançar para cap.?tulos/i })
      expect(button).toBeDisabled()
    })

    it('does not show loading state when in error state', () => {
      const wizard = createMockWizard()
      render(
        <Phase3Compliance
          wizard={wizard}
          video={mockVideo}
          complianceResult={null}
          error="Erro"
        />
      )
      expect(screen.queryByText(/analisando riscos e conformidade/i)).not.toBeInTheDocument()
    })
  })

  describe('Risk type badges', () => {
    it('renders correct badge for brand_mention risk', () => {
      const wizard = createMockWizard()
      const brandRisk: Phase3Response = {
        hasRisks: true,
        risks: [{ timestamp: '05:30', risk: 'brand_mention', description: 'Descrição do risco de marca' }],
      }
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={brandRisk} />
      )
      // Badge should show "Menção de Marca"
      expect(screen.getByText('Menção de Marca')).toBeInTheDocument()
    })

    it('renders correct badge for sensitive_language risk', () => {
      const wizard = createMockWizard()
      const sensitiveRisk: Phase3Response = {
        hasRisks: true,
        risks: [{ timestamp: '05:30', risk: 'sensitive_language', description: 'Descrição do risco sensível' }],
      }
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={sensitiveRisk} />
      )
      // Badge should show "Linguagem Sensível"
      expect(screen.getByText('Linguagem Sensível')).toBeInTheDocument()
    })

    it('renders correct badge for unknown risk type', () => {
      const wizard = createMockWizard()
      const unknownRisk: Phase3Response = {
        hasRisks: true,
        risks: [{ timestamp: '05:30', risk: 'unknown_type', description: 'Risco desconhecido aqui' }],
      }
      render(
        <Phase3Compliance wizard={wizard} video={mockVideo} complianceResult={unknownRisk} />
      )
      // Falls back to "Outro" badge
      expect(screen.getByText('Outro')).toBeInTheDocument()
    })
  })
})
