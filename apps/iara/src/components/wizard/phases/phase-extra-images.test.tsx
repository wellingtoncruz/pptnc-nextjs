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

  /**
   * O caso que escapou na homologação de 2026-07-28: o orquestrador monta a fase
   * com `videoData` ainda vazio e só depois hidrata do Firestore. Inicializar o
   * estado com o prop congelava `undefined` e a fase abria sem as imagens
   * salvas. Os outros testes não pegavam isso porque já passam o prop no
   * primeiro render.
   */
  it('shows images that arrive only after the first render', async () => {
    const { rerender } = render(<PhaseExtraImages video={episode} />)

    await waitFor(() => {
      expect(screen.getByTestId('story-empty')).toBeInTheDocument()
    })

    rerender(
      <PhaseExtraImages
        video={episode}
        selectedExtraImages={{
          story: '/api/wizard/extra-images/select?path=extra-images/p/v/story-1.png',
          vitrine: '/api/wizard/extra-images/select?path=extra-images/p/v/vitrine-1.png',
          feed: '/api/wizard/extra-images/select?path=extra-images/p/v/feed-1.png',
        }}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('story-selected')).toBeInTheDocument()
    })
    expect(screen.getByTestId('vitrine-selected')).toBeInTheDocument()
    expect(screen.getByTestId('feed-selected')).toBeInTheDocument()
    expect(screen.queryByTestId('story-empty')).not.toBeInTheDocument()
  })

  it('keeps a session selection over a later hydration of the same kind', async () => {
    const hydrated = '/api/wizard/extra-images/select?path=extra-images/p/v/story-old.png'
    const { rerender } = render(<PhaseExtraImages video={episode} />)

    await waitFor(() => {
      expect(screen.getByTestId('story-empty')).toBeInTheDocument()
    })

    rerender(<PhaseExtraImages video={episode} selectedExtraImages={{ story: hydrated }} />)

    await waitFor(() => {
      expect(screen.getByTestId('story-selected')).toBeInTheDocument()
    })
    expect(screen.getByTestId('download-story')).toHaveAttribute('href', hydrated)
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

  it('marks an already persisted image as saved', async () => {
    render(
      <PhaseExtraImages
        video={episode}
        selectedExtraImages={{ story: '/api/wizard/extra-images/select?path=extra-images/p/v/story-1.png' }}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('story-saved-badge')).toBeInTheDocument()
    })
  })

  /**
   * Selecionada = salva: não há botão de salvar por quadro (o Thumbnail também
   * não tem). A persistência acontece no Continuar.
   */
  it('has no per-kind save button', async () => {
    render(<PhaseExtraImages video={episode} />)

    await waitFor(() => {
      expect(screen.getByTestId('extra-image-story')).toBeInTheDocument()
    })
    for (const kind of ['story', 'vitrine', 'feed']) {
      expect(screen.queryByTestId(`save-${kind}-button`)).not.toBeInTheDocument()
    }
  })

  /**
   * Reclicar Continuar sem trocar nada não pode gerar cópia nova no bucket nem
   * escrita no Firestore. O caminho de persistência em si (seleção nova → POST
   * → URL final) é coberto pelos tests da rota `/extra-images/select`, que
   * exercitam a mesma chamada sem precisar simular o job de geração aqui.
   */
  it('does not re-send an unchanged selection on advance', async () => {
    const user = userEvent.setup()
    const onAdvance = vi.fn()
    const savedUrl = '/api/wizard/extra-images/select?path=extra-images/p/v/feed-9.png'

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/podcast')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { prompts: { episode: { extraImages: { story: filled, vitrine: filled, feed: filled } } } },
          }),
        })
      }
      if (typeof url === 'string' && url.includes('/extra-images/select')) {
        const body = JSON.parse(String(init?.body))
        return Promise.resolve({ ok: true, json: async () => ({ imageUrl: savedUrl, kind: body.kind }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(
      <PhaseExtraImages
        video={episode}
        onAdvance={onAdvance}
        selectedExtraImages={{ story: '/api/already-saved-story.png' }}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('continuar-extra-images')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('continuar-extra-images'))

    // Story já estava persistida e não mudou — não deve ser reenviada.
    await waitFor(() => {
      expect(onAdvance).toHaveBeenCalledWith({
        extraImages: { story: '/api/already-saved-story.png' },
      })
    })
    const selectCalls = mockFetch.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/extra-images/select')
    )
    expect(selectCalls).toHaveLength(0)
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
