/**
 * Tests for VideoTypeControl (Epic 25, Adendo B — 2026-10-02).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { VideoTypeControl } from './video-type-control'
import type { Video } from '@/types/video'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return { id: 'v1', title: 'V', videoType: 'cut', standalone: false, ...overrides } as unknown as Video
}

describe('VideoTypeControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marca o tipo atual e o deixa desabilitado', () => {
    render(<VideoTypeControl video={makeVideo()} onReclassify={vi.fn()} />)
    const current = screen.getByRole('button', { name: 'Corte' })
    expect(current).toHaveAttribute('aria-pressed', 'true')
    expect(current).toBeDisabled()
  })

  it('confirma antes de reclassificar e avisa do espurgo', async () => {
    const onReclassify = vi.fn().mockResolvedValue(undefined)
    render(<VideoTypeControl video={makeVideo()} onReclassify={onReclassify} />)

    await userEvent.click(screen.getByRole('button', { name: 'Episódio' }))
    expect(await screen.findByText('Reclassificar como Episódio?')).toBeInTheDocument()
    expect(screen.getByText(/recomeça do zero/)).toBeInTheDocument()
    expect(onReclassify).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(onReclassify).toHaveBeenCalledWith('episode'))
  })

  // Reclassificar não torna avulso: corte/reel comum segue precisando de pai.
  it('vídeo comum virando corte/reel: avisa que vai pedir episódio pai', async () => {
    render(<VideoTypeControl video={makeVideo({ videoType: 'episode' })} onReclassify={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reel' }))
    expect(await screen.findByText(/vai pedir um episódio pai/)).toBeInTheDocument()
  })

  it('avulso virando corte: sem aviso de pai (avulso não tem pai)', async () => {
    render(<VideoTypeControl video={makeVideo({ videoType: 'episode', standalone: true })} onReclassify={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Corte' }))
    await screen.findByText('Reclassificar como Corte?')
    expect(screen.queryByText(/vai pedir um episódio pai/)).not.toBeInTheDocument()
  })

  it('reel virando episódio: avisa da thumbnail horizontal', async () => {
    render(<VideoTypeControl video={makeVideo({ videoType: 'reel' })} onReclassify={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Episódio' }))
    expect(await screen.findByText(/thumbnail de episódio é horizontal/)).toBeInTheDocument()
  })
})
