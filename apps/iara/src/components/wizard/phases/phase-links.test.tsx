import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'

import { render, screen, waitFor } from '@/test-utils'

import { PhaseLinks } from './phase-links'
import type { Video } from '@/types/video'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'ep-1',
    title: 'Episódio 1',
    videoType: 'episode',
    status: 'ready',
    ...overrides,
  } as Video
}

describe('PhaseLinks (Epic 26)', () => {
  let onLinksChange: ReturnType<typeof vi.fn>
  let onAdvance: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onLinksChange = vi.fn().mockResolvedValue(undefined)
    onAdvance = vi.fn()
  })

  it('renders existing links from the video', () => {
    const video = makeVideo({
      links: [{ url: 'https://exemplo.com/a', description: 'Link A', includeInDescription: true }],
    })
    render(<PhaseLinks video={video} onLinksChange={onLinksChange} onAdvance={onAdvance} />)

    expect(screen.getByText('Link A')).toBeInTheDocument()
    expect(screen.getByText('https://exemplo.com/a')).toBeInTheDocument()
    expect(screen.getByText('1 link cadastrado')).toBeInTheDocument()
  })

  it('adds a valid link and persists the full array', async () => {
    const user = userEvent.setup()
    render(<PhaseLinks video={makeVideo()} onLinksChange={onLinksChange} onAdvance={onAdvance} />)

    await user.type(screen.getByLabelText('URL'), 'https://github.com/x/y')
    await user.type(screen.getByLabelText('Descrição'), 'Repositório')
    await user.click(screen.getByRole('button', { name: /adicionar link/i }))

    await waitFor(() =>
      expect(onLinksChange).toHaveBeenCalledWith([
        { url: 'https://github.com/x/y', description: 'Repositório', includeInDescription: false },
      ])
    )
  })

  it('rejects an invalid URL without persisting', async () => {
    const user = userEvent.setup()
    render(<PhaseLinks video={makeVideo()} onLinksChange={onLinksChange} onAdvance={onAdvance} />)

    await user.type(screen.getByLabelText('URL'), 'not-a-url')
    await user.type(screen.getByLabelText('Descrição'), 'Algo')
    await user.click(screen.getByRole('button', { name: /adicionar link/i }))

    expect(screen.getByText(/url inválida/i)).toBeInTheDocument()
    expect(onLinksChange).not.toHaveBeenCalled()
  })

  it('requires both url and description', async () => {
    const user = userEvent.setup()
    render(<PhaseLinks video={makeVideo()} onLinksChange={onLinksChange} onAdvance={onAdvance} />)

    await user.type(screen.getByLabelText('URL'), 'https://exemplo.com')
    await user.click(screen.getByRole('button', { name: /adicionar link/i }))

    expect(screen.getByText(/informe a url e a descrição/i)).toBeInTheDocument()
    expect(onLinksChange).not.toHaveBeenCalled()
  })

  it('removes a link', async () => {
    const user = userEvent.setup()
    const video = makeVideo({
      links: [{ url: 'https://exemplo.com/a', description: 'Link A', includeInDescription: false }],
    })
    render(<PhaseLinks video={video} onLinksChange={onLinksChange} onAdvance={onAdvance} />)

    await user.click(screen.getByRole('button', { name: /remover link a/i }))

    await waitFor(() => expect(onLinksChange).toHaveBeenCalledWith([]))
  })

  it('toggles includeInDescription', async () => {
    const user = userEvent.setup()
    const video = makeVideo({
      links: [{ url: 'https://exemplo.com/a', description: 'Link A', includeInDescription: false }],
    })
    render(<PhaseLinks video={video} onLinksChange={onLinksChange} onAdvance={onAdvance} />)

    await user.click(screen.getByRole('switch', { name: /incluir link a na descrição/i }))

    await waitFor(() =>
      expect(onLinksChange).toHaveBeenCalledWith([
        { url: 'https://exemplo.com/a', description: 'Link A', includeInDescription: true },
      ])
    )
  })

  it('shows the non-actionable mentions badge when edit-check detected links (Bloco D)', () => {
    const video = makeVideo({
      mentionedLinks: [
        { timestamp: '00:08:10', context: 'Vai deixar o link do projeto na descrição' },
        { timestamp: '00:21:00', context: 'Cita um card com o site do convidado' },
      ],
    })
    render(<PhaseLinks video={video} onLinksChange={onLinksChange} onAdvance={onAdvance} />)

    expect(screen.getByText('O vídeo menciona links em 2 pontos')).toBeInTheDocument()
    expect(screen.getByText('00:08:10')).toBeInTheDocument()
    expect(screen.getByText('Vai deixar o link do projeto na descrição')).toBeInTheDocument()
  })

  it('does not show the mentions badge when there are no mentions', () => {
    render(<PhaseLinks video={makeVideo()} onLinksChange={onLinksChange} onAdvance={onAdvance} />)
    expect(screen.queryByText(/o vídeo menciona/i)).not.toBeInTheDocument()
  })

  it('advances with zero links (valid reviewed state, ADR-26.5)', async () => {
    const user = userEvent.setup()
    render(<PhaseLinks video={makeVideo()} onLinksChange={onLinksChange} onAdvance={onAdvance} />)

    const advance = screen.getByRole('button', { name: /avançar para publicar/i })
    expect(advance).toBeEnabled()
    await user.click(advance)
    expect(onAdvance).toHaveBeenCalledTimes(1)
  })
})
