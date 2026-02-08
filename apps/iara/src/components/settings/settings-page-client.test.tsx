import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, render, screen, waitFor } from '@/test-utils'
import { DEFAULT_PROMPTS, DEFAULT_PERSONAS } from '@/lib/schemas'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { SettingsPageClient } from './settings-page-client'

const mockPodcast = {
  id: 'podcast-1',
  name: 'Test Podcast',
  channelId: 'UC123',
  ownerId: 'user-1',
  prompts: DEFAULT_PROMPTS,
  personas: DEFAULT_PERSONAS,
  videoTypes: {
    episode: { minDuration: 1200, maxDuration: null },
    cut: { minDuration: 180, maxDuration: 1199 },
    reel: { minDuration: 0, maxDuration: 179 },
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

describe('SettingsPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { success: true } }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders all four settings forms', () => {
    render(<SettingsPageClient podcast={mockPodcast} />)

    // PodcastSettingsForm
    expect(screen.getByText('Informações do Podcast')).toBeInTheDocument()

    // DurationSettingsForm
    expect(screen.getByText('Duração por Tipo de Vídeo')).toBeInTheDocument()

    // PersonasSettingsForm
    expect(screen.getByText('Personas do LLM')).toBeInTheDocument()

    // PromptsSettingsForm
    expect(screen.getByText('Prompts por Tipo de Vídeo')).toBeInTheDocument()
  })

  it('calls API when prompt field is saved', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<SettingsPageClient podcast={mockPodcast} />)

    // Open the Prompts accordion section first (collapsed by default)
    await user.click(screen.getByText('Prompts por Tipo de Vídeo'))

    // Find the accordion trigger in PromptsSettingsForm
    const accordionTriggers = screen.getAllByText('Episódios')
    await user.click(accordionTriggers[0])

    // Find the first 'Descrição do Prompt' textarea (for critique field)
    const descriptionTextareas = await screen.findAllByLabelText('Descrição do Prompt')
    await user.clear(descriptionTextareas[0])
    await user.type(descriptionTextareas[0], 'New critique description')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/podcast',
        expect.objectContaining({
          method: 'PATCH',
        })
      )
    })

    // Verify the body contains the updated prompts structure
    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(fetchCall[1]?.body as string)
    expect(body.prompts.episode.critique.description).toBe('New critique description')
  })

  it('calls API when duration settings are saved', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<SettingsPageClient podcast={mockPodcast} />)

    // Open the Duration accordion section first (collapsed by default)
    await user.click(screen.getByText('Duração por Tipo de Vídeo'))

    const episodeMinInput = screen.getByLabelText('Duração mínima de Episódios em segundos')
    await user.clear(episodeMinInput)
    await user.type(episodeMinInput, '1500')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    // Values are now stored directly in seconds without conversion
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/podcast',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            videoTypes: {
              episode: { minDuration: 1500, maxDuration: null },
              cut: { minDuration: 180, maxDuration: 1199 },
              reel: { minDuration: 0, maxDuration: 179 },
            },
          }),
        })
      )
    })
  })

  it('shows error when API call fails for prompt field', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    render(<SettingsPageClient podcast={mockPodcast} />)

    // Open the Prompts accordion section first (collapsed by default)
    await user.click(screen.getByText('Prompts por Tipo de Vídeo'))

    // Find the accordion trigger in PromptsSettingsForm
    const accordionTriggers = screen.getAllByText('Episódios')
    await user.click(accordionTriggers[0])

    const descriptionTextareas = await screen.findAllByLabelText('Descrição do Prompt')
    await user.clear(descriptionTextareas[0])
    await user.type(descriptionTextareas[0], 'New prompt')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('shows error when API call fails for duration settings', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Duration error' } }),
    })

    render(<SettingsPageClient podcast={mockPodcast} />)

    // Open the Duration accordion section first (collapsed by default)
    await user.click(screen.getByText('Duração por Tipo de Vídeo'))

    const episodeMinInput = screen.getByLabelText('Duração mínima de Episódios em segundos')
    await user.clear(episodeMinInput)
    await user.type(episodeMinInput, '1500')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('Duration error')).toBeInTheDocument()
    })
  })
})
