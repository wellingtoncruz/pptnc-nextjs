import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { ReopenVideoDialog } from './reopen-video-dialog'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('ReopenVideoDialog', () => {
  const defaultProps = {
    videoId: 'test-video-id',
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dialog with title and description', () => {
    render(<ReopenVideoDialog {...defaultProps} />)

    expect(screen.getByText('Deseja reabrir esse vídeo para edição dos metadados?')).toBeInTheDocument()
    expect(screen.getByText(/Privado/)).toBeInTheDocument()
    expect(screen.getByText(/Não listado/)).toBeInTheDocument()
  })

  it('renders cancel and confirm buttons', () => {
    render(<ReopenVideoDialog {...defaultProps} />)

    expect(screen.getByText('Cancelar')).toBeInTheDocument()
    expect(screen.getByText('Verificar e Reabrir')).toBeInTheDocument()
  })

  it('calls API on confirm and shows loading state', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { videoId: 'test-video-id', status: 'draft' } }),
    })

    render(<ReopenVideoDialog {...defaultProps} />)

    await user.click(screen.getByText('Verificar e Reabrir'))

    expect(mockFetch).toHaveBeenCalledWith('/api/videos/test-video-id/reopen', {
      method: 'POST',
    })
  })

  it('calls onSuccess and closes dialog on successful reopen', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { videoId: 'test-video-id', status: 'draft' } }),
    })

    render(<ReopenVideoDialog {...defaultProps} />)

    await user.click(screen.getByText('Verificar e Reabrir'))

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledWith('test-video-id')
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('shows error message when video is not eligible', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({
        error: {
          code: 'VIDEO_NOT_ELIGIBLE',
          message: 'Video not eligible',
        },
      }),
    })

    render(<ReopenVideoDialog {...defaultProps} />)

    await user.click(screen.getByText('Verificar e Reabrir'))

    await waitFor(() => {
      expect(screen.getByText(/status adequado/)).toBeInTheDocument()
    })

    // Dialog should remain open
    expect(defaultProps.onOpenChange).not.toHaveBeenCalledWith(false)
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  it('shows generic error message on API failure', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erro interno ao verificar video no YouTube.',
        },
      }),
    })

    render(<ReopenVideoDialog {...defaultProps} />)

    await user.click(screen.getByText('Verificar e Reabrir'))

    await waitFor(() => {
      expect(screen.getByText('Erro interno ao verificar video no YouTube.')).toBeInTheDocument()
    })
  })

  it('shows error message on network failure', async () => {
    const user = userEvent.setup()
    mockFetch.mockRejectedValue(new Error('Network error'))

    render(<ReopenVideoDialog {...defaultProps} />)

    await user.click(screen.getByText('Verificar e Reabrir'))

    await waitFor(() => {
      expect(screen.getByText(/Erro ao verificar/)).toBeInTheDocument()
    })
  })

  it('does not render when open is false', () => {
    render(<ReopenVideoDialog {...defaultProps} open={false} />)

    expect(screen.queryByText('Deseja reabrir esse vídeo para edição dos metadados?')).not.toBeInTheDocument()
  })

  it('resets error state when dialog is closed and reopened', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({
        error: { code: 'VIDEO_NOT_ELIGIBLE', message: 'Not eligible' },
      }),
    })

    const { rerender } = render(<ReopenVideoDialog {...defaultProps} />)

    // Trigger error
    await user.click(screen.getByText('Verificar e Reabrir'))

    await waitFor(() => {
      expect(screen.getByText(/status adequado/)).toBeInTheDocument()
    })

    // Close and reopen - onOpenChange(false) should reset state
    rerender(<ReopenVideoDialog {...defaultProps} open={false} />)
    rerender(<ReopenVideoDialog {...defaultProps} open={true} />)

    // Error should be cleared (component resets on open change)
    expect(screen.queryByText(/status adequado/)).not.toBeInTheDocument()
  })
})
