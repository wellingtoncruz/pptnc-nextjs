/**
 * Tests da fase Imagens Extras — Epic 28 / Story 28.5.
 */
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/test-utils'

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { PhaseExtraImages } from './phase-extra-images'
import type { Video } from '@/types/video'

const filled = {
  description: 'gere',
  expectedOutput: 'imagem',
  baseImageUrl: '/api/base.png',
  referenceImageUrl: '/api/ref.png',
}

const episode = { id: 'vid1', videoType: 'episode', title: 'Ep 42' } as unknown as Video

/** Responde ao GET /api/podcast com a config das três imagens. */
function mockPodcastConfig(extraImages: Record<string, unknown> = {
  story: filled,
  vitrine: filled,
  feed: filled,
}) {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/podcast')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { prompts: { episode: { extraImages } } } }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
}

describe('PhaseExtraImages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPodcastConfig()
  })

  it('renders one section per kind', async () => {
    render(<PhaseExtraImages video={episode} />)

    await waitFor(() => {
      expect(screen.getByTestId('extra-image-story')).toBeInTheDocument()
    })
    expect(screen.getByTestId('extra-image-vitrine')).toBeInTheDocument()
    expect(screen.getByTestId('extra-image-feed')).toBeInTheDocument()
  })

  it('gives each section its own generate button and observation field', async () => {
    render(<PhaseExtraImages video={episode} />)

    await waitFor(() => {
      expect(screen.getByTestId('generate-story-button')).toBeInTheDocument()
    })
    for (const kind of ['story', 'vitrine', 'feed']) {
      expect(screen.getByTestId(`generate-${kind}-button`)).toBeInTheDocument()
      expect(screen.getByTestId(`${kind}-observation`)).toBeInTheDocument()
    }
  })

  /**
   * Não bloqueia o avanço (decisão Wellington, 2026-07-28): o botão fica
   * habilitado mesmo sem nenhuma imagem gerada.
   */
  it('lets the producer advance with no image selected', async () => {
    const user = userEvent.setup()
    const onAdvance = vi.fn()
    render(<PhaseExtraImages video={episode} onAdvance={onAdvance} />)

    await waitFor(() => {
      expect(screen.getByTestId('continuar-extra-images')).toBeInTheDocument()
    })
    const button = screen.getByTestId('continuar-extra-images')
    expect(button).not.toBeDisabled()

    await user.click(button)
    expect(onAdvance).toHaveBeenCalledWith({ extraImages: {} })
  })

  it('hydrates from already persisted images', async () => {
    render(
      <PhaseExtraImages
        video={episode}
        selectedExtraImages={{ feed: '/api/wizard/extra-images/select?path=extra-images/p/v/feed-1.png' }}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('feed-selected')).toBeInTheDocument()
    })
    expect(screen.getByTestId('story-empty')).toBeInTheDocument()
    expect(screen.getByTestId('vitrine-empty')).toBeInTheDocument()
  })

  it('offers a download link for a persisted image', async () => {
    const url = '/api/wizard/extra-images/select?path=extra-images/p/v/story-1.png'
    render(<PhaseExtraImages video={episode} selectedExtraImages={{ story: url }} />)

    await waitFor(() => {
      expect(screen.getByTestId('download-story')).toBeInTheDocument()
    })
    const link = screen.getByTestId('download-story')
    expect(link).toHaveAttribute('href', url)
    expect(link).toHaveAttribute('download', 'story.png')
  })

  it('marks a persisted image as saved and disables re-saving it', async () => {
    render(
      <PhaseExtraImages
        video={episode}
        selectedExtraImages={{ story: '/api/wizard/extra-images/select?path=extra-images/p/v/story-1.png' }}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('story-saved-badge')).toBeInTheDocument()
    })
    expect(screen.getByTestId('save-story-button')).toBeDisabled()
  })

  it('cannot save a kind with nothing selected', async () => {
    render(<PhaseExtraImages video={episode} />)

    await waitFor(() => {
      expect(screen.getByTestId('save-story-button')).toBeInTheDocument()
    })
    expect(screen.getByTestId('save-story-button')).toBeDisabled()
  })

  /**
   * Sem prompt configurado a geração falharia no servidor; avisar antes evita
   * que o produtor descubra isso depois de esperar o job.
   */
  it('warns when a kind has no prompt configured', async () => {
    mockPodcastConfig({ story: { description: '', expectedOutput: '' }, feed: filled })
    render(<PhaseExtraImages video={episode} />)

    await waitFor(() => {
      expect(screen.getByTestId('extra-image-story')).toBeInTheDocument()
    })
    expect(screen.getAllByText(/não configurado/).length).toBeGreaterThan(0)
  })

  it('survives a failing config fetch', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    render(<PhaseExtraImages video={episode} />)

    await waitFor(() => {
      expect(screen.getByTestId('extra-image-story')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('extra-config-loading')).not.toBeInTheDocument()
  })
})
