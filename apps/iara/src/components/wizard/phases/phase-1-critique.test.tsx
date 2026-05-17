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

  describe('Guest scrape fire-and-forget', () => {
    it('triggers guest scrape when a new LinkedIn URL is added', async () => {
      const wizard = createMockWizard()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      })

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={null} />
      )

      // Change LinkedIn URL to a NEW one (original joaosilva is already tracked in ref)
      const linkedinInput = document.getElementById('guests.0.linkedin') as HTMLInputElement
      fireEvent.change(linkedinInput, { target: { value: 'https://linkedin.com/in/newguest' } })

      // Wait for auto-save + scrape call for the new URL
      await waitFor(() => {
        const scrapeCalls = mockFetch.mock.calls.filter(
          (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/guests/scrape')
        )
        expect(scrapeCalls.length).toBeGreaterThan(0)
      }, { timeout: 3000 })

      // Verify scrape call body — should only contain the new URL
      const scrapeCall = mockFetch.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/guests/scrape')
      )
      const body = JSON.parse(scrapeCall[1].body)
      expect(body.videoId).toBe(mockVideo.id)
      expect(body.linkedinUrls).toEqual(['https://linkedin.com/in/newguest'])
    })

    it('does not trigger duplicate scrape on subsequent auto-saves with same LinkedIn URLs', async () => {
      const wizard = createMockWizard()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      })

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={null} />
      )

      // Add a new LinkedIn URL → triggers scrape
      const linkedinInput = document.getElementById('guests.0.linkedin') as HTMLInputElement
      fireEvent.change(linkedinInput, { target: { value: 'https://linkedin.com/in/newguest' } })

      await waitFor(() => {
        const scrapeCalls = mockFetch.mock.calls.filter(
          (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/guests/scrape')
        )
        expect(scrapeCalls.length).toBe(1)
      }, { timeout: 3000 })

      // Change theme → triggers auto-save but NOT scrape (same LinkedIn URL already tracked)
      const themeInput = screen.getByLabelText(/tema do episódio/i)
      fireEvent.change(themeInput, { target: { value: 'Segundo tema' } })

      await waitFor(() => {
        // Should have 2+ context saves but still only 1 scrape call
        const contextCalls = mockFetch.mock.calls.filter(
          (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/videos/')
        )
        expect(contextCalls.length).toBeGreaterThanOrEqual(2)
      }, { timeout: 3000 })

      const scrapeCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/guests/scrape')
      )
      expect(scrapeCalls).toHaveLength(1)
    })

    it('does not trigger guest scrape when no guests have LinkedIn', async () => {
      const wizard = createMockWizard()
      const videoWithoutLinkedin: Video = {
        ...mockVideoNoContext,
        theme: 'Existing theme',
        guests: [
          { name: 'John', role: 'Dev', company: 'Co', linkedin: '' },
        ],
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      })

      render(
        <Phase1Critique wizard={wizard} video={videoWithoutLinkedin} critique={null} />
      )

      // Change theme to trigger auto-save
      const themeInput = screen.getByLabelText(/tema do episódio/i)
      fireEvent.change(themeInput, { target: { value: 'Tema sem LinkedIn guest' } })

      // Wait for auto-save
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/videos/'),
          expect.objectContaining({ method: 'PUT' })
        )
      }, { timeout: 3000 })

      // Verify NO scrape call was made
      const scrapeCalls = mockFetch.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/guests/scrape')
      )
      expect(scrapeCalls).toHaveLength(0)
    })
  })

  describe('Scraping state blocks advancement', () => {
    it('disables button and shows feedback while scraping is in progress', async () => {
      const wizard = createMockWizard()

      // Make context save resolve immediately, but scrape hangs (never resolves)
      let resolveScrape: () => void
      const scrapePromise = new Promise<void>(resolve => { resolveScrape = resolve })

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/guests/scrape')) {
          return scrapePromise.then(() => ({ ok: true, json: async () => ({}) }))
        }
        return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
      })

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={mockPhase1Response} />
      )

      // Button should be enabled initially
      const button = screen.getByRole('button', { name: /avançar para an.?lise/i })
      expect(button).toBeEnabled()

      // Change LinkedIn URL to a NEW one to trigger scraping
      const linkedinInput = document.getElementById('guests.0.linkedin') as HTMLInputElement
      fireEvent.change(linkedinInput, { target: { value: 'https://linkedin.com/in/newguest' } })

      // Wait for scraping to start — button should be disabled with LinkedIn text
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /buscando linkedin/i })).toBeDisabled()
      }, { timeout: 3000 })

      // Helper text should show scraping message
      expect(screen.getByText(/buscando dados do linkedin/i)).toBeInTheDocument()

      // Resolve scraping — button should re-enable
      resolveScrape!()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /avançar para an.?lise/i })).toBeEnabled()
      }, { timeout: 3000 })
    })

    it('re-enables button after scraping fails', async () => {
      const wizard = createMockWizard()

      let rejectScrape: () => void
      const scrapePromise = new Promise<void>((_, reject) => { rejectScrape = reject })

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/guests/scrape')) {
          return scrapePromise.then(() => ({ ok: true, json: async () => ({}) }))
        }
        return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
      })

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={mockPhase1Response} />
      )

      // Change LinkedIn URL to a NEW one to trigger scraping
      const linkedinInput = document.getElementById('guests.0.linkedin') as HTMLInputElement
      fireEvent.change(linkedinInput, { target: { value: 'https://linkedin.com/in/newguest' } })

      // Wait for scraping to start
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /buscando linkedin/i })).toBeDisabled()
      }, { timeout: 3000 })

      // Reject scraping — button should re-enable (failure doesn't block)
      rejectScrape!()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /avançar para an.?lise/i })).toBeEnabled()
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

    it('calls completePhaseAndAdvance when button is clicked', async () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={mockPhase1Response} />
      )

      const button = screen.getByRole('button', { name: /avançar para an.?lise/i })
      fireEvent.click(button)

      // handleAdvance is now async (awaits useAutoSave.save() to flush pending
      // changes — Story 24.1). With a pristine form, save() is a no-op so the
      // dispatch lands on the next tick.
      await waitFor(() => {
        expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(1, mockPhase1Response)
      })
    })

    it('flushes auto-save (PUT context) before advancing — race fix for fast clicks', async () => {
      // Story 24.1: handleAdvance must `await save()` so debounced changes
      // (Spotify URL, theme, guests) are persisted before navigation.
      const wizard = createMockWizard()

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      })

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={mockPhase1Response} />
      )

      // Change theme to mark the form dirty (so save() actually executes performSave)
      const themeInput = screen.getByLabelText(/tema do episódio/i)
      fireEvent.change(themeInput, { target: { value: 'Tema atualizado de última hora' } })

      // Click "Avançar" immediately (within debounce window — no waitFor)
      const button = screen.getByRole('button', { name: /avançar para an.?lise/i })
      fireEvent.click(button)

      // The flushed save must hit the PUT endpoint with the new theme value
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/videos/${mockVideo.id}/context`,
          expect.objectContaining({ method: 'PUT' }),
        )
      })

      // And completePhaseAndAdvance must have been called AFTER the fetch
      await waitFor(() => {
        expect(wizard.completePhaseAndAdvance).toHaveBeenCalledWith(1, mockPhase1Response)
      })

      const fetchCallOrders = mockFetch.mock.invocationCallOrder
      const advanceCallOrders = (wizard.completePhaseAndAdvance as ReturnType<typeof vi.fn>).mock.invocationCallOrder
      expect(fetchCallOrders[0]).toBeLessThan(advanceCallOrders[0])
    })

  })

  describe('Scrape-driven field unlock (Story 24.7)', () => {
    it('locks name/role/company for a new guest, but keeps LinkedIn editable', () => {
      const wizard = createMockWizard()

      // Video without any existing guest data
      render(
        <Phase1Critique
          wizard={wizard}
          video={{ ...mockVideoNoContext, guests: [] }}
          critique={null}
        />
      )

      // Guest 1 is rendered by default (form initializes with 1 empty guest)
      const nameInput = screen.getAllByLabelText(/nome/i)[0] as HTMLInputElement
      const roleInput = screen.getAllByLabelText(/cargo/i)[0] as HTMLInputElement
      const companyInput = screen.getAllByLabelText(/empresa/i)[0] as HTMLInputElement
      const linkedinInput = screen.getAllByLabelText(/linkedin/i)[0] as HTMLInputElement

      expect(nameInput).toBeDisabled()
      expect(roleInput).toBeDisabled()
      expect(companyInput).toBeDisabled()
      expect(linkedinInput).not.toBeDisabled()
    })

    it('treats existing guest with name as enriched (fields enabled on mount)', () => {
      const wizard = createMockWizard()

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={null} />
      )

      const nameInput = screen.getAllByLabelText(/nome/i)[0] as HTMLInputElement
      expect(nameInput).not.toBeDisabled()
      expect(nameInput.value).toBe('João Silva')
    })

    it('unlocks and fills name/role/company after successful scrape (auto-fill from response)', async () => {
      const wizard = createMockWizard()

      // First fetch: PUT context (200), second fetch: POST scrape (200 with scrapedGuests)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              videoId: 'test-video-456',
              scrapedCount: 1,
              errorCount: 0,
              failedUrls: [],
              scrapedGuests: [
                {
                  linkedinUrl: 'https://www.linkedin.com/in/foo',
                  name: 'Foo Bar',
                  role: 'Founder at AcmeCo',
                  company: 'AcmeCo',
                },
              ],
            },
          }),
        })

      render(
        <Phase1Critique
          wizard={wizard}
          video={{ ...mockVideoNoContext, guests: [] }}
          critique={null}
        />
      )

      // Fill required fields plus the LinkedIn URL to trigger scrape
      fireEvent.change(screen.getByLabelText(/tema do episódio/i), {
        target: { value: 'tema qualquer' },
      })
      fireEvent.change(screen.getAllByLabelText(/linkedin/i)[0], {
        target: { value: 'https://www.linkedin.com/in/foo' },
      })

      // Wait for auto-save + scrape response
      await waitFor(() => {
        const nameInput = screen.getAllByLabelText(/nome/i)[0] as HTMLInputElement
        expect(nameInput.value).toBe('Foo Bar')
        expect(nameInput).not.toBeDisabled()
      }, { timeout: 5000 })

      const roleInput = screen.getAllByLabelText(/cargo/i)[0] as HTMLInputElement
      const companyInput = screen.getAllByLabelText(/empresa/i)[0] as HTMLInputElement
      expect(roleInput.value).toBe('Founder at AcmeCo')
      expect(companyInput.value).toBe('AcmeCo')
      expect(roleInput).not.toBeDisabled()
      expect(companyInput).not.toBeDisabled()
    })

    it('unlocks and fills CO-HOST fields (camelCase path coHost.*, regression guard)', async () => {
      // 2026-05-17 — verified bug in production: findKeyByLinkedinUrl returned
      // 'cohost' (lowercase) but react-hook-form registers as 'coHost'. setValue
      // silently no-op'd. Guard so the case mismatch never returns.
      const wizard = createMockWizard()

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              videoId: 'test-video-456',
              scrapedCount: 1,
              errorCount: 0,
              failedUrls: [],
              scrapedGuests: [
                {
                  linkedinUrl: 'https://www.linkedin.com/in/cohost-new',
                  name: 'Co-Host Resolvido',
                  role: 'Diretor',
                  company: 'Coorp',
                },
              ],
            },
          }),
        })

      // Render with a video that already has a co-host (only LinkedIn URL,
      // empty name/role/company) — so the accordion opens, the LinkedIn field
      // is reachable, and changing it triggers the auto-save + scrape.
      render(
        <Phase1Critique
          wizard={wizard}
          video={{
            ...mockVideoNoContext,
            guests: [
              {
                name: '',
                role: '',
                company: '',
                linkedin: 'https://www.linkedin.com/in/cohost-existing',
              },
            ],
          }}
          critique={null}
        />
      )

      // Fill a theme so the save fires, then change the co-host LinkedIn URL
      fireEvent.change(screen.getByLabelText(/tema do episódio/i), {
        target: { value: 'tema qualquer' },
      })
      // First LinkedIn input belongs to co-host (it's the first PersonForm
      // in the JSX, inside the open accordion).
      const linkedinInputs = screen.getAllByLabelText(/linkedin/i) as HTMLInputElement[]
      fireEvent.change(linkedinInputs[0], {
        target: { value: 'https://www.linkedin.com/in/cohost-new' },
      })

      // The co-host Name input is the first Nome input on the page.
      // After the scrape resolves, RHF must apply setValue on `coHost.name`
      // (camelCase). If the key were lowercase, this assertion would fail.
      await waitFor(() => {
        const nameInput = screen.getAllByLabelText(/nome/i)[0] as HTMLInputElement
        expect(nameInput.value).toBe('Co-Host Resolvido')
      }, { timeout: 5000 })

      const roleInput = screen.getAllByLabelText(/cargo/i)[0] as HTMLInputElement
      const companyInput = screen.getAllByLabelText(/empresa/i)[0] as HTMLInputElement
      expect(roleInput.value).toBe('Diretor')
      expect(companyInput.value).toBe('Coorp')
    })

    it('opens fields empty for manual entry when scrape returns failedUrls', async () => {
      const wizard = createMockWizard()

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              videoId: 'test-video-456',
              scrapedCount: 0,
              errorCount: 1,
              failedUrls: ['https://www.linkedin.com/in/notfound'],
              scrapedGuests: [],
            },
          }),
        })

      render(
        <Phase1Critique
          wizard={wizard}
          video={{ ...mockVideoNoContext, guests: [] }}
          critique={null}
        />
      )

      fireEvent.change(screen.getByLabelText(/tema do episódio/i), {
        target: { value: 'tema qualquer' },
      })
      fireEvent.change(screen.getAllByLabelText(/linkedin/i)[0], {
        target: { value: 'https://www.linkedin.com/in/notfound' },
      })

      // Wait for the failed-URLs banner — it's only rendered once the scrape promise resolves.
      await waitFor(() => {
        expect(
          screen.getByText(/Não foi possível enriquecer 1 URL/i)
        ).toBeInTheDocument()
      }, { timeout: 5000 })

      // Manual fields are now editable but empty
      const nameInput = screen.getAllByLabelText(/nome/i)[0] as HTMLInputElement
      expect(nameInput).not.toBeDisabled()
      expect(nameInput.value).toBe('')
    })
  })

  describe('Advancement criteria and button (continued)', () => {
    it('does not advance when the flushed save fails', async () => {
      // Story 24.1 AC5: backend error on PUT context must block transition.
      const wizard = createMockWizard()

      // Mark form dirty so save() actually attempts a fetch.
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Erro do servidor' } }),
      })

      render(
        <Phase1Critique wizard={wizard} video={mockVideo} critique={mockPhase1Response} />
      )

      const themeInput = screen.getByLabelText(/tema do episódio/i)
      fireEvent.change(themeInput, { target: { value: 'Tema que vai falhar no save' } })

      const button = screen.getByRole('button', { name: /avançar para an.?lise/i })
      fireEvent.click(button)

      // Wait for the failing PUT to actually be attempted
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/videos/${mockVideo.id}/context`,
          expect.objectContaining({ method: 'PUT' }),
        )
      })

      // Give the catch branch a tick to run, then assert no transition
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(wizard.completePhaseAndAdvance).not.toHaveBeenCalled()
    })
  })
})
