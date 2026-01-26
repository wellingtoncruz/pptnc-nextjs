import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, waitFor } from '@/test-utils'
import { MAX_PROMPT_LENGTH } from '@/lib/schemas/podcast'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { PromptFieldEditor } from './prompt-field-editor'

const defaultValue = {
  description: 'Test description',
  expectedOutput: 'Test expected output',
}

describe('PromptFieldEditor', () => {
  const mockOnSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockOnSave.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders with label and initial values', () => {
    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    expect(screen.getByText('Crítica')).toBeInTheDocument()
    expect(screen.getByLabelText('Descrição do Prompt')).toHaveValue('Test description')
    expect(screen.getByLabelText('Saída Esperada')).toHaveValue('Test expected output')
  })

  it('displays character counters for both fields', () => {
    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    // 'Test description' has 16 chars, 'Test expected output' has 20 chars
    expect(screen.getByText(`16 / ${MAX_PROMPT_LENGTH}`)).toBeInTheDocument()
    expect(screen.getByText(`20 / ${MAX_PROMPT_LENGTH}`)).toBeInTheDocument()
  })

  it('triggers auto-save after 1.5s debounce', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const descriptionTextarea = screen.getByLabelText('Descrição do Prompt')
    await user.clear(descriptionTextarea)
    await user.type(descriptionTextarea, 'New description')

    expect(mockOnSave).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({
        description: 'New description',
        expectedOutput: 'Test expected output',
      })
    })
  })

  it('triggers immediate save on blur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const descriptionTextarea = screen.getByLabelText('Descrição do Prompt')
    await user.clear(descriptionTextarea)
    await user.type(descriptionTextarea, 'Blur test')

    await act(async () => {
      fireEvent.blur(descriptionTextarea)
    })

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({
        description: 'Blur test',
        expectedOutput: 'Test expected output',
      })
    })
  })

  it('saves both fields when expectedOutput is changed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const outputTextarea = screen.getByLabelText('Saída Esperada')
    await user.clear(outputTextarea)
    await user.type(outputTextarea, 'New output')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({
        description: 'Test description',
        expectedOutput: 'New output',
      })
    })
  })

  it('shows validation error for description exceeding max length', async () => {
    const tooLong = 'a'.repeat(MAX_PROMPT_LENGTH + 1)

    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const descriptionTextarea = screen.getByLabelText('Descrição do Prompt')
    fireEvent.change(descriptionTextarea, { target: { value: tooLong } })

    await act(async () => {
      fireEvent.blur(descriptionTextarea)
    })

    await waitFor(() => {
      expect(screen.getByText(/Campo deve ter no máximo 10000 caracteres/)).toBeInTheDocument()
    })

    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('shows validation error for expectedOutput exceeding max length', async () => {
    const tooLong = 'a'.repeat(MAX_PROMPT_LENGTH + 1)

    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const outputTextarea = screen.getByLabelText('Saída Esperada')
    fireEvent.change(outputTextarea, { target: { value: tooLong } })

    await act(async () => {
      fireEvent.blur(outputTextarea)
    })

    await waitFor(() => {
      expect(screen.getByText(/Campo deve ter no máximo 10000 caracteres/)).toBeInTheDocument()
    })

    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('highlights character counter when over limit', async () => {
    const tooLong = 'a'.repeat(MAX_PROMPT_LENGTH + 1)

    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const descriptionTextarea = screen.getByLabelText('Descrição do Prompt')
    fireEvent.change(descriptionTextarea, { target: { value: tooLong } })

    const counter = screen.getByText(new RegExp(`${MAX_PROMPT_LENGTH + 1} / ${MAX_PROMPT_LENGTH}`))
    expect(counter).toHaveClass('text-destructive')
  })

  it('shows error message when save fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockOnSave.mockRejectedValue(new Error('Network error'))

    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const descriptionTextarea = screen.getByLabelText('Descrição do Prompt')
    await user.clear(descriptionTextarea)
    await user.type(descriptionTextarea, 'Will fail')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('shows "Alterações pendentes..." then "Salvando..." during save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    let resolvePromise: () => void
    mockOnSave.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = () => resolve(undefined)
        })
    )

    render(
      <PromptFieldEditor
        fieldKey="episode-critique"
        label="Crítica"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const descriptionTextarea = screen.getByLabelText('Descrição do Prompt')
    await user.clear(descriptionTextarea)
    await user.type(descriptionTextarea, 'Test')

    // Should show pending immediately after change
    await waitFor(() => {
      expect(screen.getByText('Alterações pendentes...')).toBeInTheDocument()
    })

    // Advance past debounce to trigger save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    // Should show saving during save
    await waitFor(() => {
      expect(screen.getByText('Salvando...')).toBeInTheDocument()
    })

    await act(async () => {
      resolvePromise!()
    })

    await waitFor(() => {
      expect(screen.getByText('Salvo')).toBeInTheDocument()
    })
  })
})
