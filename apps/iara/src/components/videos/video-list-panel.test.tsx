import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { VideoListPanel } from './video-list-panel'

describe('VideoListPanel', () => {
  it('renderiza o header com título', () => {
    render(<VideoListPanel />)

    expect(screen.getByText('Vídeos')).toBeInTheDocument()
  })

  it('renderiza o botão de sincronização', () => {
    render(<VideoListPanel />)

    expect(screen.getByRole('button', { name: /verificar novos/i })).toBeInTheDocument()
  })

  it('chama onSync quando botão é clicado', async () => {
    const user = userEvent.setup()
    const onSync = vi.fn()

    render(<VideoListPanel onSync={onSync} />)

    const syncButton = screen.getByRole('button', { name: /verificar novos/i })
    await user.click(syncButton)

    expect(onSync).toHaveBeenCalledTimes(1)
  })

  it('desabilita botão e mostra loading durante sync', () => {
    render(<VideoListPanel isSyncing={true} />)

    const syncButton = screen.getByRole('button', { name: /verificando/i })
    expect(syncButton).toBeDisabled()
  })

  it('mostra empty state quando não há vídeos', () => {
    render(<VideoListPanel />)

    expect(screen.getByTestId('video-list-empty')).toBeInTheDocument()
    expect(screen.getByText('Nenhum vídeo encontrado')).toBeInTheDocument()
  })

  it('renderiza com data-testid correto', () => {
    render(<VideoListPanel />)

    expect(screen.getByTestId('video-list-panel')).toBeInTheDocument()
  })
})
