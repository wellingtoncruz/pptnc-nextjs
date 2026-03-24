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

  it('renders all settings sections', () => {
    render(<SettingsPageClient podcast={mockPodcast} />)

    // PodcastSettingsForm
    expect(screen.getByText('Informações do Podcast')).toBeInTheDocument()

    // FeaturesSettingsForm
    expect(screen.getByText('Recursos')).toBeInTheDocument()

    // DurationSettingsForm
    expect(screen.getByText('Duração por Tipo de Vídeo')).toBeInTheDocument()

    // PersonasSettingsForm
    expect(screen.getByText('Personas do LLM')).toBeInTheDocument()

    // PromptsSettingsForm
    expect(screen.getByText('Prompts por Tipo de Vídeo')).toBeInTheDocument()
  })

  it('exibe descrições em cada seção do accordion', () => {
    render(<SettingsPageClient podcast={mockPodcast} />)

    expect(screen.getByText('Nome, canal do YouTube e nome do host')).toBeInTheDocument()
    expect(screen.getByText('Habilite ou desabilite seções opcionais da aplicação')).toBeInTheDocument()
    expect(screen.getByText('Limites de duração para classificação de vídeos')).toBeInTheDocument()
    expect(screen.getByText('Configure os personagens que o LLM assume em cada tarefa')).toBeInTheDocument()
    expect(screen.getByText('Instruções enviadas ao LLM para cada fase por tipo de vídeo')).toBeInTheDocument()
    expect(screen.getByText('Re-importar vídeos do canal YouTube')).toBeInTheDocument()
  })

  it('exibe ícones em cada seção do accordion', () => {
    const { container } = render(<SettingsPageClient podcast={mockPodcast} />)

    // Lucide icons render as <svg class="lucide lucide-{name} ...">
    expect(container.querySelector('.lucide-radio')).toBeInTheDocument()
    expect(container.querySelector('.lucide-toggle-left')).toBeInTheDocument()
    expect(container.querySelector('.lucide-clock')).toBeInTheDocument()
    expect(container.querySelector('.lucide-bot')).toBeInTheDocument()
    expect(container.querySelector('.lucide-file-text')).toBeInTheDocument()
    expect(container.querySelector('.lucide-refresh-cw')).toBeInTheDocument()
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

  it('shows Social Networks accordion when socialMedia feature is enabled and networks provided', () => {
    const podcastWithSocialMedia = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: true, adwords: false, newsletter: false, llmDebugMode: false },
    }
    const mockNetworks = [
      { id: 'instagram', name: 'Instagram', icon: '📷' },
    ]

    render(<SettingsPageClient podcast={podcastWithSocialMedia} socialNetworks={mockNetworks} />)

    expect(screen.getByText('Redes Sociais')).toBeInTheDocument()
    expect(screen.getByText('Habilitação de redes e conexão de contas')).toBeInTheDocument()
  })

  it('hides Social Networks accordion when socialMedia feature is disabled', () => {
    const podcastNoSocial = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false },
    }
    const mockNetworks = [
      { id: 'instagram', name: 'Instagram', icon: '📷' },
    ]

    render(<SettingsPageClient podcast={podcastNoSocial} socialNetworks={mockNetworks} />)

    expect(screen.queryByText('Redes Sociais')).not.toBeInTheDocument()
  })

  it('hides Social Networks accordion when both socialMedia and socialPublish are disabled', () => {
    const podcastNoSocial = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, socialPublish: false, adwords: false, newsletter: false, llmDebugMode: false },
    }

    render(<SettingsPageClient podcast={podcastNoSocial} socialNetworks={null as never} />)

    expect(screen.queryByText('Redes Sociais')).not.toBeInTheDocument()
  })

  it('sends nested social prompt via social. path in PATCH body', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcastWithSocial = {
      ...mockPodcast,
      enabledSocialNetworks: ['instagram'],
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: true, adwords: false, newsletter: false, llmDebugMode: false },
    }
    const mockNetworks = [{ id: 'instagram', name: 'Instagram', icon: '📷' }]

    render(<SettingsPageClient podcast={podcastWithSocial} socialNetworks={mockNetworks} />)

    // Open the Prompts accordion section
    await user.click(screen.getByText('Prompts por Tipo de Vídeo'))

    // Open the Episode accordion inside prompts
    const accordionTriggers = screen.getAllByText('Episódios')
    await user.click(accordionTriggers[0])

    await waitFor(() => {
      expect(screen.getByText('📷 Instagram')).toBeInTheDocument()
    })

    // PromptFieldEditor renders id={`${fieldKey}-description`} for each textarea
    const socialTextarea = document.getElementById('episode-social-instagram-description') as HTMLTextAreaElement
    await user.clear(socialTextarea)
    await user.type(socialTextarea, 'Instagram post prompt')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/podcast',
        expect.objectContaining({ method: 'PATCH' })
      )
    })

    // Verify the body contains the nested social prompt structure
    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(fetchCall[1]?.body as string)
    expect(body.prompts.episode.social.instagram.description).toBe('Instagram post prompt')
  })

  it('sends adwords prompt via direct field path in PATCH body', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<SettingsPageClient podcast={mockPodcast} />)

    // Open the Prompts accordion section
    await user.click(screen.getByText('Prompts por Tipo de Vídeo'))

    // Open the Episode accordion inside prompts
    const accordionTriggers = screen.getAllByText('Episódios')
    await user.click(accordionTriggers[0])

    await waitFor(() => {
      expect(screen.getByText('AdWords')).toBeInTheDocument()
    })

    // PromptFieldEditor renders id={`${fieldKey}-description`} for each textarea
    const adwordsTextarea = document.getElementById('episode-adwords-description') as HTMLTextAreaElement
    await user.clear(adwordsTextarea)
    await user.type(adwordsTextarea, 'AdWords guide prompt')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/podcast',
        expect.objectContaining({ method: 'PATCH' })
      )
    })

    // Verify the body contains the adwords prompt at the correct path
    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(fetchCall[1]?.body as string)
    expect(body.prompts.episode.adwords.description).toBe('AdWords guide prompt')
  })

  it('sends nested newsletter prompt via newsletter. path in PATCH body', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcastWithNewsletter = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: true, llmDebugMode: false },
    }

    render(<SettingsPageClient podcast={podcastWithNewsletter} />)

    // Open the Prompts accordion section
    await user.click(screen.getByText('Prompts por Tipo de Vídeo'))

    // Open the Episode accordion inside prompts
    const accordionTriggers = screen.getAllByText('Episódios')
    await user.click(accordionTriggers[0])

    await waitFor(() => {
      expect(screen.getByText('Newsletter')).toBeInTheDocument()
    })

    // PromptFieldEditor renders id={`${fieldKey}-description`} for each textarea
    const draftTextarea = document.getElementById('episode-newsletter-draft-description') as HTMLTextAreaElement
    await user.clear(draftTextarea)
    await user.type(draftTextarea, 'Newsletter draft prompt')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/podcast',
        expect.objectContaining({ method: 'PATCH' })
      )
    })

    // Verify the body contains the nested newsletter prompt structure with all sibling keys
    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(fetchCall[1]?.body as string)
    expect(body.prompts.episode.newsletter.draft.description).toBe('Newsletter draft prompt')
    // All 4 newsletter sections must be present (schema requires complete object)
    expect(body.prompts.episode.newsletter).toHaveProperty('news')
    expect(body.prompts.episode.newsletter).toHaveProperty('image')
    expect(body.prompts.episode.newsletter).toHaveProperty('format')
  })

  it('shows "Prompts por Recurso" section when news feature is enabled', () => {
    const podcastWithNews = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false },
    }

    render(<SettingsPageClient podcast={podcastWithNews} />)

    expect(screen.getByText('Prompts por Recurso')).toBeInTheDocument()
    expect(screen.getByText('Prompts de recursos como Notícias')).toBeInTheDocument()
  })

  it('hides "Prompts por Recurso" section when news feature is disabled', () => {
    const podcastNoNews = {
      ...mockPodcast,
      features: { editorial: true, news: false, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false },
    }

    render(<SettingsPageClient podcast={podcastNoNews} />)

    expect(screen.queryByText('Prompts por Recurso')).not.toBeInTheDocument()
  })

  it('shows "Prompts por Recurso" section when features is undefined (news defaults to true)', () => {
    render(<SettingsPageClient podcast={mockPodcast} />)

    expect(screen.getByText('Prompts por Recurso')).toBeInTheDocument()
  })

  it('renders Newspaper icon in "Prompts por Recurso" section', () => {
    const podcastWithNews = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false },
    }

    const { container } = render(<SettingsPageClient podcast={podcastWithNews} />)

    expect(container.querySelector('.lucide-newspaper')).toBeInTheDocument()
  })

  it('shows "Notícias" sub-header inside "Prompts por Recurso" panel', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcastWithNews = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false },
    }

    render(<SettingsPageClient podcast={podcastWithNews} />)

    await user.click(screen.getByText('Prompts por Recurso'))

    await waitFor(() => {
      expect(screen.getByText('Notícias')).toBeInTheDocument()
      expect(screen.getByText('Redação Rede Social')).toBeInTheDocument()
    })
  })

  it('shows error when API call fails for news prompt', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'News prompt error' } }),
    })

    const podcastWithNews = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false },
    }

    render(<SettingsPageClient podcast={podcastWithNews} />)

    await user.click(screen.getByText('Prompts por Recurso'))

    await waitFor(() => {
      expect(screen.getByText('Redação Rede Social')).toBeInTheDocument()
    })

    const newsTextarea = document.getElementById('news-news_social-description') as HTMLTextAreaElement
    await user.clear(newsTextarea)
    await user.type(newsTextarea, 'New prompt')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(screen.getByText('News prompt error')).toBeInTheDocument()
    })
  })

  it('calls API when news prompt is saved in "Prompts por Recurso"', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcastWithNews = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false },
    }

    render(<SettingsPageClient podcast={podcastWithNews} />)

    // Open the "Prompts por Recurso" accordion section
    await user.click(screen.getByText('Prompts por Recurso'))

    await waitFor(() => {
      expect(screen.getByText('Redação Rede Social')).toBeInTheDocument()
    })

    // PromptFieldEditor renders id={`${fieldKey}-description`} for each textarea
    const newsTextarea = document.getElementById('news-news_social-description') as HTMLTextAreaElement
    await user.clear(newsTextarea)
    await user.type(newsTextarea, 'News social prompt')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/podcast',
        expect.objectContaining({ method: 'PATCH' })
      )
    })

    // Verify the body contains the news prompt at the correct path
    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(fetchCall[1]?.body as string)
    expect(body.prompts.news.news_social.description).toBe('News social prompt')
  })

  // Story 18.8 — news_image PromptFieldEditor
  it('shows "Imagem" PromptFieldEditor inside "Prompts por Recurso" panel when news is enabled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcastWithNews = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false },
    }

    render(<SettingsPageClient podcast={podcastWithNews} />)

    await user.click(screen.getByText('Prompts por Recurso'))

    await waitFor(() => {
      expect(screen.getByText('Imagem')).toBeInTheDocument()
    })
  })

  it('calls API when news_image prompt is saved in "Prompts por Recurso"', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const podcastWithNews = {
      ...mockPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, newsletter: false, llmDebugMode: false },
    }

    render(<SettingsPageClient podcast={podcastWithNews} />)

    await user.click(screen.getByText('Prompts por Recurso'))

    await waitFor(() => {
      expect(screen.getByText('Imagem')).toBeInTheDocument()
    })

    const newsImageTextarea = document.getElementById('news-news_image-description') as HTMLTextAreaElement
    await user.clear(newsImageTextarea)
    await user.type(newsImageTextarea, 'Image generation prompt')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/podcast',
        expect.objectContaining({ method: 'PATCH' })
      )
    })

    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(fetchCall[1]?.body as string)
    expect(body.prompts.news.news_image.description).toBe('Image generation prompt')
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
