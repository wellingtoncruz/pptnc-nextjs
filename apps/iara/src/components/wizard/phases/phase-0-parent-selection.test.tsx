/**
 * Tests for Phase0ParentSelection component.
 *
 * This component is used for cut and reel videos to select their parent episode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { Phase0ParentSelection } from './phase-0-parent-selection'
import type { Video, VideoSummary } from '@/types/video'
import type { UseWizardReturn } from '@/hooks/use-wizard'

// Mock SWR
vi.mock('swr', () => ({
  default: vi.fn(),
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} data-testid="episode-thumbnail" />
  ),
}))

import useSWR from 'swr'

const mockUseSWR = vi.mocked(useSWR)

// Create mock wizard
function createMockWizard(overrides?: Partial<UseWizardReturn>): UseWizardReturn {
  return {
    state: {
      videoId: 'test-video',
      videoType: 'reel',
      currentPhase: 1,
      phases: {
        1: { status: 'pending', data: null, error: null },
        2: { status: 'pending', data: null, error: null },
        3: { status: 'pending', data: null, error: null },
        4: { status: 'pending', data: null, error: null },
        5: { status: 'pending', data: null, error: null },
        6: { status: 'pending', data: null, error: null },
        7: { status: 'pending', data: null, error: null },
        8: { status: 'pending', data: null, error: null },
      },
    },
    currentPhase: 1,
    currentPhaseData: { status: 'pending', data: null, error: null },
    currentPhaseMetadata: { phase: 1, label: 'Crítica', type: 'immutable', spinnerText: '', alertTitle: '' },
    progress: 0,
    isComplete: false,
    firstIncompletePhase: 1,
    goToPhase: vi.fn(),
    goToNextPhase: vi.fn(),
    canNavigateToPhase: vi.fn().mockReturnValue(true),
    setPhaseStatus: vi.fn(),
    setPhaseLoading: vi.fn(),
    setPhaseData: vi.fn(),
    setPhaseError: vi.fn(),
    invalidateFromPhase: vi.fn(),
    completePhaseAndAdvance: vi.fn(),
    reset: vi.fn(),
    syncWithVideoData: vi.fn(),
    hydrateFromVideoData: vi.fn(),
    consoleMessages: [],
    addSpinner: vi.fn(),
    removeSpinner: vi.fn(),
    addAlert: vi.fn(),
    clearConsole: vi.fn(),
    ...overrides,
  }
}

// Create mock video
function createMockVideo(overrides?: Partial<Video>): Video {
  return {
    id: 'test-reel',
    title: 'Test Reel',
    videoType: 'reel',
    duration: 60,
    publishedAt: new Date(),
    ...overrides,
  } as Video
}

// Create mock episodes
function createMockEpisodes(): VideoSummary[] {
  return [
    {
      id: 'ep-1',
      title: 'Episode 1: Technology',
      duration: 3600,
      theme: 'Technology',
      guests: [{ name: 'John Doe', role: 'Expert', linkedin: 'https://linkedin.com/in/johndoe' }],
    } as VideoSummary,
    {
      id: 'ep-2',
      title: 'Episode 2: Science',
      duration: 2700,
      theme: 'Science',
      guests: [],
    } as VideoSummary,
  ]
}

describe('Phase0ParentSelection', () => {
  const mockOnParentSelected = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  describe('Loading state', () => {
    it('shows loading spinner while fetching episodes', () => {
      mockUseSWR.mockReturnValue({
        data: undefined,
        error: undefined,
        isLoading: true,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      expect(screen.getByText(/carregando episódios/i)).toBeInTheDocument()
    })
  })

  describe('Error state', () => {
    it('shows error message when fetch fails', () => {
      mockUseSWR.mockReturnValue({
        data: undefined,
        error: new Error('Failed to fetch'),
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      expect(screen.getByText(/erro ao carregar episódios/i)).toBeInTheDocument()
      expect(screen.getByText(/tentar novamente/i)).toBeInTheDocument()
    })

    it('calls mutate when retry button is clicked', async () => {
      const mockMutate = vi.fn()
      mockUseSWR.mockReturnValue({
        data: undefined,
        error: new Error('Failed to fetch'),
        isLoading: false,
        mutate: mockMutate,
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      const retryButton = screen.getByText(/tentar novamente/i)
      fireEvent.click(retryButton)

      expect(mockMutate).toHaveBeenCalled()
    })
  })

  describe('Empty state', () => {
    it('shows message when no episodes available', () => {
      mockUseSWR.mockReturnValue({
        data: { data: [] },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      expect(screen.getByText(/nenhum episódio disponível/i)).toBeInTheDocument()
    })
  })

  describe('Search functionality', () => {
    it('shows hint when search has less than 5 characters', () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      const searchInput = screen.getByPlaceholderText(/buscar por título/i)
      fireEvent.change(searchInput, { target: { value: 'abc' } })

      expect(screen.getByText(/digite pelo menos 5 caracteres/i)).toBeInTheDocument()
    })

    it('does not show hint when search is empty', () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      expect(screen.queryByText(/digite pelo menos 5 caracteres/i)).not.toBeInTheDocument()
    })

    it('does not show hint when search has 5+ characters', () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      const searchInput = screen.getByPlaceholderText(/buscar por título/i)
      fireEvent.change(searchInput, { target: { value: 'technology' } })

      expect(screen.queryByText(/digite pelo menos 5 caracteres/i)).not.toBeInTheDocument()
    })

    it('shows "no results" message when search returns empty (AC2)', async () => {
      // Use fake timers to control debounce
      vi.useFakeTimers()

      // Mock SWR to return empty data when search param is present
      mockUseSWR.mockImplementation((url: string) => {
        if (url.includes('search=')) {
          return {
            data: { data: [] },
            error: undefined,
            isLoading: false,
            mutate: vi.fn(),
          }
        }
        return {
          data: { data: createMockEpisodes() },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        }
      })

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      // Type search term with 5+ chars
      const searchInput = screen.getByPlaceholderText(/buscar por título/i)
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

      // Advance timers past debounce (300ms)
      await act(async () => {
        vi.advanceTimersByTime(350)
      })

      // Should show "no results" message
      expect(screen.getByText(/nenhum episódio encontrado/i)).toBeInTheDocument()
      expect(screen.getByText(/nonexistent/i)).toBeInTheDocument()

      vi.useRealTimers()
    })
  })

  describe('Episodes list', () => {
    it('displays list of episodes', () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      expect(screen.getByText('Episode 1: Technology')).toBeInTheDocument()
      expect(screen.getByText('Episode 2: Science')).toBeInTheDocument()
    })

    it('shows episode theme', () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      expect(screen.getByText('Technology')).toBeInTheDocument()
      expect(screen.getByText('Science')).toBeInTheDocument()
    })
  })

  describe('Episode selection', () => {
    it('selects episode when clicked', async () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      const episode1 = screen.getByText('Episode 1: Technology').closest('button')
      expect(episode1).toBeInTheDocument()
      
      if (episode1) {
        fireEvent.click(episode1)
      }

      // Advance button should now be enabled (we can't easily test visual selection)
      const advanceButton = screen.getByText(/avançar/i)
      expect(advanceButton).not.toBeDisabled()
    })

    it('shows pre-selected parent if video has parentEpisodeId', () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo({ parentEpisodeId: 'ep-1' })

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      // Advance button should be enabled since parent is pre-selected
      const advanceButton = screen.getByText(/avançar/i)
      expect(advanceButton).not.toBeDisabled()
    })
  })

  describe('Advance button', () => {
    it('is disabled when no episode is selected', () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      const advanceButton = screen.getByText(/avançar/i)
      expect(advanceButton).toBeDisabled()
    })

    it('calls API and advances to phase 5 on click', async () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            parentEpisodeId: 'ep-1',
            guests: [{ name: 'John' }],
            theme: 'Technology',
          },
        }),
      })
      global.fetch = mockFetch

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      // Select an episode
      const episode1 = screen.getByText('Episode 1: Technology').closest('button')
      if (episode1) {
        fireEvent.click(episode1)
      }

      // Click advance
      const advanceButton = screen.getByText(/avançar/i)
      fireEvent.click(advanceButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/videos/test-reel/parent',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ parentEpisodeId: 'ep-1' }),
          })
        )
      })

      await waitFor(() => {
        expect(mockOnParentSelected).toHaveBeenCalledWith('ep-1', {
          guests: [{ name: 'John' }],
          theme: 'Technology',
        })
      })

      await waitFor(() => {
        // Phase 0 uses completePhaseAndAdvance to advance to phase 5
        expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(0, { parentEpisodeId: 'ep-1' })
      })
    })

    it('shows error when API fails', async () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({
          error: { message: 'Failed to save' },
        }),
      })
      global.fetch = mockFetch

      const wizard = createMockWizard()
      const video = createMockVideo()

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      // Select and advance
      const episode1 = screen.getByText('Episode 1: Technology').closest('button')
      if (episode1) {
        fireEvent.click(episode1)
      }

      const advanceButton = screen.getByText(/avançar/i)
      fireEvent.click(advanceButton)

      await waitFor(() => {
        expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
      })
    })
  })

  describe('Video type display', () => {
    it('shows "corte" for cut videos', () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo({ videoType: 'cut' })

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      expect(screen.getByText(/corte/i)).toBeInTheDocument()
    })

    it('shows "reel" for reel videos', () => {
      mockUseSWR.mockReturnValue({
        data: { data: createMockEpisodes() },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as any)

      const wizard = createMockWizard()
      const video = createMockVideo({ videoType: 'reel' })

      render(
        <Phase0ParentSelection
          wizard={wizard}
          video={video}
          onParentSelected={mockOnParentSelected}
        />
      )

      expect(screen.getByText(/reel/i)).toBeInTheDocument()
    })
  })
})
