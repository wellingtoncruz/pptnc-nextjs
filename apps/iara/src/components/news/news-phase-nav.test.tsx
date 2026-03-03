import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NewsPhaseNav } from './news-phase-nav'

describe('NewsPhaseNav', () => {
  it('renders all 3 phase labels', () => {
    render(<NewsPhaseNav currentPhase={1} maxReachablePhase={1} onPhaseChange={vi.fn()} />)

    expect(screen.getByText('Notícia')).toBeInTheDocument()
    expect(screen.getByText('Episódios')).toBeInTheDocument()
    expect(screen.getByText('Redação')).toBeInTheDocument()
  })

  it('disables unreachable phases', () => {
    render(<NewsPhaseNav currentPhase={1} maxReachablePhase={1} onPhaseChange={vi.fn()} />)

    expect(screen.getByTestId('news-phase-1')).not.toBeDisabled()
    expect(screen.getByTestId('news-phase-2')).toBeDisabled()
    expect(screen.getByTestId('news-phase-3')).toBeDisabled()
  })

  it('enables reachable phases', () => {
    render(<NewsPhaseNav currentPhase={1} maxReachablePhase={3} onPhaseChange={vi.fn()} />)

    expect(screen.getByTestId('news-phase-1')).not.toBeDisabled()
    expect(screen.getByTestId('news-phase-2')).not.toBeDisabled()
    expect(screen.getByTestId('news-phase-3')).not.toBeDisabled()
  })

  it('calls onPhaseChange when clicking a reachable phase', async () => {
    const user = userEvent.setup()
    const onPhaseChange = vi.fn()
    render(<NewsPhaseNav currentPhase={1} maxReachablePhase={2} onPhaseChange={onPhaseChange} />)

    await user.click(screen.getByTestId('news-phase-2'))

    expect(onPhaseChange).toHaveBeenCalledWith(2)
  })

  it('sets aria-current on active phase', () => {
    render(<NewsPhaseNav currentPhase={2} maxReachablePhase={3} onPhaseChange={vi.fn()} />)

    expect(screen.getByTestId('news-phase-2')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('news-phase-1')).not.toHaveAttribute('aria-current')
  })
})
