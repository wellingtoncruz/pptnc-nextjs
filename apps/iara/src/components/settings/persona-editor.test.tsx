import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, waitFor } from '@/test-utils'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { PersonaEditor } from './persona-editor'

const defaultValue = {
  role: 'Test role',
  objective: 'Test objective',
  resume: 'Test resume',
}

describe('PersonaEditor', () => {
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
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    expect(screen.getByText('Crítico')).toBeInTheDocument()
    expect(screen.getByLabelText('Papel')).toHaveValue('Test role')
    expect(screen.getByLabelText('Objetivo')).toHaveValue('Test objective')
    expect(screen.getByLabelText('Resumo / Contexto')).toHaveValue('Test resume')
  })

  it('displays character counters for all fields', () => {
    render(
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    // 'Test role' has 9 chars, 'Test objective' has 14, 'Test resume' has 11
    expect(screen.getByText('9 / 1000')).toBeInTheDocument()
    expect(screen.getByText('14 / 2000')).toBeInTheDocument()
    expect(screen.getByText('11 / 5000')).toBeInTheDocument()
  })

  it('triggers auto-save after 1.5s debounce', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const roleInput = screen.getByLabelText('Papel')
    await user.clear(roleInput)
    await user.type(roleInput, 'New role')

    expect(mockOnSave).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({
        role: 'New role',
        objective: 'Test objective',
        resume: 'Test resume',
      })
    })
  })

  it('triggers immediate save on blur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const objectiveTextarea = screen.getByLabelText('Objetivo')
    await user.clear(objectiveTextarea)
    await user.type(objectiveTextarea, 'New objective')

    await act(async () => {
      fireEvent.blur(objectiveTextarea)
    })

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({
        role: 'Test role',
        objective: 'New objective',
        resume: 'Test resume',
      })
    })
  })

  it('shows validation error for role exceeding max length', async () => {
    const tooLong = 'a'.repeat(1001)

    render(
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const roleInput = screen.getByLabelText('Papel')
    fireEvent.change(roleInput, { target: { value: tooLong } })

    await act(async () => {
      fireEvent.blur(roleInput)
    })

    await waitFor(() => {
      expect(screen.getByText(/Papel deve ter no máximo 1000 caracteres/)).toBeInTheDocument()
    })

    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('shows validation error for objective exceeding max length', async () => {
    const tooLong = 'a'.repeat(2001)

    render(
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const objectiveTextarea = screen.getByLabelText('Objetivo')
    fireEvent.change(objectiveTextarea, { target: { value: tooLong } })

    await act(async () => {
      fireEvent.blur(objectiveTextarea)
    })

    await waitFor(() => {
      expect(screen.getByText(/Objetivo deve ter no máximo 2000 caracteres/)).toBeInTheDocument()
    })

    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('shows validation error for resume exceeding max length', async () => {
    const tooLong = 'a'.repeat(5001)

    render(
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const resumeTextarea = screen.getByLabelText('Resumo / Contexto')
    fireEvent.change(resumeTextarea, { target: { value: tooLong } })

    await act(async () => {
      fireEvent.blur(resumeTextarea)
    })

    await waitFor(() => {
      expect(screen.getByText(/Resumo deve ter no máximo 5000 caracteres/)).toBeInTheDocument()
    })

    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('highlights character counter when over limit', async () => {
    const tooLong = 'a'.repeat(1001)

    render(
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const roleInput = screen.getByLabelText('Papel')
    fireEvent.change(roleInput, { target: { value: tooLong } })

    const counter = screen.getByText('1001 / 1000')
    expect(counter).toHaveClass('text-destructive')
  })

  it('shows error message when save fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockOnSave.mockRejectedValue(new Error('Network error'))

    render(
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const roleInput = screen.getByLabelText('Papel')
    await user.clear(roleInput)
    await user.type(roleInput, 'Will fail')

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
      <PersonaEditor
        personaKey="critic"
        label="Crítico"
        initialValue={defaultValue}
        onSave={mockOnSave}
      />
    )

    const roleInput = screen.getByLabelText('Papel')
    await user.clear(roleInput)
    await user.type(roleInput, 'Test')

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
