import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

import { TranscriptionLoader } from './transcription-loader'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

const mockVideo = {
  id: 'video-123',
  podcastId: 'pptnc',
  title: 'Test Video',
  description: 'Test description',
  duration: 3600,
  thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
  status: 'new' as const,
  videoType: 'episode' as const,
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('TranscriptionLoader', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockClear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('loading state', () => {
    it('shows loading spinner and message on mount', () => {
      // Mock fetch that never resolves
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))

      render(
        <TranscriptionLoader
          video={mockVideo}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      expect(screen.getByTestId('transcription-loader')).toBeInTheDocument()
      expect(screen.getByText('Estamos transcrevendo o seu vídeo...')).toBeInTheDocument()
    })
  })

  describe('success state', () => {
    it('calls onSuccess with transcription data when fetched', async () => {
      const onSuccess = vi.fn()

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            transcriptionSRT: 'SRT content',
            transcriptionTXT: 'TXT content',
          },
        }),
      } as Response)

      render(
        <TranscriptionLoader
          video={mockVideo}
          onSuccess={onSuccess}
          onCancel={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith({
          transcriptionSRT: 'SRT content',
          transcriptionTXT: 'TXT content',
        })
      })
    })
  })

  describe('error states', () => {
    it('shows TRANSCRIPTION_UNAVAILABLE error with Voltar button only', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            code: 'TRANSCRIPTION_UNAVAILABLE',
            message: 'Not available',
          },
        }),
      } as Response)

      render(
        <TranscriptionLoader
          video={mockVideo}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('transcription-loader-error')).toBeInTheDocument()
      })

      expect(
        screen.getByText(/Esse vídeo ainda está em processamento pelo YouTube/i)
      ).toBeInTheDocument()

      // Should have Voltar button but NOT Tentar novamente (not retryable)
      expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument()
    })

    it('shows QUOTA_EXCEEDED error with Voltar button only', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Quota exceeded',
          },
        }),
      } as Response)

      render(
        <TranscriptionLoader
          video={mockVideo}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('transcription-loader-error')).toBeInTheDocument()
      })

      expect(
        screen.getByText(/Limite de requisições atingido/i)
      ).toBeInTheDocument()

      // Should have Voltar button but NOT Tentar novamente (not retryable)
      expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument()
    })

    it('shows network error with both Voltar and Tentar novamente buttons', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      render(
        <TranscriptionLoader
          video={mockVideo}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('transcription-loader-error')).toBeInTheDocument()
      })

      expect(
        screen.getByText(/Erro de conexão/i)
      ).toBeInTheDocument()

      // Should have both buttons (network error is retryable)
      expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument()
    })

    it('shows unknown error with both buttons', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong',
          },
        }),
      } as Response)

      render(
        <TranscriptionLoader
          video={mockVideo}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('transcription-loader-error')).toBeInTheDocument()
      })

      expect(
        screen.getByText(/Ocorreu um erro inesperado/i)
      ).toBeInTheDocument()

      // Should have both buttons (unknown error is retryable)
      expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument()
    })
  })

  describe('interaction', () => {
    it('navigates to /videos when Voltar is clicked', async () => {
      const onCancel = vi.fn()
      const user = userEvent.setup()

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            code: 'TRANSCRIPTION_UNAVAILABLE',
            message: 'Not available',
          },
        }),
      } as Response)

      render(
        <TranscriptionLoader
          video={mockVideo}
          onSuccess={vi.fn()}
          onCancel={onCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('transcription-loader-error')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /voltar/i }))

      expect(onCancel).toHaveBeenCalled()
      expect(mockPush).toHaveBeenCalledWith('/videos')
    })

    it('retries fetch when Tentar novamente is clicked', async () => {
      const user = userEvent.setup()
      let callCount = 0

      // Track calls manually to handle strict mode double-render
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++
        // First calls fail, subsequent calls succeed
        if (callCount <= 2) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              transcriptionSRT: 'SRT content',
              transcriptionTXT: 'TXT content',
            },
          }),
        } as Response)
      })

      const onSuccess = vi.fn()

      render(
        <TranscriptionLoader
          video={mockVideo}
          onSuccess={onSuccess}
          onCancel={vi.fn()}
        />
      )

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByTestId('transcription-loader-error')).toBeInTheDocument()
      })

      // Click retry
      await user.click(screen.getByRole('button', { name: /tentar novamente/i }))

      // Should succeed on retry with transcription data
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith({
          transcriptionSRT: 'SRT content',
          transcriptionTXT: 'TXT content',
        })
      })
    })
  })

  describe('auth errors', () => {
    it('redirects to signin on AUTH_EXPIRED error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            code: 'AUTH_EXPIRED',
            message: 'Session expired',
          },
        }),
      } as Response)

      render(
        <TranscriptionLoader
          video={mockVideo}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/api/auth/signin')
      })
    })
  })
})
