import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test-utils'

import { Phase4Chapters } from './phase-4-chapters'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { Phase4Response } from '@/lib/llm/types'

// Mock the useYouTubeOptional hook
const mockSeekTo = vi.fn()
vi.mock('../youtube-context', async () => {
  const actual = await vi.importActual('../youtube-context')
  return {
    ...actual,
    useYouTubeOptional: () => ({
      seekTo: mockSeekTo,
      player: null,
      setPlayer: vi.fn(),
      isReady: false,
      registerStartPlayback: vi.fn(),
    }),
  }
})

// Mock video data
const mockVideo: Video = {
  id: 'test-video-123',
  podcastId: 'test-podcast',
  title: 'Test Video',
  description: 'Test description',
  thumbnail: 'https://example.com/thumb.jpg',
  duration: 3600,
  publishedAt: new Date().toISOString(),
  status: 'processing',
  videoType: 'episode',
  transcriptionTXT: 'Test transcript',
  transcriptionSRT: '00:00:00,000 --> 00:00:05,000\nTest',
  createdAt: { toDate: () => new Date() } as never,
  updatedAt: { toDate: () => new Date() } as never,
}

// Mock chapters response
const mockChaptersWithData: Phase4Response = {
  chapters: [
    { timestamp: '00:00', title: 'Introdução' },
    { timestamp: '05:30', title: 'Tema Principal' },
    { timestamp: '15:00', title: 'Entrevista' },
    { timestamp: '45:00', title: 'Conclusão' },
  ],
}

const mockEmptyChapters: Phase4Response = {
  chapters: [],
}

// Create mock wizard
function createMockWizard(): UseWizardReturn {
  return {
    currentPhase: 4,
    phases: {
      1: { status: 'completed', needsRevalidation: false, data: null, error: null },
      2: { status: 'completed', needsRevalidation: false, data: null, error: null },
      3: { status: 'completed', needsRevalidation: false, data: null, error: null },
      4: { status: 'pending', needsRevalidation: false, data: null, error: null },
      5: { status: 'pending', needsRevalidation: false, data: null, error: null },
      6: { status: 'pending', needsRevalidation: false, data: null, error: null },
      7: { status: 'pending', needsRevalidation: false, data: null, error: null },
      8: { status: 'pending', needsRevalidation: false, data: null, error: null },
    },
    consoleMessages: [],
    setPhaseStatus: vi.fn(),
    setPhaseLoading: vi.fn(),
    setPhaseError: vi.fn(),
    setPhaseData: vi.fn(),
    goToPhase: vi.fn(),
    completePhaseAndAdvance: vi.fn(),
    addSpinner: vi.fn(() => 'spinner-1'),
    removeSpinner: vi.fn(),
    addAlert: vi.fn(),
    removeAlert: vi.fn(),
    reset: vi.fn(),
  }
}

