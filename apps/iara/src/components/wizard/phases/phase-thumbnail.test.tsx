/**
 * Tests for PhaseThumbnail — Epic 22 / Story 22.3a (skeleton).
 *
 * The skeleton renders a placeholder card and a "Continuar para Publicar"
 * button that stays disabled until a thumbnail is selected. Interactive
 * behavior (generate / upload / history / crop / persist) lands in the
 * subsequent sub-stories (22.3b through 22.3g).
 */

import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test-utils'

import { PhaseThumbnail } from './phase-thumbnail'
import type { Video } from '@/types/video'

const baseVideo = {
  id: 'video-1',
  videoType: 'episode',
  title: 'Episódio de teste',
} as unknown as Video

describe('PhaseThumbnail (Story 22.3a — skeleton)', () => {
  it('renders the phase heading and skeleton placeholder', () => {
    render(<PhaseThumbnail video={baseVideo} />)
    expect(screen.getByText('Thumbnail')).toBeInTheDocument()
    expect(screen.getByText(/Fase em constru/i)).toBeInTheDocument()
    expect(screen.getByText(/sub-stories 22.3b/)).toBeInTheDocument()
  })

  it('exposes data-video-id for test introspection', () => {
    render(<PhaseThumbnail video={baseVideo} />)
    expect(screen.getByTestId('phase-thumbnail')).toHaveAttribute('data-video-id', 'video-1')
  })

  it('disables "Continuar para Publicar" while no thumbnail is selected', () => {
    render(<PhaseThumbnail video={baseVideo} />)
    expect(screen.getByRole('button', { name: 'Continuar para Publicar' })).toBeDisabled()
  })

  it('enables "Continuar para Publicar" when a thumbnail URL is provided', () => {
    render(
      <PhaseThumbnail
        video={baseVideo}
        selectedThumbnailUrl="https://storage.googleapis.com/bucket/thumb.png"
      />
    )
    expect(screen.getByRole('button', { name: 'Continuar para Publicar' })).toBeEnabled()
  })

  it('calls onAdvance when the enabled button is clicked', () => {
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

  it('does not call onAdvance when the button is disabled', () => {
    const onAdvance = vi.fn()
    render(<PhaseThumbnail video={baseVideo} onAdvance={onAdvance} />)
    screen.getByRole('button', { name: 'Continuar para Publicar' }).click()
    expect(onAdvance).not.toHaveBeenCalled()
  })
})
