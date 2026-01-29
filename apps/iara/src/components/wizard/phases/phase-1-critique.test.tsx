import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test-utils'

import { Phase1Critique } from './phase-1-critique'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { Phase1Response } from '@/lib/llm'
import type { FirestoreTimestamp } from '@/types/podcast'

// Helper to create Firestore-like timestamp
function createTimestamp(date: Date): FirestoreTimestamp {
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  }
}

// Mock video with episode context
const mockVideo: Video = {
  id: 'test-video-123',
  title: 'Test Episode',
  description: 'Test description',
  duration: 3600,
  publishedAt: createTimestamp(new Date('2026-01-15')),
  theme: 'A importância da inteligência artificial no mercado de trabalho',
  guests: [
    {
      name: 'João Silva',
      role: 'CEO',
      company: 'TechCorp',
      linkedin: 'https://linkedin.com/in/joaosilva',
    },
  ],
}

const mockVideoNoContext: Video = {
  id: 'test-video-456',
  title: 'New Episode',
  description: 'New description',
  duration: 1800,
  publishedAt: createTimestamp(new Date('2026-01-20')),
}

const mockPhase1Response: Phase1Response = {
  critique: 'O episódio aborda de forma clara e abrangente o tema da IA no mercado de trabalho.',
  highlights: [
    'Boa contextualização do tema na introdução',
    'Exemplos práticos e relevantes',
  ],
  suggestions: [
    'Considerar adicionar mais dados estatísticos',
  ],
}

// Create mock wizard return
function createMockWizard(overrides: Partial<UseWizardReturn> = {}): UseWizardReturn {
  return {
    state: {
      videoId: 'test-video-123',
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
    currentPhaseMetadata: {
      phase: 1,
      label: 'Crítica',
      type: 'immutable',
      spinnerText: 'Estou assistindo o episódio para te dar uma opinião sincera...',
      alertTitle: 'Crítica do Especialista',
    },
    progress: 0,
    isComplete: false,
    firstIncompletePhase: 1,
    goToPhase: vi.fn(),
    goToNextPhase: vi.fn(),
    canNavigateToPhase: vi.fn().mockReturnValue(false),
    setPhaseStatus: vi.fn(),
    setPhaseLoading: vi.fn(),
    setPhaseData: vi.fn(),
    setPhaseError: vi.fn(),
    invalidateFromPhase: vi.fn(),
    completePhaseAndAdvance: vi.fn(),
    reset: vi.fn(),
    consoleMessages: [],
    addSpinner: vi.fn().mockReturnValue('spinner-1'),
    removeSpinner: vi.fn(),
    addAlert: vi.fn().mockReturnValue('alert-1'),
    clearConsole: vi.fn(),
    ...overrides,
  }
}

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Phase1Critique', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('Context Input Form', () => {
    it('renders theme input field', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideoNoContext} critique={null} />
      )

      expect(screen.getByLabelText(/tema do episódio/i)).toBeInTheDocument()
    })

    it('renders guest input fields', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideoNoContext} critique={null} />
      )

      expect(screen.getByText(/convidados/i)).toBeInTheDocument()
      expect(screen.getByText(/convidado 1/i)).toBeInTheDocument()
    })

    it('populates form with existing context', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={null} />
      )

      // Theme should be populated
      const themeInput = screen.getByLabelText(/tema do episódio/i) as HTMLTextAreaElement
      expect(themeInput.value).toBe(mockVideo.theme)
    })

    it('allows adding more guests', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideoNoContext} critique={null} />
      )

      // Initially 1 guest
      expect(screen.getByText(/convidado 1/i)).toBeInTheDocument()

      // Click add button
      const addButton = screen.getByRole('button', { name: /adicionar/i })
      fireEvent.click(addButton)

      // Now should have 2 guests
      expect(screen.getByText(/convidado 2/i)).toBeInTheDocument()
    })
  })

  describe('Auto-save', () => {
    it('auto-saves context when form values change', async () => {
      const wizard = createMockWizard()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      })

      render(
        <Phase1Critique wizard={wizard} video={mockVideoNoContext} critique={null} />
      )

      // Change theme value
      const themeInput = screen.getByLabelText(/tema do episódio/i)
      fireEvent.change(themeInput, { target: { value: 'Novo tema do episódio' } })

      // Wait for debounced auto-save (1500ms delay + some buffer)
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/videos/${mockVideoNoContext.id}/context`,
          expect.objectContaining({
            method: 'PUT',
          })
        )
      }, { timeout: 3000 })
    })
  })

  describe('Critique display', () => {
    it('does not render critique display when critique is null', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={null} />
      )

      // Critique card should not be present
      expect(screen.queryByText('Crítica do Especialista')).not.toBeInTheDocument()
    })

    it('form remains visible regardless of critique state', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={mockPhase1Response} />
      )

      // Form should still be visible
      expect(screen.getByLabelText(/tema do episódio/i)).toBeInTheDocument()
    })
  })

  describe('Advancement criteria and button', () => {
    it('renders "Avançar" button', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={mockPhase1Response} />
      )

      expect(screen.getByRole('button', { name: /avançar para an.?lise/i })).toBeInTheDocument()
    })

    it('disables button when critique is null', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={null} />
      )

      const button = screen.getByRole('button', { name: /avançar para an.?lise/i })
      expect(button).toBeDisabled()
      expect(screen.getByText(/aguardando processamento da crítica/i)).toBeInTheDocument()
    })

    it('disables button when theme is empty', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideoNoContext} critique={mockPhase1Response} />
      )

      const button = screen.getByRole('button', { name: /avançar para an.?lise/i })
      expect(button).toBeDisabled()
    })

    it('enables button when all criteria are met', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={mockPhase1Response} />
      )

      const button = screen.getByRole('button', { name: /avançar para an.?lise/i })
      expect(button).toBeEnabled()
    })

    it('calls completePhaseAndAdvance when button is clicked', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={mockPhase1Response} />
      )

      const button = screen.getByRole('button', { name: /avançar para an.?lise/i })
      fireEvent.click(button)

      // Should complete phase 1 and advance to phase 2 in one action
      expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(1, mockPhase1Response)
    })
  })
})
