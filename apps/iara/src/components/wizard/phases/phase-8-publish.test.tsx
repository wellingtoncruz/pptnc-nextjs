import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test-utils'

import { Phase8Publish } from './phase-8-publish'
import type { Video } from '@/types/video'

// Mock video data with all required fields for Phase 8
const mockVideoComplete: Video = {
  id: 'test-video-123',
  podcastId: 'test-podcast',
  title: 'Meu Video Completo',
  description: 'Esta e uma descricao completa do video com bastante texto para testar.',
  thumbnail: 'https://example.com/thumb.jpg',
  duration: 3600,
  publishedAt: new Date().toISOString(),
  status: 'ready',
  videoType: 'episode',
  transcriptionTXT: 'Test transcript',
  transcriptionSRT: '00:00:00,000 --> 00:00:05,000\nTest',
  tags: ['podcast', 'tecnologia', 'inovacao'],
  chapters: [
    { timestamp: '00:00', title: 'Introducao' },
    { timestamp: '05:30', title: 'Topico Principal' },
    { timestamp: '15:00', title: 'Conclusao' },
  ],
  createdAt: { toDate: () => new Date() } as never,
  updatedAt: { toDate: () => new Date() } as never,
}

// Mock video without required fields
const mockVideoIncomplete: Video = {
  id: 'test-video-456',
  podcastId: 'test-podcast',
  title: '',
  description: '',
  thumbnail: 'https://example.com/thumb.jpg',
  duration: 3600,
  publishedAt: new Date().toISOString(),
  status: 'ready',
  videoType: 'episode',
  transcriptionTXT: 'Test transcript',
  transcriptionSRT: '00:00:00,000 --> 00:00:05,000\nTest',
  createdAt: { toDate: () => new Date() } as never,
  updatedAt: { toDate: () => new Date() } as never,
}

