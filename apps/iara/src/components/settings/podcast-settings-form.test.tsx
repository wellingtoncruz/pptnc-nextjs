import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, waitFor } from '@/test-utils'

import type { SerializedPodcast } from '@/types/podcast'

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { PodcastSettingsForm } from './podcast-settings-form'

// Create a mock podcast fixture (serialized format with ISO strings)
const createPodcastFixture = (overrides?: Partial<SerializedPodcast>): SerializedPodcast => ({
  id: 'test-podcast',
  name: 'Test Podcast',
  channelId: 'UC123456',
  ownerId: 'user123',
  prompts: {
    episode: 'Episode prompt',
    cut: 'Cut prompt',
    reel: 'Reel prompt',
  },
  videoTypes: {
    episode: { minDuration: 1200, maxDuration: null },
    cut: { minDuration: 180, maxDuration: 1199 },
    reel: { minDuration: 0, maxDuration: 179 },
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

describe('PodcastSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Default mock for successful API response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { success: true } }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders podcast name in input', () => {
    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const nameInput = screen.getByLabelText('Nome do Podcast')
    expect(nameInput).toHaveValue('Test Podcast')
  })

  it('renders channel ID as editable', () => {
    const podcast = createPodcastFixture({ channelId: 'UC987654' })
    render(<PodcastSettingsForm podcast={podcast} />)

    const channelIdInput = screen.getByLabelText('Channel ID do YouTube')
    expect(channelIdInput).toHaveValue('UC987654')
    expect(channelIdInput).not.toBeDisabled()
  })

  it('renders owner ID as disabled', () => {
    const podcast = createPodcastFixture({ ownerId: 'owner-xyz' })
    render(<PodcastSettingsForm podcast={podcast} />)

    const ownerIdInput = screen.getByLabelText('Owner ID')
    expect(ownerIdInput).toHaveValue('owner-xyz')
    expect(ownerIdInput).toBeDisabled()
  })

  it('shows "Alterações pendentes..." then "Salvando..." status during save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    let resolveUpdate: () => void
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = () => resolve({
            ok: true,
            json: () => Promise.resolve({ data: { success: true } }),
          })
        })
    )

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const nameInput = screen.getByLabelText('Nome do Podcast')
    await user.clear(nameInput)
    await user.type(nameInput, 'New Name')

    // Should show pending immediately after change
    await waitFor(() => {
      expect(screen.getByText('Alterações pendentes...')).toBeInTheDocument()
    })

    // Advance timers to trigger debounced save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('Salvando...')).toBeInTheDocument()
    })

    // Complete the save
    await act(async () => {
      resolveUpdate!()
    })

    await waitFor(() => {
      expect(screen.getByText('Salvo')).toBeInTheDocument()
    })
  })

  it('shows "Salvo" status after successful save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const nameInput = screen.getByLabelText('Nome do Podcast')
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Name')

    // Advance timers to trigger debounced save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('Salvo')).toBeInTheDocument()
    })
  })

  it('shows error message when save fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Network error' } }),
    })

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const nameInput = screen.getByLabelText('Nome do Podcast')
    await user.clear(nameInput)
    await user.type(nameInput, 'Will Fail')

    // Advance timers to trigger debounced save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('triggers immediate save on blur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const nameInput = screen.getByLabelText('Nome do Podcast')
    await user.clear(nameInput)
    await user.type(nameInput, 'Blur Test')

    // Blur without waiting for debounce
    await act(async () => {
      fireEvent.blur(nameInput)
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Blur Test' }),
      }))
    })
  })

  it('calls API with correct arguments', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcast = createPodcastFixture({ id: 'my-podcast' })
    render(<PodcastSettingsForm podcast={podcast} />)

    const nameInput = screen.getByLabelText('Nome do Podcast')
    await user.clear(nameInput)
    await user.type(nameInput, 'New Podcast Name')

    // Advance timers to trigger debounced save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Podcast Name' }),
      }))
    })
  })

  // Note: Title "Informações do Podcast" is now rendered by parent AccordionTrigger
  // in settings-page-client.tsx (Story 8.2 refactor)

  it('auto-saves channelId on change', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const channelIdInput = screen.getByLabelText('Channel ID do YouTube')
    await user.clear(channelIdInput)
    await user.type(channelIdInput, 'UCNewChannel')

    // Advance timers to trigger debounced save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ channelId: 'UCNewChannel' }),
      }))
    })
  })

  it('triggers immediate save on channelId blur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const channelIdInput = screen.getByLabelText('Channel ID do YouTube')
    await user.clear(channelIdInput)
    await user.type(channelIdInput, 'UCBlurTest')

    // Blur without waiting for debounce
    await act(async () => {
      fireEvent.blur(channelIdInput)
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ channelId: 'UCBlurTest' }),
      }))
    })
  })

  it('shows validation error for empty name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const nameInput = screen.getByLabelText('Nome do Podcast')
    await user.clear(nameInput)

    // Trigger blur to save
    await act(async () => {
      fireEvent.blur(nameInput)
    })

    await waitFor(() => {
      expect(screen.getByText('Nome é obrigatório')).toBeInTheDocument()
    })

    // API should not be called for invalid data
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('shows validation error for empty channelId', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const channelIdInput = screen.getByLabelText('Channel ID do YouTube')
    await user.clear(channelIdInput)

    // Trigger blur to save
    await act(async () => {
      fireEvent.blur(channelIdInput)
    })

    await waitFor(() => {
      expect(screen.getByText('Channel ID é obrigatório')).toBeInTheDocument()
    })

    // API should not be called for invalid data
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('renders hostName field with existing value', () => {
    const podcast = createPodcastFixture({ hostName: 'Wellington' } as Partial<SerializedPodcast>)
    render(<PodcastSettingsForm podcast={podcast} />)

    const hostNameInput = screen.getByLabelText('Nome do Host/Apresentador')
    expect(hostNameInput).toHaveValue('Wellington')
  })

  it('renders hostName field empty when not set', () => {
    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const hostNameInput = screen.getByLabelText('Nome do Host/Apresentador')
    expect(hostNameInput).toHaveValue('')
  })

  it('auto-saves hostName on change', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const hostNameInput = screen.getByLabelText('Nome do Host/Apresentador')
    await user.type(hostNameInput, 'João Silva')

    // Advance timers to trigger debounced save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ hostName: 'João Silva' }),
      }))
    })
  })

  it('triggers immediate save on hostName blur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcast = createPodcastFixture()
    render(<PodcastSettingsForm podcast={podcast} />)

    const hostNameInput = screen.getByLabelText('Nome do Host/Apresentador')
    await user.type(hostNameInput, 'Maria')

    // Blur without waiting for debounce
    await act(async () => {
      fireEvent.blur(hostNameInput)
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ hostName: 'Maria' }),
      }))
    })
  })
})
