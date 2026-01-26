import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, render, screen, waitFor } from '@/test-utils'
import { DEFAULT_PERSONAS } from '@/lib/schemas'
import type { Persona } from '@/types/podcast'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { PersonasSettingsForm } from './personas-settings-form'

describe('PersonasSettingsForm', () => {
  const mockOnSavePersona = vi.fn<(personaKey: 'critic' | 'writer', value: Persona) => Promise<void>>()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockOnSavePersona.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders card with title', () => {
    render(
      <PersonasSettingsForm personas={DEFAULT_PERSONAS} onSavePersona={mockOnSavePersona} />
    )

    expect(screen.getByText('Personas do LLM')).toBeInTheDocument()
  })

  it('renders both persona editors with correct labels', () => {
    render(
      <PersonasSettingsForm personas={DEFAULT_PERSONAS} onSavePersona={mockOnSavePersona} />
    )

    expect(screen.getByText('Crítico')).toBeInTheDocument()
    expect(screen.getByText('Redator')).toBeInTheDocument()
  })

  it('renders input fields for both personas', () => {
    render(
      <PersonasSettingsForm personas={DEFAULT_PERSONAS} onSavePersona={mockOnSavePersona} />
    )

    // Should have 2 'Papel' inputs (one for each persona)
    const roleInputs = screen.getAllByLabelText('Papel')
    expect(roleInputs).toHaveLength(2)

    // Should have 2 'Objetivo' textareas
    const objectiveTextareas = screen.getAllByLabelText('Objetivo')
    expect(objectiveTextareas).toHaveLength(2)

    // Should have 2 'Resumo / Contexto' textareas
    const resumeTextareas = screen.getAllByLabelText('Resumo / Contexto')
    expect(resumeTextareas).toHaveLength(2)
  })

  it('calls onSavePersona with correct personaKey when critic is updated', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PersonasSettingsForm personas={DEFAULT_PERSONAS} onSavePersona={mockOnSavePersona} />
    )

    // Get the first 'Papel' input (critic)
    const roleInputs = screen.getAllByLabelText('Papel')
    await user.clear(roleInputs[0])
    await user.type(roleInputs[0], 'New critic role')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePersona).toHaveBeenCalledWith(
        'critic',
        expect.objectContaining({ role: 'New critic role' })
      )
    })
  })

  it('calls onSavePersona with correct personaKey when writer is updated', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PersonasSettingsForm personas={DEFAULT_PERSONAS} onSavePersona={mockOnSavePersona} />
    )

    // Get the second 'Papel' input (writer)
    const roleInputs = screen.getAllByLabelText('Papel')
    await user.clear(roleInputs[1])
    await user.type(roleInputs[1], 'New writer role')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePersona).toHaveBeenCalledWith(
        'writer',
        expect.objectContaining({ role: 'New writer role' })
      )
    })
  })
})
