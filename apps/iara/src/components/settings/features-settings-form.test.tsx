import { describe, expect, it, vi, beforeEach } from 'vitest'

import { act, render, screen, waitFor } from '@/test-utils'

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { FeaturesSettingsForm } from './features-settings-form'

const defaultFeatures = { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false, socialPublish: false, thumbnailGeneration: false }

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
    expect(screen.getByLabelText('Tráfego Pago')).toBeInTheDocument()
    expect(screen.getByLabelText('Newsletter')).toBeInTheDocument()
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
        body: JSON.stringify({ features: { editorial: false, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false, socialPublish: false, thumbnailGeneration: false } }),
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
        body: JSON.stringify({ features: { editorial: true, news: false, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false, socialPublish: false, thumbnailGeneration: false } }),
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
        body: JSON.stringify({ features: { editorial: true, news: true, includeLivestreams: true, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false, socialPublish: false, thumbnailGeneration: false } }),
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
        body: JSON.stringify({ features: { editorial: true, news: true, includeLivestreams: false, socialMedia: true, adwords: false, newsletter: false, llmDebugMode: false, socialPublish: false, thumbnailGeneration: false } }),
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

  it('reverts adwords toggle on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const adwordsSwitch = screen.getByLabelText('Tráfego Pago')
    await act(async () => {
      adwordsSwitch.click()
    })

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })

    // Should revert to unchecked state
    expect(adwordsSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('shows description text', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    expect(screen.getByText('Habilite ou desabilite seções opcionais do menu lateral.')).toBeInTheDocument()
  })

  it('shows socialMedia description text', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    expect(screen.getByText('Habilita a seção de posts para redes sociais no menu lateral.')).toBeInTheDocument()
  })

  it('renders adwords toggle as unchecked by default', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const adwordsSwitch = screen.getByLabelText('Tráfego Pago')
    expect(adwordsSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('renders adwords toggle as checked when enabled', () => {
    render(<FeaturesSettingsForm features={{ ...defaultFeatures, adwords: true }} />)

    const adwordsSwitch = screen.getByLabelText('Tráfego Pago')
    expect(adwordsSwitch).toHaveAttribute('data-state', 'checked')
  })

  it('calls API when adwords toggle is changed', async () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const adwordsSwitch = screen.getByLabelText('Tráfego Pago')
    await act(async () => {
      adwordsSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: true, newsletter: false, llmDebugMode: false, socialPublish: false, thumbnailGeneration: false } }),
      }))
    })
  })

  it('shows adwords description text', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    expect(screen.getByText('Habilita a aba Tráfego Pago para geração de guias de otimização AdWords')).toBeInTheDocument()
  })

  it('renders newsletter toggle as unchecked by default', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const newsletterSwitch = screen.getByLabelText('Newsletter')
    expect(newsletterSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('renders newsletter toggle as checked when enabled', () => {
    render(<FeaturesSettingsForm features={{ ...defaultFeatures, newsletter: true }} />)

    const newsletterSwitch = screen.getByLabelText('Newsletter')
    expect(newsletterSwitch).toHaveAttribute('data-state', 'checked')
  })

  it('calls API when newsletter toggle is changed', async () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const newsletterSwitch = screen.getByLabelText('Newsletter')
    await act(async () => {
      newsletterSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: true, llmDebugMode: false, socialPublish: false, thumbnailGeneration: false } }),
      }))
    })
  })

  it('shows newsletter description text', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    expect(screen.getByText('Geração de newsletter a partir dos episódios')).toBeInTheDocument()
  })

  it('reverts newsletter toggle on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const newsletterSwitch = screen.getByLabelText('Newsletter')
    await act(async () => {
      newsletterSwitch.click()
    })

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })

    // Should revert to unchecked state
    expect(newsletterSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('renders llmDebugMode toggle as unchecked by default', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const debugSwitch = screen.getByLabelText('Modo de Depuração LLM')
    expect(debugSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('renders llmDebugMode toggle as checked when enabled', () => {
    render(<FeaturesSettingsForm features={{ ...defaultFeatures, llmDebugMode: true }} />)

    const debugSwitch = screen.getByLabelText('Modo de Depuração LLM')
    expect(debugSwitch).toHaveAttribute('data-state', 'checked')
  })

  it('calls API when llmDebugMode toggle is changed', async () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const debugSwitch = screen.getByLabelText('Modo de Depuração LLM')
    await act(async () => {
      debugSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: true, socialPublish: false, thumbnailGeneration: false } }),
      }))
    })
  })

  it('shows llmDebugMode description text', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    expect(screen.getByText('Registra prompts e respostas do LLM para análise e otimização')).toBeInTheDocument()
  })

  it('renders socialPublish toggle as unchecked by default', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const publishSwitch = screen.getByLabelText('Publicação em Redes Sociais')
    expect(publishSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('renders socialPublish toggle as checked when enabled', () => {
    render(<FeaturesSettingsForm features={{ ...defaultFeatures, socialPublish: true }} />)

    const publishSwitch = screen.getByLabelText('Publicação em Redes Sociais')
    expect(publishSwitch).toHaveAttribute('data-state', 'checked')
  })

  it('calls API when socialPublish toggle is changed', async () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    const publishSwitch = screen.getByLabelText('Publicação em Redes Sociais')
    await act(async () => {
      publishSwitch.click()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false, socialPublish: true, thumbnailGeneration: false } }),
      }))
    })
  })

  it('shows socialPublish description text', () => {
    render(<FeaturesSettingsForm features={defaultFeatures} />)

    expect(screen.getByText('Habilita agendamento de publicações em redes sociais')).toBeInTheDocument()
  })

  // ===========================================================================
  // Epic 22 / Story 22.2-bis — thumbnailGeneration feature flag
  // ===========================================================================

  describe('thumbnailGeneration (Epic 22)', () => {
    it('renders the thumbnailGeneration toggle as unchecked by default', () => {
      render(<FeaturesSettingsForm features={defaultFeatures} />)
      const thumbSwitch = screen.getByLabelText('Geração de Thumbnails (preview)')
      expect(thumbSwitch).toHaveAttribute('data-state', 'unchecked')
    })

    it('renders the toggle as checked when feature is enabled', () => {
      render(<FeaturesSettingsForm features={{ ...defaultFeatures, thumbnailGeneration: true }} />)
      const thumbSwitch = screen.getByLabelText('Geração de Thumbnails (preview)')
      expect(thumbSwitch).toHaveAttribute('data-state', 'checked')
    })

    it('calls API with thumbnailGeneration:true when toggled on', async () => {
      render(<FeaturesSettingsForm features={defaultFeatures} />)

      const thumbSwitch = screen.getByLabelText('Geração de Thumbnails (preview)')
      await act(async () => {
        thumbSwitch.click()
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false, socialPublish: false, thumbnailGeneration: true } }),
        }))
      })
    })

    it('shows description warning about preview model risks', () => {
      render(<FeaturesSettingsForm features={defaultFeatures} />)
      expect(screen.getByText(/preview na Vertex AI/)).toBeInTheDocument()
    })
  })
})
