import { render, screen } from '@/test-utils'

import { SyncOverlay } from './sync-overlay'

describe('SyncOverlay', () => {
  it('não renderiza quando isOpen é false', () => {
    render(<SyncOverlay isOpen={false} />)

    expect(screen.queryByTestId('sync-overlay')).not.toBeInTheDocument()
  })

  it('renderiza quando isOpen é true', () => {
    render(<SyncOverlay isOpen={true} />)

    expect(screen.getByTestId('sync-overlay')).toBeInTheDocument()
  })

  it('exibe mensagem padrão', () => {
    render(<SyncOverlay isOpen={true} />)

    expect(screen.getByText('Verificando novos vídeos...')).toBeInTheDocument()
  })

  it('exibe mensagem customizada', () => {
    render(<SyncOverlay isOpen={true} message="Sincronizando..." />)

    expect(screen.getByText('Sincronizando...')).toBeInTheDocument()
  })

  it('tem role="dialog" para a11y', () => {
    render(<SyncOverlay isOpen={true} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('tem aria-modal="true"', () => {
    render(<SyncOverlay isOpen={true} />)

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('exibe spinner animado', () => {
    render(<SyncOverlay isOpen={true} />)

    const overlay = screen.getByTestId('sync-overlay')
    const spinner = overlay.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })
})
