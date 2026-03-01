import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { NewsletterPhaseNav } from './newsletter-phase-nav'

describe('NewsletterPhaseNav', () => {
  it('renderiza 4 fases com labels corretos', () => {
    render(<NewsletterPhaseNav currentPhase={1} maxReachablePhase={4} onPhaseChange={vi.fn()} />)

    expect(screen.getByTestId('phase-1')).toHaveTextContent('Draft')
    expect(screen.getByTestId('phase-2')).toHaveTextContent('Notícias')
    expect(screen.getByTestId('phase-3')).toHaveTextContent('Imagem')
    expect(screen.getByTestId('phase-4')).toHaveTextContent('Formato')
  })

  it('destaca fase ativa com classe bg-primary', () => {
    render(<NewsletterPhaseNav currentPhase={2} maxReachablePhase={3} onPhaseChange={vi.fn()} />)

    expect(screen.getByTestId('phase-2')).toHaveClass('bg-primary')
    expect(screen.getByTestId('phase-1')).not.toHaveClass('bg-primary')
    expect(screen.getByTestId('phase-3')).not.toHaveClass('bg-primary')
  })

  it('permite clicar em fases ≤ maxReachablePhase', async () => {
    const user = userEvent.setup()
    const onPhaseChange = vi.fn()
    render(<NewsletterPhaseNav currentPhase={1} maxReachablePhase={3} onPhaseChange={onPhaseChange} />)

    await user.click(screen.getByTestId('phase-2'))
    expect(onPhaseChange).toHaveBeenCalledWith(2)

    await user.click(screen.getByTestId('phase-3'))
    expect(onPhaseChange).toHaveBeenCalledWith(3)
  })

  it('desabilita fases > maxReachablePhase', () => {
    render(<NewsletterPhaseNav currentPhase={1} maxReachablePhase={2} onPhaseChange={vi.fn()} />)

    expect(screen.getByTestId('phase-3')).toBeDisabled()
    expect(screen.getByTestId('phase-4')).toBeDisabled()
    expect(screen.getByTestId('phase-1')).not.toBeDisabled()
    expect(screen.getByTestId('phase-2')).not.toBeDisabled()
  })

  it('chama onPhaseChange ao clicar em fase acessível', async () => {
    const user = userEvent.setup()
    const onPhaseChange = vi.fn()
    render(<NewsletterPhaseNav currentPhase={3} maxReachablePhase={4} onPhaseChange={onPhaseChange} />)

    await user.click(screen.getByTestId('phase-1'))
    expect(onPhaseChange).toHaveBeenCalledWith(1)

    // Disabled phase should not call handler
    onPhaseChange.mockClear()
    await user.click(screen.getByTestId('phase-4'))
    expect(onPhaseChange).toHaveBeenCalledWith(4)
  })
})