describe('Phase8Publish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Metadata summary display', () => {
    it('displays video title', () => {
      render(<Phase8Publish video={mockVideoComplete} />)
      expect(screen.getByText('Meu Video Completo')).toBeInTheDocument()
    })

    it('displays full description (not truncated)', () => {
      const longDescription = 'a'.repeat(250)
      const videoWithLongDesc = { ...mockVideoComplete, description: longDescription }
      render(<Phase8Publish video={videoWithLongDesc} />)
      // Should show full description
      expect(screen.getByText(longDescription)).toBeInTheDocument()
    })

    it('displays tags section with count', () => {
      render(<Phase8Publish video={mockVideoComplete} />)
      expect(screen.getByText('Tags (3)')).toBeInTheDocument()
    })

    it('displays all tag badges', () => {
      render(<Phase8Publish video={mockVideoComplete} />)
      expect(screen.getByText('podcast')).toBeInTheDocument()
      expect(screen.getByText('tecnologia')).toBeInTheDocument()
      expect(screen.getByText('inovacao')).toBeInTheDocument()
    })

    it('displays chapters with timestamps', () => {
      render(<Phase8Publish video={mockVideoComplete} />)
      expect(screen.getByText('00:00')).toBeInTheDocument()
      expect(screen.getByText('Introducao')).toBeInTheDocument()
      expect(screen.getByText('05:30')).toBeInTheDocument()
      expect(screen.getByText('Topico Principal')).toBeInTheDocument()
    })

    it('displays single tag correctly', () => {
      const videoWith1Tag = { ...mockVideoComplete, tags: ['unica'] }
      render(<Phase8Publish video={videoWith1Tag} />)
      expect(screen.getByText('Tags (1)')).toBeInTheDocument()
      expect(screen.getByText('unica')).toBeInTheDocument()
    })
  })

  describe('Send button', () => {
    it('shows "Enviar para o YouTube" button when ready', () => {
      render(<Phase8Publish video={mockVideoComplete} />)
      expect(screen.getByRole('button', { name: /enviar para o youtube/i })).toBeInTheDocument()
    })

    it('enables send button when all fields are valid', () => {
      render(<Phase8Publish video={mockVideoComplete} />)
      const button = screen.getByRole('button', { name: /enviar para o youtube/i })
      expect(button).not.toBeDisabled()
    })

    it('disables send button when title is missing', () => {
      render(<Phase8Publish video={mockVideoIncomplete} />)
      const button = screen.getByRole('button', { name: /enviar para o youtube/i })
      expect(button).toBeDisabled()
    })

    it('disables send button when description is missing', () => {
      const videoNoDesc = { ...mockVideoComplete, description: '' }
      render(<Phase8Publish video={videoNoDesc} />)
      const button = screen.getByRole('button', { name: /enviar para o youtube/i })
      expect(button).toBeDisabled()
    })

    it('disables send button when tags are missing', () => {
      const videoNoTags = { ...mockVideoComplete, tags: [] }
      render(<Phase8Publish video={videoNoTags} />)
      const button = screen.getByRole('button', { name: /enviar para o youtube/i })
      expect(button).toBeDisabled()
    })

    it('shows validation warning when fields are missing', () => {
      render(<Phase8Publish video={mockVideoIncomplete} />)
      expect(screen.getByText(/preencha título, descrição e pelo menos 1 tag/i)).toBeInTheDocument()
    })

    it('calls onSend when button is clicked', () => {
      const onSend = vi.fn()
      render(<Phase8Publish video={mockVideoComplete} onSend={onSend} />)

      const button = screen.getByRole('button', { name: /enviar para o youtube/i })
      fireEvent.click(button)

      expect(onSend).toHaveBeenCalledTimes(1)
    })
  })

  describe('Loading state', () => {
    it('shows loading state when sending', () => {
      render(<Phase8Publish video={mockVideoComplete} isSending />)
      expect(screen.getByText(/enviando/i)).toBeInTheDocument()
    })

    it('disables button when sending', () => {
      render(<Phase8Publish video={mockVideoComplete} isSending />)
      const button = screen.getByRole('button', { name: /enviando/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Success state', () => {
    it('shows success message when sent', () => {
      render(<Phase8Publish video={mockVideoComplete} isSent />)
      expect(screen.getByText(/publicado com sucesso/i)).toBeInTheDocument()
    })

    it('shows "Concluido" button when sent', () => {
      render(<Phase8Publish video={mockVideoComplete} isSent />)
      expect(screen.getByRole('button', { name: /concluido/i })).toBeInTheDocument()
    })

    it('disables button when sent', () => {
      render(<Phase8Publish video={mockVideoComplete} isSent />)
      const button = screen.getByRole('button', { name: /concluido/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Error state', () => {
    it('shows error message when error occurs', () => {
      render(
        <Phase8Publish
          video={mockVideoComplete}
          error="Erro ao conectar com o YouTube"
        />
      )
      expect(screen.getByText(/erro ao enviar/i)).toBeInTheDocument()
      expect(screen.getByText(/erro ao conectar com o youtube/i)).toBeInTheDocument()
    })

    it('shows retry button when error occurs', () => {
      const onRetry = vi.fn()
      render(
        <Phase8Publish
          video={mockVideoComplete}
          error="Erro de timeout"
          onRetry={onRetry}
        />
      )
      const retryButton = screen.getByRole('button', { name: /tentar novamente/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('calls onRetry when retry button is clicked', () => {
      const onRetry = vi.fn()
      render(
        <Phase8Publish
          video={mockVideoComplete}
          error="Erro de timeout"
          onRetry={onRetry}
        />
      )

      const retryButton = screen.getByRole('button', { name: /tentar novamente/i })
      fireEvent.click(retryButton)

      expect(onRetry).toHaveBeenCalledTimes(1)
    })
  })

  describe('Cmd/Ctrl+Enter shortcut', () => {
    it('triggers send with Cmd+Enter when valid', () => {
      const onSend = vi.fn()
      render(<Phase8Publish video={mockVideoComplete} onSend={onSend} />)

      fireEvent.keyDown(document, { key: 'Enter', metaKey: true })

      expect(onSend).toHaveBeenCalledTimes(1)
    })

    it('triggers send with Ctrl+Enter when valid', () => {
      const onSend = vi.fn()
      render(<Phase8Publish video={mockVideoComplete} onSend={onSend} />)

      fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true })

      expect(onSend).toHaveBeenCalledTimes(1)
    })

    it('does not trigger send with Cmd+Enter when invalid', () => {
      const onSend = vi.fn()
      render(<Phase8Publish video={mockVideoIncomplete} onSend={onSend} />)

      fireEvent.keyDown(document, { key: 'Enter', metaKey: true })

      expect(onSend).not.toHaveBeenCalled()
    })

    it('does not trigger send with Cmd+Enter when sending', () => {
      const onSend = vi.fn()
      render(<Phase8Publish video={mockVideoComplete} onSend={onSend} isSending />)

      fireEvent.keyDown(document, { key: 'Enter', metaKey: true })

      expect(onSend).not.toHaveBeenCalled()
    })

    it('does not trigger send with Cmd+Enter when already sent', () => {
      const onSend = vi.fn()
      render(<Phase8Publish video={mockVideoComplete} onSend={onSend} isSent />)

      fireEvent.keyDown(document, { key: 'Enter', metaKey: true })

      expect(onSend).not.toHaveBeenCalled()
    })
  })

  describe('No LLM processing', () => {
    it('does not show additionalContext input', () => {
      render(<Phase8Publish video={mockVideoComplete} />)
      expect(screen.queryByLabelText(/dica/i)).not.toBeInTheDocument()
    })

    it('does not show revalidate button', () => {
      render(<Phase8Publish video={mockVideoComplete} />)
      expect(screen.queryByRole('button', { name: /revalidar|gerar nov/i })).not.toBeInTheDocument()
    })
  })
})
