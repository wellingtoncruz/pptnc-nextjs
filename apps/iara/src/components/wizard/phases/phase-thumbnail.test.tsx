/**
 * Tests for PhaseThumbnail — Epic 22 / Story 22.3a (skeleton) + 22.3b (dual layout).
 *
 * 22.3a delivered the skeleton + wizard integration. 22.3b adds the dual
 * layout: Base/Referência previews on top, two paths side by side (Gerar /
 * Upload) as placeholders, "Thumbnail selecionada" area at the bottom, and
 * the disabled "Continuar para Publicar" button. Interactive behavior of
 * each path lands in 22.3c..22.3g.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/test-utils'

import { PhaseThumbnail } from './phase-thumbnail'
import type { Video } from '@/types/video'

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

const baseVideo = {
  id: 'video-1',
  videoType: 'episode',
  title: 'Episódio de teste',
} as unknown as Video

const originalFetch = global.fetch
const fetchMock = vi.fn()

function mockPodcastResponse(payload: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: payload }),
  } as Response)
}

describe('PhaseThumbnail (Story 22.3a skeleton + 22.3b dual layout)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders the phase heading and main sections', async () => {
    mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

    render(<PhaseThumbnail video={baseVideo} />)
    expect(screen.getByText('Thumbnail')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('path-generate')).toBeInTheDocument()
    })
    expect(screen.getByTestId('path-upload')).toBeInTheDocument()
    expect(screen.getByTestId('selected-summary')).toBeInTheDocument()
  })

  it('exposes data-video-id for test introspection', async () => {
    mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

    render(<PhaseThumbnail video={baseVideo} />)
    expect(screen.getByTestId('phase-thumbnail')).toHaveAttribute('data-video-id', 'video-1')
  })

  it('disables "Continuar para Publicar" while no thumbnail is selected', async () => {
    mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

    render(<PhaseThumbnail video={baseVideo} />)
    expect(screen.getByRole('button', { name: 'Continuar para Publicar' })).toBeDisabled()
  })

  it('enables "Continuar para Publicar" when a thumbnail URL is provided', async () => {
    mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

    render(
      <PhaseThumbnail
        video={baseVideo}
        selectedThumbnailUrl="https://storage.googleapis.com/bucket/thumb.png"
      />
    )
    expect(screen.getByRole('button', { name: 'Continuar para Publicar' })).toBeEnabled()
  })

  it('calls onAdvance when the enabled button is clicked', async () => {
    mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

    const onAdvance = vi.fn()
    render(
      <PhaseThumbnail
        video={baseVideo}
        selectedThumbnailUrl="https://storage.googleapis.com/bucket/thumb.png"
        onAdvance={onAdvance}
      />
    )
    screen.getByRole('button', { name: 'Continuar para Publicar' }).click()
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })

  it('does not call onAdvance when the button is disabled', async () => {
    mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

    const onAdvance = vi.fn()
    render(<PhaseThumbnail video={baseVideo} onAdvance={onAdvance} />)
    screen.getByRole('button', { name: 'Continuar para Publicar' }).click()
    expect(onAdvance).not.toHaveBeenCalled()
  })

  // ===========================================================================
  // 22.3b — Base / Referência previews + path cards + selected summary
  // ===========================================================================

  describe('references panel (22.3b)', () => {
    it('shows loading state before podcast fetch resolves', () => {
      // No mockPodcastResponse — fetch stays pending.
      fetchMock.mockReturnValueOnce(new Promise(() => {}))
      render(<PhaseThumbnail video={baseVideo} />)
      expect(screen.getByTestId('references-loading')).toBeInTheDocument()
    })

    it('shows empty state when podcast has no thumbnail config for this video type', async () => {
      mockPodcastResponse({ prompts: { episode: {} } })

      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('references-empty')).toBeInTheDocument()
      })
      expect(screen.getByText(/Nenhuma imagem de referência configurada/)).toBeInTheDocument()
    })

    it('shows empty state when thumbnail config exists but both image URLs are missing', async () => {
      mockPodcastResponse({
        prompts: { episode: { thumbnail: { description: 'x', expectedOutput: 'y' } } },
      })

      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('references-empty')).toBeInTheDocument()
      })
    })

    it('renders both reference previews when Base and Referência URLs are present', async () => {
      mockPodcastResponse({
        prompts: {
          episode: {
            thumbnail: {
              description: 'desc',
              expectedOutput: 'out',
              baseImageUrl: '/api/settings/thumbnail-config?path=base.png',
              referenceImageUrl: '/api/settings/thumbnail-config?path=ref.png',
            },
          },
        },
      })

      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('references-panel')).toBeInTheDocument()
      })

      const baseImg = screen.getByAltText('Preview Base')
      const refImg = screen.getByAltText('Preview Referência')
      expect(baseImg).toHaveAttribute('src', '/api/settings/thumbnail-config?path=base.png')
      expect(refImg).toHaveAttribute('src', '/api/settings/thumbnail-config?path=ref.png')
    })

    it('uses videoType=cut to fetch from prompts.cut.thumbnail', async () => {
      mockPodcastResponse({
        prompts: {
          cut: {
            thumbnail: {
              baseImageUrl: '/api/settings/thumbnail-config?path=cut-base.png',
              referenceImageUrl: '/api/settings/thumbnail-config?path=cut-ref.png',
            },
          },
        },
      })

      const cutVideo = { ...baseVideo, videoType: 'cut' } as unknown as Video
      render(<PhaseThumbnail video={cutVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('references-panel')).toBeInTheDocument()
      })
      expect(screen.getByAltText('Preview Base')).toHaveAttribute(
        'src',
        '/api/settings/thumbnail-config?path=cut-base.png'
      )
    })

    it('skips the fetch entirely for videoType=reel (gated upstream but defensive)', async () => {
      const reelVideo = { ...baseVideo, videoType: 'reel' } as unknown as Video
      render(<PhaseThumbnail video={reelVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('references-empty')).toBeInTheDocument()
      })
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('path cards (22.3b)', () => {
    it('renders both placeholder cards with their footnotes pointing to next sub-stories', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByText('Caminho 1 — Gerar com IAra')).toBeInTheDocument()
      })
      expect(screen.getByText('Caminho 2 — Upload próprio')).toBeInTheDocument()
      expect(screen.getByText(/22\.3c/)).toBeInTheDocument()
      expect(screen.getByText(/22\.3e/)).toBeInTheDocument()
    })
  })

  describe('selected summary (22.3b)', () => {
    it('shows empty hint when no thumbnail is selected', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByText(/Nenhuma thumbnail selecionada ainda/)).toBeInTheDocument()
      })
    })

    it('renders the selected preview when a thumbnail URL is provided', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

      render(
        <PhaseThumbnail
          video={baseVideo}
          selectedThumbnailUrl="https://storage.googleapis.com/bucket/picked.png"
        />
      )
      await waitFor(() => {
        const img = screen.getByAltText('Thumbnail selecionada')
        expect(img).toHaveAttribute('src', 'https://storage.googleapis.com/bucket/picked.png')
      })
    })
  })
})
