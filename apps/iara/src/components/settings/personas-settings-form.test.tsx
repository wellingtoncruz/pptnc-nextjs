import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, render, screen, waitFor } from '@/test-utils'
import { DEFAULT_PERSONAS } from '@/lib/schemas'
import type { Persona, PersonaKey, Personas } from '@/types/podcast'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { PersonasSettingsForm } from './personas-settings-form'

describe('PersonasSettingsForm', () => {
  const mockOnSavePersona = vi.fn<(personaKey: PersonaKey, value: Persona) => Promise<void>>()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockOnSavePersona.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders all persona editors with correct labels', () => {
    // Note: Title "Personas do LLM" is now rendered by parent AccordionTrigger
    // in settings-page-client.tsx (Story 8.2 refactor)
    render(
      <PersonasSettingsForm personas={DEFAULT_PERSONAS} onSavePersona={mockOnSavePersona} />
    )

    expect(screen.getByText('Crítico')).toBeInTheDocument()
    expect(screen.getByText('Redator')).toBeInTheDocument()
    expect(screen.getByText('Gerente de Mídia')).toBeInTheDocument()
    expect(screen.getByText('Especialista em AdWords')).toBeInTheDocument()
  })

  it('renders input fields for all personas', () => {
    render(
      <PersonasSettingsForm personas={DEFAULT_PERSONAS} onSavePersona={mockOnSavePersona} />
    )

    // Should have 4 'Papel' inputs (one for each persona)
    const roleInputs = screen.getAllByLabelText('Papel')
    expect(roleInputs).toHaveLength(4)

    // Should have 4 'Objetivo' textareas
    const objectiveTextareas = screen.getAllByLabelText('Objetivo')
    expect(objectiveTextareas).toHaveLength(4)

    // Should have 4 'Resumo / Contexto' textareas
    const resumeTextareas = screen.getAllByLabelText('Resumo / Contexto')
    expect(resumeTextareas).toHaveLength(4)
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

  it('renders socialmedia with empty fields when persona is undefined (backward-compat)', () => {
    const personasWithoutOptionals = {
      critic: DEFAULT_PERSONAS.critic,
      writer: DEFAULT_PERSONAS.writer,
    } as Personas

    render(
      <PersonasSettingsForm personas={personasWithoutOptionals} onSavePersona={mockOnSavePersona} />
    )

    // Should still render all 4 personas — optional ones fall back to DEFAULT_PERSONA
    expect(screen.getByText('Gerente de Mídia')).toBeInTheDocument()
    expect(screen.getByText('Especialista em AdWords')).toBeInTheDocument()
    const roleInputs = screen.getAllByLabelText('Papel')
    expect(roleInputs).toHaveLength(4)
    // The socialmedia role input should be empty (fallback)
    expect(roleInputs[2]).toHaveValue('')
    // The adwords role input should be empty (fallback)
    expect(roleInputs[3]).toHaveValue('')
  })

  it('calls onSavePersona with correct personaKey when socialmedia is updated', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PersonasSettingsForm personas={DEFAULT_PERSONAS} onSavePersona={mockOnSavePersona} />
    )

    // Get the third 'Papel' input (socialmedia)
    const roleInputs = screen.getAllByLabelText('Papel')
    await user.clear(roleInputs[2])
    await user.type(roleInputs[2], 'Social media manager')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePersona).toHaveBeenCalledWith(
        'socialmedia',
        expect.objectContaining({ role: 'Social media manager' })
      )
    })
  })

  it('calls onSavePersona with correct personaKey when adwords is updated', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PersonasSettingsForm personas={DEFAULT_PERSONAS} onSavePersona={mockOnSavePersona} />
    )

    // Get the fourth 'Papel' input (adwords)
    const roleInputs = screen.getAllByLabelText('Papel')
    await user.clear(roleInputs[3])
    await user.type(roleInputs[3], 'AdWords specialist')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePersona).toHaveBeenCalledWith(
        'adwords',
        expect.objectContaining({ role: 'AdWords specialist' })
      )
    })
  })
})
