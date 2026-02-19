import { describe, expect, it, vi, beforeEach } from 'vitest'

import { act, render, screen, waitFor } from '@/test-utils'

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { FeaturesSettingsForm } from './features-settings-form'

describe('FeaturesSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { success: true } }),
    })
  })

  it('renders both toggles with correct initial state', () => {
    render(<FeaturesSettingsForm features={{ editorial: true, news: true }} />)

    expect(screen.getByLabelText('Editorial')).toBeInTheDocument()
    expect(screen.getByLabelText('Notícias')).toBeInTheDocument()
  })

  it('renders editorial toggle as unchecked when disabled', () => {
    render(<FeaturesSettingsForm features={{ editorial: false, news: true }} />)

    const editorialSwitch = screen.getByLabelText('Editorial')
    expect(editorialSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('renders news toggle as checked when enabled', () => {
    render(<FeaturesSettingsForm features={{ editorial: true, news: true }} />)

    const newsSwitch = screen.getByLabelText('Notícias')
    expect(newsSwitch).toHaveAttribute('data-state', 'checked')
  })

  it('calls API when editorial toggle is changed', async () => {
    render(<FeaturesSettingsForm features={{ editorial: true, news: true }} />)

    const editorialSwitch = screen.getByLabelText('Editorial')
    await act(async () => {
      editorialSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: false, news: true } }),
      }))
    })
  })

  it('calls API when news toggle is changed', async () => {
    render(<FeaturesSettingsForm features={{ editorial: true, news: true }} />)

    const newsSwitch = screen.getByLabelText('Notícias')
    await act(async () => {
      newsSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: true, news: false } }),
      }))
    })
  })

  it('reverts toggle on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    render(<FeaturesSettingsForm features={{ editorial: true, news: true }} />)

    const editorialSwitch = screen.getByLabelText('Editorial')
    await act(async () => {
      editorialSwitch.click()
    })

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })

    // Should revert to checked state
    expect(editorialSwitch).toHaveAttribute('data-state', 'checked')
  })

  it('shows description text', () => {
    render(<FeaturesSettingsForm features={{ editorial: true, news: true }} />)

    expect(screen.getByText('Habilite ou desabilite seções opcionais do menu lateral.')).toBeInTheDocument()
  })
})