describe('Phase4Chapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading state', () => {
    it('shows loading spinner when no result yet', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={null} />
      )
      expect(screen.getByText(/gerando capítulos automaticamente/i)).toBeInTheDocument()
    })

    it('disables advance button when loading', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={null} />
      )
      const button = screen.getByRole('button', { name: /avançar para t.?tulo/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Chapters display', () => {
    it('displays chapter list when chapters exist', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      expect(screen.getByText('Capítulos Sugeridos')).toBeInTheDocument()
      expect(screen.getByText('Introdução')).toBeInTheDocument()
      expect(screen.getByText('Tema Principal')).toBeInTheDocument()
      expect(screen.getByText('Entrevista')).toBeInTheDocument()
      expect(screen.getByText('Conclusão')).toBeInTheDocument()
    })

    it('displays timestamps for each chapter', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      expect(screen.getByText('00:00')).toBeInTheDocument()
      expect(screen.getByText('05:30')).toBeInTheDocument()
      expect(screen.getByText('15:00')).toBeInTheDocument()
      expect(screen.getByText('45:00')).toBeInTheDocument()
    })

    it('makes timestamps clickable', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      // Find all timestamp buttons
      const timestampButtons = screen.getAllByRole('button', { name: /ir para/i })
      expect(timestampButtons.length).toBe(4)
    })

    it('does not show warning when first chapter starts at 00:00', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      expect(screen.queryByText(/primeiro capítulo deve começar em 00:00/i)).not.toBeInTheDocument()
    })

    it('shows warning when first chapter does not start at 00:00', () => {
      const wizard = createMockWizard()
      const chaptersWithoutZero: Phase4Response = {
        chapters: [
          { timestamp: '01:30', title: 'Primeiro Capítulo' },
          { timestamp: '10:00', title: 'Segundo Capítulo' },
        ],
      }
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={chaptersWithoutZero} />
      )
      expect(screen.getByText(/primeiro capítulo deve começar em 00:00/i)).toBeInTheDocument()
    })
  })

  describe('Timestamp NO context offset for chapters', () => {
    it('seeks to exact timestamp without 30s offset for chapters', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      // Click on "05:30" timestamp (should seek to exactly 330 seconds, NOT 300)
      const timestamp = screen.getByText('05:30')
      fireEvent.click(timestamp)
      expect(mockSeekTo).toHaveBeenCalledWith(330) // No offset applied
    })

    it('seeks to 00:00 exactly for first chapter', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      // Click on "00:00" timestamp
      const timestamp = screen.getByText('00:00')
      fireEvent.click(timestamp)
      expect(mockSeekTo).toHaveBeenCalledWith(0)
    })
  })

  describe('Empty chapters state', () => {
    it('shows informative message when no chapters returned', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockEmptyChapters} />
      )
      expect(screen.getByText(/não foi possível identificar capítulos/i)).toBeInTheDocument()
    })

    it('shows retry button when no chapters returned', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase4Chapters
          wizard={wizard}
          video={mockVideo}
          chaptersResult={mockEmptyChapters}
          onRetry={onRetry}
        />
      )
      const retryButton = screen.getByRole('button', { name: /tentar novamente/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('disables advance button when no chapters', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockEmptyChapters} />
      )
      const button = screen.getByRole('button', { name: /avançar para t.?tulo/i })
      expect(button).toBeDisabled()
    })
  })

  describe('Error state', () => {
    it('shows error card when error prop is provided', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters
          wizard={wizard}
          video={mockVideo}
          chaptersResult={null}
          error="Erro ao conectar com o servidor"
        />
      )
      expect(screen.getByText(/erro na geração de capítulos/i)).toBeInTheDocument()
      expect(screen.getByText(/erro ao conectar com o servidor/i)).toBeInTheDocument()
    })

    it('shows retry button when onRetry is provided', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase4Chapters
          wizard={wizard}
          video={mockVideo}
          chaptersResult={null}
          error="Erro de timeout"
          onRetry={onRetry}
        />
      )
      const retryButton = screen.getByRole('button', { name: /tentar novamente/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('calls onRetry when retry button is clicked', () => {
      const wizard = createMockWizard()
      const onRetry = vi.fn()
      render(
        <Phase4Chapters
          wizard={wizard}
          video={mockVideo}
          chaptersResult={null}
          error="Erro de timeout"
          onRetry={onRetry}
        />
      )
      const retryButton = screen.getByRole('button', { name: /tentar novamente/i })
      fireEvent.click(retryButton)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('disables advance button when in error state', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters
          wizard={wizard}
          video={mockVideo}
          chaptersResult={null}
          error="Erro"
        />
      )
      const button = screen.getByRole('button', { name: /avançar para t.?tulo/i })
      expect(button).toBeDisabled()
    })

    it('does not show loading state when in error state', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters
          wizard={wizard}
          video={mockVideo}
          chaptersResult={null}
          error="Erro"
        />
      )
      expect(screen.queryByText(/gerando capítulos automaticamente/i)).not.toBeInTheDocument()
    })
  })

  describe('Advance with approval', () => {
    it('enables advance button when chapters exist', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      const button = screen.getByRole('button', { name: /avançar para t.?tulo/i })
      expect(button).not.toBeDisabled()
    })

    it('shows approval dialog when advance is clicked', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      const button = screen.getByRole('button', { name: /avançar para t.?tulo/i })
      fireEvent.click(button)

      expect(screen.getByText(/aprova os capítulos/i)).toBeInTheDocument()
    })

    it('calls completePhaseAndAdvance when approval is confirmed', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      const advanceButton = screen.getByRole('button', { name: /avançar para t.?tulo/i })
      fireEvent.click(advanceButton)

      const confirmButton = screen.getByRole('button', { name: /sim, aprovar/i })
      fireEvent.click(confirmButton)

      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(4)
    })

    it('closes dialog when cancel is clicked', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      const advanceButton = screen.getByRole('button', { name: /avançar para t.?tulo/i })
      fireEvent.click(advanceButton)

      const cancelButton = screen.getByRole('button', { name: /não, revisar/i })
      fireEvent.click(cancelButton)

      expect(wizard.completePhaseAndAdvance).not.toHaveBeenCalled()
    })

    it('uses singular form for single chapter in confirmation dialog', () => {
      const wizard = createMockWizard()
      const singleChapter: Phase4Response = {
        chapters: [{ timestamp: '00:00', title: 'Único Capítulo' }],
      }
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={singleChapter} />
      )
      const button = screen.getByRole('button', { name: /avançar para t.?tulo/i })
      fireEvent.click(button)

      expect(screen.getByText(/foi gerado 1 capítulo/i)).toBeInTheDocument()
    })

    it('uses plural form for multiple chapters in confirmation dialog', () => {
      const wizard = createMockWizard()
      render(
        <Phase4Chapters wizard={wizard} video={mockVideo} chaptersResult={mockChaptersWithData} />
      )
      const button = screen.getByRole('button', { name: /avançar para t.?tulo/i })
      fireEvent.click(button)

      expect(screen.getByText(/foram gerados 4 capítulos/i)).toBeInTheDocument()
    })
  })
})
