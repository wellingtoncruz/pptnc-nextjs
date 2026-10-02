/**
 * Tests for StandaloneToggle (Epic 25 Bloco B; Adendo B — 2026-10-02).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { StandaloneToggle } from './standalone-toggle'
import type { VideoRelations } from '@/lib/wizard/video-relations'
import type { Video } from '@/types/video'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v1',
    title: 'Vídeo de teste',
    videoType: 'cut',
    standalone: false,
    ...overrides,
  } as unknown as Video
}

const NONE: VideoRelations = { parent: null, children: [] }

describe('StandaloneToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Adendo B: avulso vale para qualquer tipo, inclusive episódio.
  it.each(['episode', 'cut', 'reel'] as const)('aparece para %s', (videoType) => {
    render(<StandaloneToggle video={makeVideo({ videoType })} relations={NONE} onToggle={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Vídeo avulso' })).toBeInTheDocument()
  })

  it('reflete a flag atual', () => {
    render(<StandaloneToggle video={makeVideo({ standalone: true })} relations={NONE} onToggle={vi.fn()} />)
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('marcar fica travado enquanto os vínculos carregam', () => {
    render(<StandaloneToggle video={makeVideo()} relations={null} onToggle={vi.fn()} />)
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('sem vínculo: marcar pede confirmação e chama onToggle(true)', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(<StandaloneToggle video={makeVideo()} relations={NONE} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('switch'))
    expect(await screen.findByText('Marcar como vídeo avulso?')).toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(true))
  })

  // A opção fica visível e explica o vínculo que impede — sem chamar o servidor.
  it('corte com pai: bloqueia mostrando o episódio pai', async () => {
    const onToggle = vi.fn()
    const relations = { parent: { id: 'ep-1', title: 'Episódio do pai' }, children: [] }
    render(<StandaloneToggle video={makeVideo()} relations={relations} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('switch'))

    expect(await screen.findByText('Este vídeo não pode ser avulso')).toBeInTheDocument()
    expect(screen.getByText('Episódio do pai')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('episódio com filhos: bloqueia listando os filhos e o que fazer', async () => {
    const relations = {
      parent: null,
      children: [
        { id: 'c1', title: 'Corte A', videoType: 'cut' },
        { id: 'r1', title: 'Reel B', videoType: 'reel' },
      ],
    }
    render(
      <StandaloneToggle video={makeVideo({ videoType: 'episode' })} relations={relations} onToggle={vi.fn()} />
    )

    await userEvent.click(screen.getByRole('switch'))

    expect(await screen.findByText('Ele tem 2 vídeos vinculados:')).toBeInTheDocument()
    expect(screen.getByText('Corte A')).toBeInTheDocument()
    expect(screen.getByText('Reel B')).toBeInTheDocument()
    expect(screen.getByText(/Aponte esses vídeos para outro episódio/)).toBeInTheDocument()
  })

  // Desmarcar: o produtor escolhe o tipo (a régua não decide) e o wizard é espurgado.
  it('desmarcar exige escolher o tipo antes de confirmar', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(<StandaloneToggle video={makeVideo({ standalone: true })} relations={NONE} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('switch'))
    expect(await screen.findByText('Deixar de ser avulso?')).toBeInTheDocument()
    expect(screen.getByText(/recomeça do zero/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: 'Episódio' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(false, 'episode'))
  })

  it('desmarcar escolhendo corte avisa que vai pedir episódio pai', async () => {
    render(<StandaloneToggle video={makeVideo({ standalone: true })} relations={NONE} onToggle={vi.fn()} />)

    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(await screen.findByRole('radio', { name: 'Corte' }))

    expect(screen.getByText(/vai pedir um episódio pai/)).toBeInTheDocument()
  })

  it('cancelar não chama onToggle', async () => {
    const onToggle = vi.fn()
    render(<StandaloneToggle video={makeVideo({ standalone: true })} relations={NONE} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(onToggle).not.toHaveBeenCalled()
  })
})
