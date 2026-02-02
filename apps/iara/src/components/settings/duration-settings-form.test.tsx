import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, waitFor } from '@/test-utils'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { DurationSettingsForm } from './duration-settings-form'

const defaultVideoTypes = {
  episode: { minDuration: 1200, maxDuration: null },
  cut: { minDuration: 180, maxDuration: 1199 },
  reel: { minDuration: 0, maxDuration: 179 },
}

describe('DurationSettingsForm', () => {
  const mockOnSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockOnSave.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders all three video type sections', () => {
    // Note: Title "Duração por Tipo de Vídeo" is now rendered by parent AccordionTrigger
    // in settings-page-client.tsx (Story 8.2 refactor)
    render(
      <DurationSettingsForm videoTypes={defaultVideoTypes} onSave={mockOnSave} />
    )

    expect(screen.getByText('Reels')).toBeInTheDocument()
    expect(screen.getByText('Cortes')).toBeInTheDocument()
    expect(screen.getByText('Episódios')).toBeInTheDocument()
  })

  it('displays duration values in seconds', () => {
    render(
      <DurationSettingsForm videoTypes={defaultVideoTypes} onSave={mockOnSave} />
    )

    // Values should be displayed in seconds (matching video schema)
    expect(screen.getByLabelText('Duração máxima de Reels em segundos')).toHaveValue(179)
    expect(screen.getByLabelText('Duração mínima de Cortes em segundos')).toHaveValue(180)
    expect(screen.getByLabelText('Duração máxima de Cortes em segundos')).toHaveValue(1199)
    expect(screen.getByLabelText('Duração mínima de Episódios em segundos')).toHaveValue(1200)
  })

  it('calls onSave with updated values in seconds', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <DurationSettingsForm videoTypes={defaultVideoTypes} onSave={mockOnSave} />
    )

    const episodeMinInput = screen.getByLabelText('Duração mínima de Episódios em segundos')
    await user.clear(episodeMinInput)
    await user.type(episodeMinInput, '1500')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
        episode: { minDuration: 1500, maxDuration: null },
      }))
    })
  })

  it('triggers save on blur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <DurationSettingsForm videoTypes={defaultVideoTypes} onSave={mockOnSave} />
    )

    // Use a valid value (< cut min 180s) to avoid validation error
    const reelMaxInput = screen.getByLabelText('Duração máxima de Reels em segundos')
    await user.clear(reelMaxInput)
    await user.type(reelMaxInput, '120')

    await act(async () => {
      fireEvent.blur(reelMaxInput)
    })

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled()
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
      <DurationSettingsForm videoTypes={defaultVideoTypes} onSave={mockOnSave} />
    )

    const episodeMinInput = screen.getByLabelText('Duração mínima de Episódios em segundos')
    await user.clear(episodeMinInput)
    await user.type(episodeMinInput, '1800')

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

  it('shows validation error for overlapping values (reel max >= cut min)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <DurationSettingsForm videoTypes={defaultVideoTypes} onSave={mockOnSave} />
    )

    // Set reel max to 300s, which is >= cut min (180s)
    const reelMaxInput = screen.getByLabelText('Duração máxima de Reels em segundos')
    await user.clear(reelMaxInput)
    await user.type(reelMaxInput, '300')

    await act(async () => {
      fireEvent.blur(reelMaxInput)
    })

    await waitFor(() => {
      expect(screen.getByText(/Reel max deve ser menor que Cut min/)).toBeInTheDocument()
    })

    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('shows validation error for overlapping values (cut max >= episode min)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <DurationSettingsForm videoTypes={defaultVideoTypes} onSave={mockOnSave} />
    )

    // Set cut max to 1500s, which is >= episode min (1200s)
    const cutMaxInput = screen.getByLabelText('Duração máxima de Cortes em segundos')
    await user.clear(cutMaxInput)
    await user.type(cutMaxInput, '1500')

    await act(async () => {
      fireEvent.blur(cutMaxInput)
    })

    await waitFor(() => {
      expect(screen.getByText(/Cut max deve ser menor que Episode min/)).toBeInTheDocument()
    })

    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('shows error message when save fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockOnSave.mockRejectedValue(new Error('Network error'))

    render(
      <DurationSettingsForm videoTypes={defaultVideoTypes} onSave={mockOnSave} />
    )

    const episodeMinInput = screen.getByLabelText('Duração mínima de Episódios em segundos')
    await user.clear(episodeMinInput)
    await user.type(episodeMinInput, '1800')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('renders description text', () => {
    render(
      <DurationSettingsForm videoTypes={defaultVideoTypes} onSave={mockOnSave} />
    )

    expect(screen.getByText(/Defina os limites de duração/)).toBeInTheDocument()
  })
})
