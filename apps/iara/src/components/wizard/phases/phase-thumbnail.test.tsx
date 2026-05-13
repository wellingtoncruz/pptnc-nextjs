/**
 * Tests for PhaseThumbnail — Epic 22 / Story 22.3a..22.3c.
 *
 * 22.3a delivered the skeleton + wizard integration.
 * 22.3b added the dual layout: Base/Referência previews, two paths side by side,
 *   "Thumbnail selecionada" summary and the disabled advance button.
 * 22.3c (covered here) activates Caminho 1: textarea + Gerar Thumbnail button
 *   chama o stub endpoint, mostra feedback temporal progressivo e seleciona a
 *   URL retornada automaticamente.
 */

import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

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

function mockGenerateResponse(thumbnailUrl: string) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ thumbnailUrl, generatedAt: '2026-05-13T12:00:00Z' }),
  } as Response)
}

function mockGenerateError(status: number, message?: string) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => (message ? { error: { code: 'X', message } } : { error: { code: 'X' } }),
  } as Response)
}

describe('PhaseThumbnail (Story 22.3a..22.3c)', () => {
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
    it('renders the Gerar (active) and Upload (placeholder pointing to 22.3e) sections', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByText('Gerar com IAra')).toBeInTheDocument()
      })
      expect(screen.getByText('Upload próprio')).toBeInTheDocument()
      // Gerar is now interactive (22.3c) — has a real textarea/button.
      expect(screen.getByTestId('thumbnail-observation')).toBeInTheDocument()
      expect(screen.getByTestId('generate-thumbnail-button')).toBeInTheDocument()
      // Upload is still placeholder until 22.3e.
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

  // ===========================================================================
  // 22.3c — Caminho 1 (Gerar com IAra) com stub endpoint
  // ===========================================================================

  describe('Caminho 1 — Gerar com IAra (22.3c)', () => {
    it('renders the observation textarea and the Gerar button', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })

      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('path-generate')).toBeInTheDocument()
      })
      expect(screen.getByTestId('thumbnail-observation')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Gerar Thumbnail/ })).toBeEnabled()
    })

    it('calls the stub endpoint and selects the returned URL on success', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })
      mockGenerateResponse('data:image/svg+xml;base64,PHN2Zy8+')

      const user = userEvent.setup()
      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('generate-thumbnail-button')).toBeInTheDocument()
      })

      await user.type(screen.getByTestId('thumbnail-observation'), 'destaque o convidado')
      await user.click(screen.getByTestId('generate-thumbnail-button'))

      await waitFor(() => {
        const img = screen.getByAltText('Thumbnail selecionada')
        expect(img).toHaveAttribute('src', 'data:image/svg+xml;base64,PHN2Zy8+')
      })

      const generateCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/wizard/thumbnail/generate')
      )
      expect(generateCall).toBeDefined()
      const init = generateCall?.[1] as RequestInit | undefined
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body ?? '{}')) as { videoId: string; observation?: string }
      expect(body.videoId).toBe('video-1')
      expect(body.observation).toBe('destaque o convidado')
    })

    it('omits observation from the payload when the textarea is empty', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })
      mockGenerateResponse('data:image/svg+xml;base64,PHN2Zy8+')

      const user = userEvent.setup()
      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('generate-thumbnail-button')).toBeInTheDocument()
      })
      await user.click(screen.getByTestId('generate-thumbnail-button'))

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(([url]) =>
          String(url).includes('/api/wizard/thumbnail/generate')
        )
        expect(call).toBeDefined()
        const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}')) as {
          videoId: string
          observation?: string
        }
        expect(body.observation).toBeUndefined()
      })
    })

    it('shows the elapsed timer while generation is in flight', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })
      let resolveFetch: ((value: Response) => void) | null = null
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
      )

      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        render(<PhaseThumbnail video={baseVideo} />)
        await waitFor(() => {
          expect(screen.getByTestId('generate-thumbnail-button')).toBeInTheDocument()
        })

        await user.click(screen.getByTestId('generate-thumbnail-button'))

        await waitFor(() => {
          expect(screen.getByTestId('thumbnail-elapsed')).toBeInTheDocument()
        })
        expect(screen.getByTestId('thumbnail-elapsed').textContent).toMatch(/Tempo decorrido: 0s/)

        await act(async () => {
          vi.advanceTimersByTime(2000)
        })
        expect(screen.getByTestId('thumbnail-elapsed').textContent).toMatch(/Tempo decorrido: 2s/)

        // Resolve the pending fetch so the component leaves loading state cleanly.
        resolveFetch?.({
          ok: true,
          json: async () => ({ thumbnailUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }),
        } as Response)
        await waitFor(() => {
          expect(screen.queryByTestId('thumbnail-elapsed')).not.toBeInTheDocument()
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('renders the error block when the stub endpoint fails', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })
      mockGenerateError(500, 'Servidor indisponível')

      const user = userEvent.setup()
      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('generate-thumbnail-button')).toBeInTheDocument()
      })
      await user.click(screen.getByTestId('generate-thumbnail-button'))

      await waitFor(() => {
        expect(screen.getByTestId('thumbnail-error')).toBeInTheDocument()
      })
      expect(screen.getByTestId('thumbnail-error').textContent).toMatch(/Servidor indisponível/)
      // Continuar must remain disabled — no thumbnail was selected.
      expect(screen.getByRole('button', { name: 'Continuar para Publicar' })).toBeDisabled()
    })

    it('locally generated URL takes precedence over the hydrated selectedThumbnailUrl prop', async () => {
      // Regression: a video carrying a legacy base64 storageThumbnailUrl (TD-5)
      // was masking the newly generated mock — producer clicked Gerar, got 200,
      // and saw nothing change because the prop won the `??` short-circuit.
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })
      mockGenerateResponse('data:image/svg+xml;base64,FRESH')

      const user = userEvent.setup()
      render(
        <PhaseThumbnail
          video={baseVideo}
          selectedThumbnailUrl="https://i.ytimg.com/vi/legacy.jpg"
        />
      )

      // Initial state: prop hydrates the summary.
      await waitFor(() => {
        const img = screen.getByAltText('Thumbnail selecionada')
        expect(img).toHaveAttribute('src', 'https://i.ytimg.com/vi/legacy.jpg')
      })

      await user.click(screen.getByTestId('generate-thumbnail-button'))

      // After generation, the freshly generated URL must replace the prop.
      await waitFor(() => {
        const img = screen.getByAltText('Thumbnail selecionada')
        expect(img).toHaveAttribute('src', 'data:image/svg+xml;base64,FRESH')
      })
    })

    it('accumulates each successful generation in the versions gallery', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })
      mockGenerateResponse('data:image/svg+xml;base64,FIRST')
      mockGenerateResponse('data:image/svg+xml;base64,SECOND')
      mockGenerateResponse('data:image/svg+xml;base64,THIRD')

      const user = userEvent.setup()
      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('generate-thumbnail-button')).toBeInTheDocument()
      })

      // 1st generation
      await user.type(screen.getByTestId('thumbnail-observation'), 'um')
      await user.click(screen.getByTestId('generate-thumbnail-button'))
      await waitFor(() => {
        expect(screen.getByTestId('generated-versions-gallery')).toBeInTheDocument()
      })

      // 2nd generation
      await user.clear(screen.getByTestId('thumbnail-observation'))
      await user.type(screen.getByTestId('thumbnail-observation'), 'dois')
      await user.click(screen.getByTestId('generate-thumbnail-button'))

      // 3rd generation
      await user.clear(screen.getByTestId('thumbnail-observation'))
      await user.type(screen.getByTestId('thumbnail-observation'), 'tres')
      await user.click(screen.getByTestId('generate-thumbnail-button'))

      await waitFor(() => {
        expect(screen.getAllByTestId('version-card')).toHaveLength(3)
      })
      expect(screen.getByText('Versões geradas (3)')).toBeInTheDocument()

      // Most recent (THIRD) is auto-selected — feeds into the summary preview.
      const summaryImg = screen.getByAltText('Thumbnail selecionada')
      expect(summaryImg).toHaveAttribute('src', 'data:image/svg+xml;base64,THIRD')
    })

    it('lets the producer pick an older version from the gallery', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })
      mockGenerateResponse('data:image/svg+xml;base64,FIRST')
      mockGenerateResponse('data:image/svg+xml;base64,SECOND')

      const user = userEvent.setup()
      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('generate-thumbnail-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('generate-thumbnail-button'))
      await waitFor(() => {
        expect(screen.getAllByTestId('version-card')).toHaveLength(1)
      })
      await user.click(screen.getByTestId('generate-thumbnail-button'))
      await waitFor(() => {
        expect(screen.getAllByTestId('version-card')).toHaveLength(2)
      })

      // Summary defaults to the latest (SECOND).
      expect(screen.getByAltText('Thumbnail selecionada')).toHaveAttribute(
        'src',
        'data:image/svg+xml;base64,SECOND'
      )

      // Click the first miniature — selection reverts to the older version.
      const [firstCard] = screen.getAllByTestId('version-card')
      await user.click(firstCard)

      await waitFor(() => {
        expect(screen.getByAltText('Thumbnail selecionada')).toHaveAttribute(
          'src',
          'data:image/svg+xml;base64,FIRST'
        )
      })
      // History is preserved — second card is still there.
      expect(screen.getAllByTestId('version-card')).toHaveLength(2)
    })

    it('clears the previous error when a retry succeeds', async () => {
      mockPodcastResponse({ prompts: { episode: { thumbnail: {} } } })
      mockGenerateError(500)
      mockGenerateResponse('data:image/svg+xml;base64,PHN2Zy8+')

      const user = userEvent.setup()
      render(<PhaseThumbnail video={baseVideo} />)
      await waitFor(() => {
        expect(screen.getByTestId('generate-thumbnail-button')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('generate-thumbnail-button'))
      await waitFor(() => {
        expect(screen.getByTestId('thumbnail-error')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('generate-thumbnail-button'))
      await waitFor(() => {
        expect(screen.queryByTestId('thumbnail-error')).not.toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Continuar para Publicar' })).toBeEnabled()
    })
  })
})
