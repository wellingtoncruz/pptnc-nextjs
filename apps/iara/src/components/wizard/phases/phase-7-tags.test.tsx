import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test-utils'

import { Phase7Tags } from './phase-7-tags'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { Phase7Response } from '@/lib/llm/types'

// Mock video data
const mockVideo: Video = {
  id: 'test-video-123',
  podcastId: 'test-podcast',
  title: 'Test Video Title',
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

// Mock tags response
const mockTagsWithData: Phase7Response = {
  tags: [
    'podcast',
    'tecnologia',
    'inovacao',
    'entrevista',
    'empreendedorismo',
    'startups',
    'negocios',
    'marketing',
    'lideranca',
    'carreira',
  ],
}

const mockEmptyTags: Phase7Response = {
  tags: [],
}

// Create mock wizard
function createMockWizard(): UseWizardReturn {
  return {
    currentPhase: 7,
    phases: {
      1: { status: 'completed', needsRevalidation: false, data: null, error: null },
      2: { status: 'completed', needsRevalidation: false, data: null, error: null },
      3: { status: 'completed', needsRevalidation: false, data: null, error: null },
      4: { status: 'completed', needsRevalidation: false, data: null, error: null },
      5: { status: 'completed', needsRevalidation: false, data: null, error: null },
      6: { status: 'completed', needsRevalidation: false, data: null, error: null },
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

describe('Phase7Tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock fetch for TopicsSection (/api/topics)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { topics: [] } }),
    }) as unknown as typeof fetch
  })

  describe('Loading state', () => {
    it('shows loading spinner when no result yet', () => {
      const wizard = createMockWizard()
      render(<Phase7Tags wizard={wizard} video={mockVideo} tagsResult={null} />)
      expect(screen.getByText(/gerando tags otimizadas para SEO/i)).toBeInTheDocument()
    })

    it('disables advance button when loading', () => {
      const wizard = createMockWizard()
      render(<Phase7Tags wizard={wizard} video={mockVideo} tagsResult={null} />)
      const button = screen.getByRole('button', { name: /avançar para publicar/i })
      expect(button).toBeDisabled()
    })

    it('does not show loading state when in error state', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={null} error="Erro" />
      )
      expect(screen.queryByText(/gerando tags otimizadas para SEO/i)).not.toBeInTheDocument()
    })
  })

  describe('Tags display', () => {
    it('displays generated tags as badges', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={mockTagsWithData} />
      )
      expect(screen.getByText('Tags Geradas')).toBeInTheDocument()
      expect(screen.getByText('podcast')).toBeInTheDocument()
      expect(screen.getByText('tecnologia')).toBeInTheDocument()
      expect(screen.getByText('inovacao')).toBeInTheDocument()
    })

    it('shows character count', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={mockTagsWithData} />
      )
      // Total chars should be displayed
      expect(screen.getByText(/caracteres usados/i)).toBeInTheDocument()
    })

    it('shows additional context input', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={mockTagsWithData} />
      )
      expect(screen.getByLabelText(/dica para novas tags/i)).toBeInTheDocument()
    })

    it('shows revalidate button', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={mockTagsWithData} />
      )
      expect(screen.getByRole('button', { name: /gerar novas tags/i })).toBeInTheDocument()
    })

    it('shows add tag input', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={mockTagsWithData} />
      )
      expect(screen.getByPlaceholderText(/adicionar nova tag/i)).toBeInTheDocument()
    })
  })

  describe('Tag management', () => {
    it('allows adding a new tag', () => {
      const wizard = createMockWizard()
      const onTagsChange = vi.fn()
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      const input = screen.getByPlaceholderText(/adicionar nova tag/i)
      fireEvent.change(input, { target: { value: 'nova-tag' } })

      const addButton = screen.getByRole('button', { name: /adicionar/i })
      fireEvent.click(addButton)

      expect(onTagsChange).toHaveBeenCalledWith([...mockTagsWithData.tags, 'nova-tag'])
    })

    it('allows adding tag by pressing Enter', () => {
      const wizard = createMockWizard()
      const onTagsChange = vi.fn()
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      const input = screen.getByPlaceholderText(/adicionar nova tag/i)
      fireEvent.change(input, { target: { value: 'enter-tag' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onTagsChange).toHaveBeenCalledWith([...mockTagsWithData.tags, 'enter-tag'])
    })

    it('allows removing a tag', () => {
      const wizard = createMockWizard()
      const onTagsChange = vi.fn()
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      // Find remove button for 'podcast' tag
      const removeButton = screen.getByRole('button', { name: /remover tag podcast/i })
      fireEvent.click(removeButton)

      expect(onTagsChange).toHaveBeenCalledWith(
        mockTagsWithData.tags.filter((t) => t !== 'podcast')
      )
    })

    it('does not add duplicate tags', () => {
      const wizard = createMockWizard()
      const onTagsChange = vi.fn()
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      const input = screen.getByPlaceholderText(/adicionar nova tag/i)
      fireEvent.change(input, { target: { value: 'podcast' } }) // Already exists

      const addButton = screen.getByRole('button', { name: /adicionar/i })
      fireEvent.click(addButton)

      expect(onTagsChange).not.toHaveBeenCalled()
    })

    it('clears input after adding tag', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={vi.fn()}
        />
      )

      const input = screen.getByPlaceholderText(/adicionar nova tag/i) as HTMLInputElement
      fireEvent.change(input, { target: { value: 'nova-tag' } })

      const addButton = screen.getByRole('button', { name: /adicionar/i })
      fireEvent.click(addButton)

      expect(input.value).toBe('')
    })
  })

  describe('Advance button', () => {
    it('enables advance button when tags exist', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={mockTagsWithData} />
      )
      const button = screen.getByRole('button', { name: /avançar para publicar/i })
      expect(button).not.toBeDisabled()
    })

    it('disables advance button when no tags', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={mockEmptyTags} />
      )
      const button = screen.getByRole('button', { name: /avançar para publicar/i })
      expect(button).toBeDisabled()
    })

    it('calls completePhaseAndAdvance when advance is clicked', async () => {
      const wizard = createMockWizard()
      const onTagsChange = vi.fn().mockResolvedValue(undefined)
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      const advanceButton = screen.getByRole('button', { name: /avançar para publicar/i })
      fireEvent.click(advanceButton)

      // Wait for async operations to complete
      await waitFor(() => {
        expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(
          7,
          { tags: mockTagsWithData.tags },
          undefined // features prop not passed in this test
        )
      })

      // Verify onTagsChange was called to save before advancing
      expect(onTagsChange).toHaveBeenCalledWith(mockTagsWithData.tags)
    })

    it('advances even when save fails', async () => {
      const wizard = createMockWizard()
      const onTagsChange = vi.fn().mockRejectedValue(new Error('Save failed'))
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      const advanceButton = screen.getByRole('button', { name: /avançar para publicar/i })
      fireEvent.click(advanceButton)

      // Wait for async operations to complete
      await waitFor(() => {
        expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(
          7,
          { tags: mockTagsWithData.tags },
          undefined // features prop not passed in this test
        )
      })

      // Should still advance even though save failed
      expect(onTagsChange).toHaveBeenCalledWith(mockTagsWithData.tags)
    })

    it('forwards features to completePhaseAndAdvance so state machine routes to THUMB (Epic 22)', async () => {
      const wizard = createMockWizard()
      const onTagsChange = vi.fn().mockResolvedValue(undefined)
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
          features={{ thumbnailGeneration: true }}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /avançar para publicar/i }))

      // The third arg ensures the reducer uses getPhasesForVideoTypeWithFeatures
      // and routes 7 -> 'THUMB' instead of skipping straight to 8.
      await waitFor(() => {
        expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(
          7,
          { tags: mockTagsWithData.tags },
          { thumbnailGeneration: true }
        )
      })
    })
  })

  describe('Revalidation', () => {
    it('calls onRevalidate directly without dialog (last LLM phase)', () => {
      const wizard = createMockWizard()
      const onRevalidate = vi.fn()
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onRevalidate={onRevalidate}
        />
      )

      // Enter additional context
      const contextInput = screen.getByLabelText(/dica para novas tags/i)
      fireEvent.change(contextInput, { target: { value: 'Adicione tags em ingles' } })

      // Click revalidate - should call directly without dialog
      const revalidateButton = screen.getByRole('button', { name: /gerar novas tags/i })
      fireEvent.click(revalidateButton)

      expect(onRevalidate).toHaveBeenCalledWith('Adicione tags em ingles')
    })

    it('disables revalidate button when onRevalidate is not provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={mockTagsWithData} />
      )

      const revalidateButton = screen.getByRole('button', { name: /gerar novas tags/i })
      expect(revalidateButton).toBeDisabled()
    })
  })

  describe('Error state', () => {
    it('shows error card when error prop is provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={null}
          error="Erro ao conectar com o servidor"
        />
      )
      expect(screen.getByText(/erro na geracao de tags/i)).toBeInTheDocument()
      expect(screen.getByText(/erro ao conectar com o servidor/i)).toBeInTheDocument()
    })

    it('shows retry button when onRetry is provided', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={null}
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
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={null}
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
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={null} error="Erro" />
      )
      const button = screen.getByRole('button', { name: /avançar para publicar/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Empty tags state', () => {
    it('shows empty state message when no tags', () => {
      const wizard = createMockWizard()
      render(
        <Phase7Tags wizard={wizard} video={mockVideo} tagsResult={mockEmptyTags} />
      )
      expect(screen.getByText(/nenhuma tag adicionada ainda/i)).toBeInTheDocument()
    })
  })

  describe('Race condition prevention', () => {
    it('disables remove buttons while saving', async () => {
      const wizard = createMockWizard()
      // Create a promise that we control
      let resolvePromise: () => void
      const onTagsChange = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => { resolvePromise = resolve })
      )

      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      // Click remove on first tag
      const removeButton = screen.getByRole('button', { name: /remover tag podcast/i })
      fireEvent.click(removeButton)

      // All remove buttons should be disabled while saving
      await waitFor(() => {
        const allRemoveButtons = screen.getAllByRole('button', { name: /remover tag/i })
        allRemoveButtons.forEach((btn) => {
          expect(btn).toBeDisabled()
        })
      })

      // Resolve the save
      resolvePromise!()

      // After save completes, buttons should be enabled again
      await waitFor(() => {
        const allRemoveButtons = screen.getAllByRole('button', { name: /remover tag/i })
        allRemoveButtons.forEach((btn) => {
          expect(btn).not.toBeDisabled()
        })
      })
    })

    it('disables add input and button while saving', async () => {
      const wizard = createMockWizard()
      let resolvePromise: () => void
      const onTagsChange = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => { resolvePromise = resolve })
      )

      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      // Add a tag
      const input = screen.getByPlaceholderText(/adicionar nova tag/i)
      fireEvent.change(input, { target: { value: 'new-tag' } })
      const addButton = screen.getByRole('button', { name: /adicionar/i })
      fireEvent.click(addButton)

      // Input and button should be disabled while saving
      await waitFor(() => {
        expect(input).toBeDisabled()
        expect(addButton).toBeDisabled()
      })

      // Resolve the save
      resolvePromise!()

      // After save completes, input and button should be enabled again
      await waitFor(() => {
        expect(input).not.toBeDisabled()
      })
    })

    it('rolls back tag removal on error', async () => {
      const wizard = createMockWizard()
      const onTagsChange = vi.fn().mockRejectedValue(new Error('Network error'))

      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      // Verify podcast tag exists initially
      expect(screen.getByText('podcast')).toBeInTheDocument()

      // Click remove
      const removeButton = screen.getByRole('button', { name: /remover tag podcast/i })
      fireEvent.click(removeButton)

      // Wait for the error and rollback
      await waitFor(() => {
        // Tag should be restored after error
        expect(screen.getByText('podcast')).toBeInTheDocument()
      })
    })

    it('rolls back tag addition on error', async () => {
      const wizard = createMockWizard()
      const onTagsChange = vi.fn().mockRejectedValue(new Error('Network error'))

      render(
        <Phase7Tags
          wizard={wizard}
          video={mockVideo}
          tagsResult={mockTagsWithData}
          onTagsChange={onTagsChange}
        />
      )

      // Add a new tag
      const input = screen.getByPlaceholderText(/adicionar nova tag/i)
      fireEvent.change(input, { target: { value: 'failing-tag' } })
      const addButton = screen.getByRole('button', { name: /adicionar/i })
      fireEvent.click(addButton)

      // Wait for the error and rollback
      await waitFor(() => {
        // New tag should NOT be in the document after rollback
        expect(screen.queryByText('failing-tag')).not.toBeInTheDocument()
      })
    })
  })

  describe('Character limit', () => {
    it('shows warning color when approaching character limit', () => {
      const wizard = createMockWizard()
      // Create tags that total close to 500 chars (460+ chars)
      // Each tag is ~10 chars, with commas it adds up quickly
      const tagsNearLimit: Phase7Response = {
        tags: Array(55).fill(null).map((_, i) => `longtag${i.toString().padStart(2, '0')}`),
      }
      // Verify we're close to 500: 55 tags * ~9 chars each + 54 commas = ~549 chars
      // This should trigger the warning color (< 50 remaining)
      render(<Phase7Tags wizard={wizard} video={mockVideo} tagsResult={tagsNearLimit} />)

      // Character count should show warning color when close to limit
      const charCount = screen.getByText(/caracteres usados/i)
      expect(charCount).toBeInTheDocument()
      expect(charCount).toHaveClass('text-amber-500')
    })

    it('shows normal color when far from character limit', () => {
      const wizard = createMockWizard()
      // Create tags with plenty of room (only ~100 chars)
      const fewTags: Phase7Response = {
        tags: ['podcast', 'tecnologia', 'inovacao', 'entrevista'],
      }
      render(<Phase7Tags wizard={wizard} video={mockVideo} tagsResult={fewTags} />)

      const charCount = screen.getByText(/caracteres usados/i)
      expect(charCount).toBeInTheDocument()
      expect(charCount).not.toHaveClass('text-amber-500')
    })
  })
})
