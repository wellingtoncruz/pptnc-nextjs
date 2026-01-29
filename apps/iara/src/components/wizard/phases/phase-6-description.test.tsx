import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@/test-utils'

import { Phase6Description } from './phase-6-description'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { Phase6Response } from '@/lib/llm/types'

// Mock video data
const mockVideo: Video = {
  id: 'test-video-123',
  podcastId: 'test-podcast',
  title: 'Test Video Title',
  description: '',
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

// Mock description response
const mockDescriptionWithData: Phase6Response = {
  description: `Este episodio traz uma conversa incrivel sobre tecnologia e inovacao.

Nosso convidado especial compartilha insights valiosos sobre o futuro da industria.

Nao perca essa discussao fascinante sobre os rumos do mercado tech.

#podcast #tecnologia #inovacao`,
}

// Create mock wizard
function createMockWizard(): UseWizardReturn {
  return {
    currentPhase: 6,
    phases: {
      1: { status: 'completed', needsRevalidation: false, data: null, error: null },
      2: { status: 'completed', needsRevalidation: false, data: null, error: null },
      3: { status: 'completed', needsRevalidation: false, data: null, error: null },
      4: { status: 'completed', needsRevalidation: false, data: null, error: null },
      5: { status: 'completed', needsRevalidation: false, data: null, error: null },
      6: { status: 'pending', needsRevalidation: false, data: null, error: null },
      7: { status: 'pending', needsRevalidation: false, data: null, error: null },
      8: { status: 'pending', needsRevalidation: false, data: null, error: null },
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

describe('Phase6Description', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Loading state', () => {
    it('shows loading spinner when no result yet', () => {
      const wizard = createMockWizard()
      render(<Phase6Description wizard={wizard} video={mockVideo} descriptionResult={null} />)
      expect(screen.getByText(/gerando descrição do vídeo/i)).toBeInTheDocument()
    })

    it('disables advance button when loading', () => {
      const wizard = createMockWizard()
      render(<Phase6Description wizard={wizard} video={mockVideo} descriptionResult={null} />)
      const button = screen.getByRole('button', { name: /avançar para tags/i })
      expect(button).toBeDisabled()
    })

    it('does not show loading state when in error state', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={null}
          error="Erro"
        />
      )
      expect(screen.queryByText(/gerando descrição do vídeo/i)).not.toBeInTheDocument()
    })
  })

  describe('Description display', () => {
    it('displays generated description in textarea', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )
      expect(screen.getByText('Descricao Gerada')).toBeInTheDocument()
      const textarea = screen.getByRole('textbox', { name: '' }) as HTMLTextAreaElement
      expect(textarea.value).toContain('Este episodio traz uma conversa incrivel')
    })

    it('shows character count for description', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )
      // 5000 - description length
      const expectedRemaining = 5000 - mockDescriptionWithData.description.length
      expect(screen.getByText(new RegExp(`${expectedRemaining} caracteres restantes`))).toBeInTheDocument()
    })

    it('shows additional context input', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )
      expect(screen.getByLabelText(/dica para nova descricao/i)).toBeInTheDocument()
    })

    it('shows revalidate button', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )
      expect(screen.getByRole('button', { name: /gerar nova descricao/i })).toBeInTheDocument()
    })
  })

  describe('Description editing', () => {
    it('allows editing the description', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )

      const textarea = screen.getByDisplayValue(/Este episodio traz/i) as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'Nova descricao editada' } })

      expect(textarea.value).toBe('Nova descricao editada')
    })

    it('calls onDescriptionChange after debounce', async () => {
      const wizard = createMockWizard()
      const onDescriptionChange = vi.fn()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
          onDescriptionChange={onDescriptionChange}
        />
      )

      const textarea = screen.getByDisplayValue(/Este episodio traz/i)
      fireEvent.change(textarea, { target: { value: 'Nova descricao' } })

      // Should not be called immediately
      expect(onDescriptionChange).not.toHaveBeenCalled()

      // Advance timer by debounce delay (1500ms)
      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      expect(onDescriptionChange).toHaveBeenCalledWith('Nova descricao')
    })

    it('updates character count as user types', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )

      const textarea = screen.getByDisplayValue(/Este episodio traz/i)
      fireEvent.change(textarea, { target: { value: 'Short' } })

      expect(screen.getByText(/4995 caracteres restantes/i)).toBeInTheDocument()
    })

    it('shows warning color when few characters remaining', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )

      const textarea = screen.getByDisplayValue(/Este episodio traz/i)
      // Type 4600 characters to leave only 400 remaining
      const longText = 'a'.repeat(4600)
      fireEvent.change(textarea, { target: { value: longText } })

      const charCount = screen.getByText(/400 caracteres restantes/i)
      expect(charCount).toHaveClass('text-amber-500')
    })
  })

  describe('Advance button', () => {
    it('enables advance button when description exists', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )
      const button = screen.getByRole('button', { name: /avançar para tags/i })
      expect(button).not.toBeDisabled()
    })

    it('disables advance button when description is empty', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={{ description: '' }}
        />
      )

      // Clear the textarea
      const textarea = screen.getByRole('textbox', { name: '' })
      fireEvent.change(textarea, { target: { value: '' } })

      const button = screen.getByRole('button', { name: /avançar para tags/i })
      expect(button).toBeDisabled()
    })

    it('calls completePhaseAndAdvance when advance is clicked', async () => {
      const wizard = createMockWizard()
      const onDescriptionChange = vi.fn().mockResolvedValue(undefined)
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
          onDescriptionChange={onDescriptionChange}
        />
      )

      const advanceButton = screen.getByRole('button', { name: /avançar para tags/i })

      // Use act to handle async state updates
      await act(async () => {
        fireEvent.click(advanceButton)
        // Allow async operations to complete
        await Promise.resolve()
      })

      // Verify onDescriptionChange was called to save before advancing
      expect(onDescriptionChange).toHaveBeenCalledWith(mockDescriptionWithData.description)
      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(6, {
        description: mockDescriptionWithData.description,
      })
    })

    it('advances even when save fails', async () => {
      const wizard = createMockWizard()
      const onDescriptionChange = vi.fn().mockRejectedValue(new Error('Save failed'))
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
          onDescriptionChange={onDescriptionChange}
        />
      )

      const advanceButton = screen.getByRole('button', { name: /avançar para tags/i })

      await act(async () => {
        fireEvent.click(advanceButton)
        await Promise.resolve()
      })

      // Should still advance even though save failed
      expect(onDescriptionChange).toHaveBeenCalledWith(mockDescriptionWithData.description)
      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(6, {
        description: mockDescriptionWithData.description,
      })
    })
  })

  describe('Revalidation', () => {
    it('shows confirmation dialog when revalidate is clicked', () => {
      const wizard = createMockWizard()
      const onRevalidate = vi.fn()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
          onRevalidate={onRevalidate}
        />
      )

      const revalidateButton = screen.getByRole('button', { name: /gerar nova descricao/i })
      fireEvent.click(revalidateButton)

      expect(screen.getByText(/gerar nova descricao\?/i)).toBeInTheDocument()
      expect(screen.getByText(/fase seguinte.*tags.*sera marcada/i)).toBeInTheDocument()
    })

    it('calls onRevalidate when confirmation is accepted', () => {
      const wizard = createMockWizard()
      const onRevalidate = vi.fn()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
          onRevalidate={onRevalidate}
        />
      )

      // Enter additional context
      const contextInput = screen.getByLabelText(/dica para nova descricao/i)
      fireEvent.change(contextInput, { target: { value: 'Mencione o patrocinador' } })

      // Click revalidate
      const revalidateButton = screen.getByRole('button', { name: /gerar nova descricao/i })
      fireEvent.click(revalidateButton)

      // Confirm in dialog
      const confirmButton = screen.getByRole('button', { name: /sim, gerar nova/i })
      fireEvent.click(confirmButton)

      expect(onRevalidate).toHaveBeenCalledWith('Mencione o patrocinador')
    })

    it('closes dialog when cancel is clicked', () => {
      const wizard = createMockWizard()
      const onRevalidate = vi.fn()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
          onRevalidate={onRevalidate}
        />
      )

      const revalidateButton = screen.getByRole('button', { name: /gerar nova descricao/i })
      fireEvent.click(revalidateButton)

      const cancelButton = screen.getByRole('button', { name: /cancelar/i })
      fireEvent.click(cancelButton)

      expect(onRevalidate).not.toHaveBeenCalled()
    })

    it('disables revalidate button when onRevalidate is not provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )

      const revalidateButton = screen.getByRole('button', { name: /gerar nova descricao/i })
      expect(revalidateButton).toBeDisabled()
    })
  })

  describe('Error state', () => {
    it('shows error card when error prop is provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={null}
          error="Erro ao conectar com o servidor"
        />
      )
      expect(screen.getByText(/erro na geracao de descricao/i)).toBeInTheDocument()
      expect(screen.getByText(/erro ao conectar com o servidor/i)).toBeInTheDocument()
    })

    it('shows retry button when onRetry is provided', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={null}
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
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={null}
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
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={null}
          error="Erro"
        />
      )
      const button = screen.getByRole('button', { name: /avançar para tags/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Pre-existing description from video', () => {
    it('uses description from result over video.description', () => {
      const wizard = createMockWizard()
      const videoWithDescription = { ...mockVideo, description: 'Descricao antiga do video' }
      render(
        <Phase6Description
          wizard={wizard}
          video={videoWithDescription}
          descriptionResult={mockDescriptionWithData}
        />
      )

      const textarea = screen.getByDisplayValue(/Este episodio traz/i)
      expect(textarea).toBeInTheDocument()
    })
  })

  describe('Multiline description', () => {
    it('preserves newlines in description textarea', () => {
      const wizard = createMockWizard()
      const multilineDescription: Phase6Response = {
        description: 'Linha 1\nLinha 2\nLinha 3',
      }
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={multilineDescription}
        />
      )

      const textarea = screen.getByRole('textbox', { name: '' }) as HTMLTextAreaElement
      expect(textarea.value).toBe('Linha 1\nLinha 2\nLinha 3')
      expect(textarea.value.split('\n')).toHaveLength(3)
    })

    it('allows adding newlines when editing', () => {
      const wizard = createMockWizard()
      render(
        <Phase6Description
          wizard={wizard}
          video={mockVideo}
          descriptionResult={mockDescriptionWithData}
        />
      )

      const textarea = screen.getByDisplayValue(/Este episodio traz/i) as HTMLTextAreaElement
      const newContent = 'Primeira linha\n\nSegunda linha com espaco\n\nTerceira linha'
      fireEvent.change(textarea, { target: { value: newContent } })

      expect(textarea.value).toBe(newContent)
      expect(textarea.value.split('\n')).toHaveLength(5)
    })
  })
})
