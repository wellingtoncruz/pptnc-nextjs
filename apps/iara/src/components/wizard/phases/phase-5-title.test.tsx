import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test-utils'

import { Phase5Title } from './phase-5-title'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { Phase5Response } from '@/lib/llm/types'

// Mock video data
const mockVideo: Video = {
  id: 'test-video-123',
  podcastId: 'test-podcast',
  title: '',
  description: 'Test description',
  thumbnail: 'https://example.com/thumb.jpg',
  duration: 3600,
  publishedAt: new Date().toISOString(),
  status: 'processing',
  videoType: 'episode',
  transcriptionTXT: 'Test transcript',
  transcriptionSRT: '00:00:00,000 --> 00:00:05,000\nTest',
  createdAt: { toDate: () => new Date() } as never,
  updatedAt: { toDate: () => new Date() } as never,
}

// Mock titles response
const mockTitlesWithData: Phase5Response = {
  titles: [
    'Titulo 1 - Conservador e profissional',
    'Titulo 2 - Equilibrado e informativo',
    'Titulo 3 - Chamativo e engajador',
    'Titulo 4 - Focado em SEO',
    'Titulo 5 - Criativo e diferente',
  ],
}

const mockEmptyTitles: Phase5Response = {
  titles: [],
}

// Create mock wizard
function createMockWizard(): UseWizardReturn {
  return {
    currentPhase: 'title',
    phases: {
      critique: { status: 'completed', needsRevalidation: false, data: null, error: null },
      'edit-check': { status: 'completed', needsRevalidation: false, data: null, error: null },
      risk: { status: 'completed', needsRevalidation: false, data: null, error: null },
      chapters: { status: 'completed', needsRevalidation: false, data: null, error: null },
      title: { status: 'pending', needsRevalidation: false, data: null, error: null },
      description: { status: 'pending', needsRevalidation: false, data: null, error: null },
      tags: { status: 'pending', needsRevalidation: false, data: null, error: null },
      publish: { status: 'pending', needsRevalidation: false, data: null, error: null },
    },
    consoleMessages: [],
    setPhaseStatus: vi.fn(),
    setPhaseLoading: vi.fn(),
    setPhaseError: vi.fn(),
    setPhaseData: vi.fn(),
    goToPhase: vi.fn(),
    completePhaseAndAdvance: vi.fn(),
    addSpinner: vi.fn(() => 'spinner-1'),
    removeSpinner: vi.fn(),
    addAlert: vi.fn(),
    removeAlert: vi.fn(),
    reset: vi.fn(),
    invalidateFromPhase: vi.fn(),
  } as unknown as UseWizardReturn
}

