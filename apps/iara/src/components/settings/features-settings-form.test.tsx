import { describe, expect, it, vi, beforeEach } from 'vitest'

import { act, render, screen, waitFor } from '@/test-utils'

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { FeaturesSettingsForm } from './features-settings-form'

const defaultFeatures = { editorial: true, news: true, includeLivestreams: false, socialMedia: false }

describe('FeaturesSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { success: true } }),
    })
  })

  it('renders all toggles with correct initial state', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    expect(screen.getByLabelText('Editorial')).toBeInTheDocument()
    expect(screen.getByLabelText('Notícias')).toBeInTheDocument()
    expect(screen.getByLabelText('Incluir vídeos de lives')).toBeInTheDocument()
    expect(screen.getByLabelText('Redes Sociais')).toBeInTheDocument()
  })

  it('renders editorial toggle as unchecked when disabled', () => {
    render(<FeaturesSettingsForm features={{ ...defaultFeatures, editorial: false }} />)

    const editorialSwitch = screen.getByLabelText('Editorial')
    expect(editorialSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('renders news toggle as checked when enabled', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const newsSwitch = screen.getByLabelText('Notícias')
    expect(newsSwitch).toHaveAttribute('data-state', 'checked')
  })

  it('renders socialMedia toggle as unchecked by default', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const socialSwitch = screen.getByLabelText('Redes Sociais')
    expect(socialSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('calls API when editorial toggle is changed', async () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const editorialSwitch = screen.getByLabelText('Editorial')
    await act(async () => {
      editorialSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: false, news: true, includeLivestreams: false, socialMedia: false } }),
      }))
    })
  })

  it('calls API when news toggle is changed', async () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const newsSwitch = screen.getByLabelText('Notícias')
    await act(async () => {
      newsSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: true, news: false, includeLivestreams: false, socialMedia: false } }),
      }))
    })
  })

  it('calls API when includeLivestreams toggle is changed', async () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const livestreamsSwitch = screen.getByLabelText('Incluir vídeos de lives')
    await act(async () => {
      livestreamsSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: true, news: true, includeLivestreams: true, socialMedia: false } }),
      }))
    })
  })

  it('calls API when socialMedia toggle is changed', async () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const socialSwitch = screen.getByLabelText('Redes Sociais')
    await act(async () => {
      socialSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: true, news: true, includeLivestreams: false, socialMedia: true } }),
      }))
    })
  })

  it('reverts toggle on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    render(<FeaturesSettingsForm features={defaultFeatures} />)

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

  it('reverts socialMedia toggle on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const socialSwitch = screen.getByLabelText('Redes Sociais')
    await act(async () => {
      socialSwitch.click()
    })

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })

    // Should revert to unchecked state
    expect(socialSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('shows description text', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    expect(screen.getByText('Habilite ou desabilite seções opcionais do menu lateral.')).toBeInTheDocument()
  })

  it('shows socialMedia description text', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    expect(screen.getByText('Habilita a seção de posts para redes sociais no menu lateral.')).toBeInTheDocument()
  })
})
