/**
 * Tests for StandaloneToggle (Epic 25 Bloco B — Vídeo Avulso).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test-utils'
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

  it('turning OFF calls onToggle(false) directly (no confirmation needed)', async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(<StandaloneToggle video={makeVideo({ standalone: true })} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('switch'))

    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(false))
    expect(screen.queryByText('Marcar como vídeo avulso?')).not.toBeInTheDocument()
  })
})
