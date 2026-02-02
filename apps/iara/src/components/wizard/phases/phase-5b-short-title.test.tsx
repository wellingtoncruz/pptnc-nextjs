/**
 * Tests for Phase5BShortTitle component.
 *
 * This component is exclusive to cut videos and handles short title
 * selection for YouTube thumbnails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test-utils'

import { Phase5BShortTitle } from './phase-5b-short-title'
import type { Video } from '@/types/video'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Phase5BResponse } from '@/lib/llm/types'

// Create mock wizard
function createMockWizard(overrides?: Partial<UseWizardReturn>): UseWizardReturn {
  return {
    state: {
      videoId: 'test-video',
      videoType: 'cut',
      currentPhase: 5,
      phases: {
        1: { status: 'completed', data: null, error: null },
        2: { status: 'completed', data: null, error: null },
        3: { status: 'completed', data: null, error: null },
        4: { status: 'completed', data: null, error: null },
        5: { status: 'pending', data: null, error: null },
        6: { status: 'pending', data: null, error: null },
        7: { status: 'pending', data: null, error: null },
        8: { status: 'pending', data: null, error: null },
      },
    },
    currentPhase: 5,
    currentPhaseData: { status: 'pending', data: null, error: null },
    currentPhaseMetadata: { phase: 5, label: 'Título Curto', type: 'reprocessable', spinnerText: '', alertTitle: '' },
    progress: 50,
    isComplete: false,
    firstIncompletePhase: 5,
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
    syncWithVideoData: vi.fn(),
    hydrateFromVideoData: vi.fn(),
    consoleMessages: [],
    addSpinner: vi.fn(),
    removeSpinner: vi.fn(),
    addAlert: vi.fn(),
    clearConsole: vi.fn(),
    ...overrides,
  }
}

// Create mock video (cut type)
function createMockVideo(overrides?: Partial<Video>): Video {
  return {
    id: 'test-cut',
    title: 'Test Cut Video',
    videoType: 'cut',
    duration: 60,
    publishedAt: new Date(),
    ...overrides,
  } as Video
}

// Create mock short titles result
function createMockShortTitlesResult(): Phase5BResponse {
  return {
    shortTitles: [
      'ISSO MUDOU TUDO!',
      'SEGREDO REVELADO',
      'COMO FOI POSSÍVEL?',
      'NÃO ESPERAVA ISSO',
      'A VERDADE SOBRE...',
    ],
  }
}

describe('Phase5BShortTitle', () => {
  const mockOnRetry = vi.fn()
  const mockOnRevalidate = vi.fn()
  const mockOnShortTitleSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading state', () => {
    it('shows loading spinner while processing', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={null}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      expect(screen.getByText(/gerando sugestões de título curto/i)).toBeInTheDocument()
    })
  })

  describe('Error state', () => {
    it('shows error message and retry button', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={null}
          error="Erro ao gerar títulos curtos"
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      expect(screen.getByText(/erro na geracao de titulos curtos/i)).toBeInTheDocument()
      expect(screen.getByText(/erro ao gerar títulos curtos/i)).toBeInTheDocument()
      expect(screen.getByText(/tentar novamente/i)).toBeInTheDocument()
    })

    it('calls onRetry when retry button is clicked', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={null}
          error="Erro ao gerar"
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      fireEvent.click(screen.getByText(/tentar novamente/i))
      expect(mockOnRetry).toHaveBeenCalled()
    })
  })

  describe('Short titles list', () => {
    it('displays all short title suggestions', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      expect(screen.getByText('ISSO MUDOU TUDO!')).toBeInTheDocument()
      expect(screen.getByText('SEGREDO REVELADO')).toBeInTheDocument()
      expect(screen.getByText('COMO FOI POSSÍVEL?')).toBeInTheDocument()
      expect(screen.getByText('NÃO ESPERAVA ISSO')).toBeInTheDocument()
      expect(screen.getByText('A VERDADE SOBRE...')).toBeInTheDocument()
    })

    it('shows character count for each short title', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      // Check that character counts are displayed (multiple titles may have same length)
      // "NÃO ESPERAVA ISSO" has 17 chars (unique length in the mock data)
      expect(screen.getByText('17 chars')).toBeInTheDocument()
    })
  })

  describe('Short title selection', () => {
    it('calls onShortTitleSelect when a short title is clicked', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      const radioButton = screen.getByLabelText('ISSO MUDOU TUDO!')
      fireEvent.click(radioButton)

      expect(mockOnShortTitleSelect).toHaveBeenCalledWith('ISSO MUDOU TUDO!')
    })

    it('pre-selects short title if video already has one', () => {
      const wizard = createMockWizard()
      const video = createMockVideo({ shortTitle: 'SEGREDO REVELADO' })
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      const radioButton = screen.getByLabelText('SEGREDO REVELADO')
      expect(radioButton).toBeChecked()
    })
  })

  describe('Advance button', () => {
    it('is disabled when no short title selected', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      const advanceButton = screen.getByText(/avançar para descrição/i)
      expect(advanceButton).toBeDisabled()
    })

    it('is enabled when short title is selected', () => {
      const wizard = createMockWizard()
      const video = createMockVideo({ shortTitle: 'SEGREDO REVELADO' })
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      const advanceButton = screen.getByText(/avançar para descrição/i)
      expect(advanceButton).not.toBeDisabled()
    })

    it('completes phase 5B and advances to phase 6 when clicked', () => {
      const wizard = createMockWizard()
      const video = createMockVideo({ shortTitle: 'SEGREDO REVELADO' })
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      const advanceButton = screen.getByText(/avançar para descrição/i)
      fireEvent.click(advanceButton)

      // Phase 5B calls completePhaseAndAdvance to mark phase as complete and navigate
      // The selected short title is passed as data
      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith('5B', { shortTitle: 'SEGREDO REVELADO' })
    })
  })

  describe('Revalidation', () => {
    it('shows additional context input', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      expect(screen.getByLabelText(/dica para novos titulos curtos/i)).toBeInTheDocument()
    })

    it('shows revalidate button', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      expect(screen.getByRole('button', { name: /gerar novos titulos curtos/i })).toBeInTheDocument()
    })

    it('opens confirmation dialog when revalidate button clicked', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /gerar novos titulos curtos/i }))

      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(screen.getByText(/gerar novos titulos curtos\?/i)).toBeInTheDocument()
    })

    it('calls onRevalidate with context when confirmed', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()
      const result = createMockShortTitlesResult()

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      // Add context
      const textarea = screen.getByLabelText(/dica para novos titulos curtos/i)
      fireEvent.change(textarea, { target: { value: 'Use mais urgência' } })

      // Open dialog and confirm
      fireEvent.click(screen.getByRole('button', { name: /gerar novos titulos curtos/i }))
      fireEvent.click(screen.getByRole('button', { name: /sim, gerar novos/i }))

      expect(mockOnRevalidate).toHaveBeenCalledWith('Use mais urgência')
    })
  })

  describe('Empty state', () => {
    it('shows empty state when LLM returns no short titles', () => {
      const wizard = createMockWizard()
      const video = createMockVideo()
      const result: Phase5BResponse = { shortTitles: [] }

      render(
        <Phase5BShortTitle
          wizard={wizard}
          video={video}
          shortTitlesResult={result}
          onRetry={mockOnRetry}
          onRevalidate={mockOnRevalidate}
          onShortTitleSelect={mockOnShortTitleSelect}
        />
      )

      expect(screen.getByText(/nao foi possivel gerar sugestoes/i)).toBeInTheDocument()
    })
  })
})
