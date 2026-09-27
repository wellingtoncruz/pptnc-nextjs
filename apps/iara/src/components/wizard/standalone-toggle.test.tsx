/**
 * Tests for StandaloneToggle (Epic 25 Bloco B — Vídeo Avulso).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { StandaloneToggle } from './standalone-toggle'
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

describe('StandaloneToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing for episodes (out of scope)', () => {
    render(<StandaloneToggle video={makeVideo({ videoType: 'episode' })} onToggle={vi.fn()} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText('Vídeo avulso')).not.toBeInTheDocument()
  })

  it('renders the switch + label for cut/reel', () => {
    render(<StandaloneToggle video={makeVideo({ videoType: 'reel' })} onToggle={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Vídeo avulso' })).toBeInTheDocument()
    expect(screen.getByText('Vídeo avulso')).toBeInTheDocument()
  })

  it('reflects the current flag (checked when standalone)', () => {
    render(<StandaloneToggle video={makeVideo({ standalone: true })} onToggle={vi.fn()} />)
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('turning ON opens the confirmation dialog WITHOUT calling onToggle yet', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(<StandaloneToggle video={makeVideo({ standalone: false })} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('switch'))

    expect(await screen.findByText('Marcar como vídeo avulso?')).toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('confirming the dialog calls onToggle(true)', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(<StandaloneToggle video={makeVideo({ standalone: false })} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(true))
  })

  // Adendo do Epic 25: desmarcar ESPURGA o wizard — passou a exigir confirmação.
  it('turning OFF asks for confirmation (it purges the wizard) before onToggle(false)', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(<StandaloneToggle video={makeVideo({ standalone: true })} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('switch'))

    expect(await screen.findByText('Deixar de ser avulso?')).toBeInTheDocument()
    expect(screen.getByText(/recomeça do zero/)).toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(false))
  })

  it('cancelling the purge confirmation changes nothing', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(<StandaloneToggle video={makeVideo({ standalone: true })} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(onToggle).not.toHaveBeenCalled()
  })

  describe('seletor de tipo do avulso (adendo do Epic 25)', () => {
    it('só aparece quando o vídeo é avulso', () => {
      const { unmount } = render(
        <StandaloneToggle video={makeVideo({ standalone: false })} onToggle={vi.fn()} onReclassify={vi.fn()} />
      )
      expect(screen.queryByRole('group', { name: 'Tipo do vídeo avulso' })).not.toBeInTheDocument()
      unmount()

      render(<StandaloneToggle video={makeVideo({ standalone: true })} onToggle={vi.fn()} onReclassify={vi.fn()} />)
      const group = screen.getByRole('group', { name: 'Tipo do vídeo avulso' })
      expect(within(group).getByRole('button', { name: 'Corte' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('avulso reclassificado como episódio continua com o controle (dá para desfazer)', () => {
      render(
        <StandaloneToggle
          video={makeVideo({ standalone: true, videoType: 'episode' })}
          onToggle={vi.fn()}
          onReclassify={vi.fn()}
        />
      )
      expect(screen.getByRole('switch')).toBeChecked()
      expect(screen.getByRole('button', { name: 'Episódio' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('escolher outro tipo confirma o espurgo antes de reclassificar', async () => {
      const onReclassify = vi.fn().mockResolvedValue(undefined)
      render(
        <StandaloneToggle video={makeVideo({ standalone: true })} onToggle={vi.fn()} onReclassify={onReclassify} />
      )

      await userEvent.click(screen.getByRole('button', { name: 'Episódio' }))
      expect(await screen.findByText('Reclassificar como Episódio?')).toBeInTheDocument()
      expect(onReclassify).not.toHaveBeenCalled()

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
      await waitFor(() => expect(onReclassify).toHaveBeenCalledWith('episode'))
    })

    it('o tipo atual não é clicável (reclassificar para o mesmo tipo espurgaria por nada)', () => {
      render(<StandaloneToggle video={makeVideo({ standalone: true })} onToggle={vi.fn()} onReclassify={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Corte' })).toBeDisabled()
    })
  })
})
