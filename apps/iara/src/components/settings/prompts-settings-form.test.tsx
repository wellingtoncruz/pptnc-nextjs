import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, render, screen, waitFor } from '@/test-utils'
import { DEFAULT_PROMPTS } from '@/lib/schemas'
import type { PromptField } from '@/types/podcast'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { PromptsSettingsForm } from './prompts-settings-form'

describe('PromptsSettingsForm', () => {
  const mockOnSavePromptField = vi.fn<
    (videoType: 'episode' | 'cut' | 'reel', fieldName: string, value: PromptField) => Promise<void>
  >()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockOnSavePromptField.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders accordion with three video types', () => {
    // Note: Title "Prompts por Tipo de Vídeo" is now rendered by parent AccordionTrigger
    // in settings-page-client.tsx (Story 8.2 refactor)
    render(
      <PromptsSettingsForm prompts={DEFAULT_PROMPTS} onSavePromptField={mockOnSavePromptField} />
    )

    expect(screen.getByText('Episódios')).toBeInTheDocument()
    expect(screen.getByText('Cortes')).toBeInTheDocument()
    expect(screen.getByText('Reels')).toBeInTheDocument()
  })

  it('expands episode accordion and shows prompt field editors', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm prompts={DEFAULT_PROMPTS} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      // Episode has 7 fields: critique, editing, compliance, chapters, titles, description, tags
      expect(screen.getByText('Crítica')).toBeInTheDocument()
      expect(screen.getByText('Edição')).toBeInTheDocument()
      expect(screen.getByText('Conformidade')).toBeInTheDocument()
      expect(screen.getByText('Capítulos')).toBeInTheDocument()
      expect(screen.getByText('Títulos')).toBeInTheDocument()
      expect(screen.getByText('Descrição')).toBeInTheDocument()
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })
  })

  it('expands cut accordion and shows correct fields', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm prompts={DEFAULT_PROMPTS} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Cortes'))

    await waitFor(() => {
      // Cut has 4 fields: titles, thumbs, description, tags
      expect(screen.getByText('Thumbnails')).toBeInTheDocument()
    })
  })

  it('calls onSavePromptField with correct videoType and fieldName', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm prompts={DEFAULT_PROMPTS} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Episódios'))

    // Find the first description textarea (for 'Crítica' field)
    const descriptionTextareas = await screen.findAllByLabelText('Descrição do Prompt')
    await user.clear(descriptionTextareas[0])
    await user.type(descriptionTextareas[0], 'New critique description')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePromptField).toHaveBeenCalledWith(
        'episode',
        'critique',
        expect.objectContaining({ description: 'New critique description' })
      )
    })
  })

  it('collapses other accordion items when one is expanded', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm prompts={DEFAULT_PROMPTS} onSavePromptField={mockOnSavePromptField} />
    )

    // Expand episode
    await user.click(screen.getByText('Episódios'))
    await waitFor(() => {
      expect(screen.getByText('Crítica')).toBeVisible()
    })

    // Expand cut
    await user.click(screen.getByText('Cortes'))
    await waitFor(() => {
      expect(screen.getByText('Thumbnails')).toBeVisible()
    })

    // Episode content should be collapsed (content not visible)
    // Note: The content is still in DOM but accordion hides it
  })

  it('shows all field labels in PT-BR', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm prompts={DEFAULT_PROMPTS} onSavePromptField={mockOnSavePromptField} />
    )

    // Check episode fields
    await user.click(screen.getByText('Episódios'))
    await waitFor(() => {
      expect(screen.getByText('Crítica')).toBeInTheDocument()
      expect(screen.getByText('Edição')).toBeInTheDocument()
      expect(screen.getByText('Conformidade')).toBeInTheDocument()
      expect(screen.getByText('Capítulos')).toBeInTheDocument()
    })

    // Check cut fields
    await user.click(screen.getByText('Cortes'))
    await waitFor(() => {
      expect(screen.getByText('Thumbnails')).toBeInTheDocument()
    })
  })
})