describe('Phase5Title', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading state', () => {
    it('shows loading spinner when no result yet', () => {
      const wizard = createMockWizard()
      render(<Phase5Title wizard={wizard} video={mockVideo} titlesResult={null} />)
      expect(screen.getByText(/gerando sugestões de título/i)).toBeInTheDocument()
    })

    it('disables advance button when loading', () => {
      const wizard = createMockWizard()
      render(<Phase5Title wizard={wizard} video={mockVideo} titlesResult={null} />)
      const button = screen.getByRole('button', { name: /avançar para descri/i })
      expect(button).toBeDisabled()
    })

    it('does not show loading state when in error state', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={null} error="Erro" />
      )
      expect(screen.queryByText(/gerando sugestões de título/i)).not.toBeInTheDocument()
    })
  })

  describe('Titles display', () => {
    it('displays 5 title suggestions as radio buttons', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )
      expect(screen.getByText('Sugestoes de Titulo')).toBeInTheDocument()
      expect(screen.getByText('Titulo 1 - Conservador e profissional')).toBeInTheDocument()
      expect(screen.getByText('Titulo 2 - Equilibrado e informativo')).toBeInTheDocument()
      expect(screen.getByText('Titulo 3 - Chamativo e engajador')).toBeInTheDocument()
      expect(screen.getByText('Titulo 4 - Focado em SEO')).toBeInTheDocument()
      expect(screen.getByText('Titulo 5 - Criativo e diferente')).toBeInTheDocument()
    })

    it('renders radio buttons for each title', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )
      const radioButtons = screen.getAllByRole('radio')
      expect(radioButtons).toHaveLength(5)
    })

    it('shows additional context input', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )
      expect(screen.getByLabelText(/dica para novos titulos/i)).toBeInTheDocument()
      expect(
        screen.getByPlaceholderText(/foque mais no convidado principal/i)
      ).toBeInTheDocument()
    })

    it('shows character count for additional context', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )
      expect(screen.getByText(/200 caracteres restantes/i)).toBeInTheDocument()
    })

    it('shows revalidate button', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )
      expect(screen.getByRole('button', { name: /gerar novos titulos/i })).toBeInTheDocument()
    })
  })

  describe('Title selection', () => {
    it('calls onTitleSelect when a title is selected', () => {
      const wizard = createMockWizard()
      const onTitleSelect = vi.fn()
      render(
        <Phase5Title
          wizard={wizard}
          video={mockVideo}
          titlesResult={mockTitlesWithData}
          onTitleSelect={onTitleSelect}
        />
      )

      const radioButton = screen.getByRole('radio', { name: /titulo 1 - conservador/i })
      fireEvent.click(radioButton)

      expect(onTitleSelect).toHaveBeenCalledWith('Titulo 1 - Conservador e profissional')
    })

    it('enables advance button when a title is selected', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )

      // Initially disabled (no selection)
      const advanceButton = screen.getByRole('button', { name: /avançar para descri/i })
      expect(advanceButton).toBeDisabled()

      // Select a title
      const radioButton = screen.getByRole('radio', { name: /titulo 1 - conservador/i })
      fireEvent.click(radioButton)

      // Now should be enabled
      expect(advanceButton).not.toBeDisabled()
    })

    it('calls completePhaseAndAdvance when advance is clicked with selection', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )

      // Select a title
      const radioButton = screen.getByRole('radio', { name: /titulo 1 - conservador/i })
      fireEvent.click(radioButton)

      // Click advance
      const advanceButton = screen.getByRole('button', { name: /avançar para descri/i })
      fireEvent.click(advanceButton)

      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith('title', {
        selectedTitle: 'Titulo 1 - Conservador e profissional',
      })
    })
  })

  describe('Revalidation', () => {
    it('shows confirmation dialog when revalidate is clicked', () => {
      const wizard = createMockWizard()
      const onRevalidate = vi.fn()
      render(
        <Phase5Title
          wizard={wizard}
          video={mockVideo}
          titlesResult={mockTitlesWithData}
          onRevalidate={onRevalidate}
        />
      )

      const revalidateButton = screen.getByRole('button', { name: /gerar novos titulos/i })
      fireEvent.click(revalidateButton)

      expect(screen.getByText(/gerar novos titulos\?/i)).toBeInTheDocument()
      expect(
        screen.getByText(/fases seguintes.*descricao e tags.*serao marcadas/i)
      ).toBeInTheDocument()
    })

    it('calls onRevalidate when confirmation is accepted', async () => {
      const wizard = createMockWizard()
      const onRevalidate = vi.fn()
      render(
        <Phase5Title
          wizard={wizard}
          video={mockVideo}
          titlesResult={mockTitlesWithData}
          onRevalidate={onRevalidate}
        />
      )

      // Enter additional context
      const contextInput = screen.getByPlaceholderText(/foque mais no convidado principal/i)
      fireEvent.change(contextInput, { target: { value: 'Use mais emocao' } })

      // Click revalidate
      const revalidateButton = screen.getByRole('button', { name: /gerar novos titulos/i })
      fireEvent.click(revalidateButton)

      // Confirm in dialog
      const confirmButton = screen.getByRole('button', { name: /sim, gerar novos/i })
      fireEvent.click(confirmButton)

      expect(onRevalidate).toHaveBeenCalledWith('Use mais emocao')
    })

    it('closes dialog when cancel is clicked', () => {
      const wizard = createMockWizard()
      const onRevalidate = vi.fn()
      render(
        <Phase5Title
          wizard={wizard}
          video={mockVideo}
          titlesResult={mockTitlesWithData}
          onRevalidate={onRevalidate}
        />
      )

      const revalidateButton = screen.getByRole('button', { name: /gerar novos titulos/i })
      fireEvent.click(revalidateButton)

      const cancelButton = screen.getByRole('button', { name: /cancelar/i })
      fireEvent.click(cancelButton)

      expect(onRevalidate).not.toHaveBeenCalled()
    })

    it('shows additional context in confirmation dialog', () => {
      const wizard = createMockWizard()
      const onRevalidate = vi.fn()
      render(
        <Phase5Title
          wizard={wizard}
          video={mockVideo}
          titlesResult={mockTitlesWithData}
          onRevalidate={onRevalidate}
        />
      )

      // Enter additional context
      const contextInput = screen.getByPlaceholderText(/foque mais no convidado principal/i)
      fireEvent.change(contextInput, { target: { value: 'Minha dica especial' } })

      // Click revalidate
      const revalidateButton = screen.getByRole('button', { name: /gerar novos titulos/i })
      fireEvent.click(revalidateButton)

      // The dialog should show "Sua dica: Minha dica especial"
      expect(screen.getByText(/sua dica:/i)).toBeInTheDocument()
      // Use getAllByText since the text appears in both the input and the dialog
      const dicaElements = screen.getAllByText(/minha dica especial/i)
      expect(dicaElements.length).toBeGreaterThanOrEqual(1)
    })

    it('disables revalidate button when onRevalidate is not provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )

      const revalidateButton = screen.getByRole('button', { name: /gerar novos titulos/i })
      expect(revalidateButton).toBeDisabled()
    })
  })

  describe('Empty titles state', () => {
    it('shows informative message when no titles returned', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockEmptyTitles} />
      )
      expect(screen.getByText(/nao foi possivel gerar sugestoes de titulo/i)).toBeInTheDocument()
    })

    it('shows retry button when no titles returned', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase5Title
          wizard={wizard}
          video={mockVideo}
          titlesResult={mockEmptyTitles}
          onRetry={onRetry}
        />
      )
      const retryButton = screen.getByRole('button', { name: /tentar novamente/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('disables advance button when no titles', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockEmptyTitles} />
      )
      const button = screen.getByRole('button', { name: /avançar para descri/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Error state', () => {
    it('shows error card when error prop is provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title
          wizard={wizard}
          video={mockVideo}
          titlesResult={null}
          error="Erro ao conectar com o servidor"
        />
      )
      expect(screen.getByText(/erro na geracao de titulos/i)).toBeInTheDocument()
      expect(screen.getByText(/erro ao conectar com o servidor/i)).toBeInTheDocument()
    })

    it('shows retry button when onRetry is provided', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase5Title
          wizard={wizard}
          video={mockVideo}
          titlesResult={null}
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
        <Phase5Title
          wizard={wizard}
          video={mockVideo}
          titlesResult={null}
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
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={null} error="Erro" />
      )
      const button = screen.getByRole('button', { name: /avançar para descri/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Additional context input', () => {
    it('updates character count as user types', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )

      const contextInput = screen.getByPlaceholderText(/foque mais no convidado principal/i)
      fireEvent.change(contextInput, { target: { value: '12345' } })

      expect(screen.getByText(/195 caracteres restantes/i)).toBeInTheDocument()
    })

    it('shows warning color when few characters remaining', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )

      const contextInput = screen.getByPlaceholderText(/foque mais no convidado principal/i)
      // Type 185 characters to leave only 15 remaining
      const longText = 'a'.repeat(185)
      fireEvent.change(contextInput, { target: { value: longText } })

      const charCount = screen.getByText(/15 caracteres restantes/i)
      expect(charCount).toHaveClass('text-amber-500')
    })

    it('respects max length of 200 characters', () => {
      const wizard = createMockWizard()
      render(
        <Phase5Title wizard={wizard} video={mockVideo} titlesResult={mockTitlesWithData} />
      )

      const contextInput = screen.getByPlaceholderText(
        /foque mais no convidado principal/i
      ) as HTMLTextAreaElement
      expect(contextInput).toHaveAttribute('maxLength', '200')
    })
  })

  describe('Pre-selected title from video', () => {
    it('pre-selects title from video.title if exists', () => {
      const wizard = createMockWizard()
      const videoWithTitle = { ...mockVideo, title: 'Titulo 2 - Equilibrado e informativo' }
      render(
        <Phase5Title
          wizard={wizard}
          video={videoWithTitle}
          titlesResult={mockTitlesWithData}
        />
      )

      // The radio for title 2 should be checked
      const radio = screen.getByRole('radio', { name: /titulo 2 - equilibrado/i })
      expect(radio).toBeChecked()
    })
  })
})
