import { render, screen, fireEvent, waitFor } from '@/test-utils'

import type { VideoSummary } from '@/types/video'

import { NewsletterDraftPhase } from './newsletter-draft-phase'

// --- Mocks ---

const mockGenerate = vi.fn()
const mockSaveDraft = vi.fn()
const mockRetry = vi.fn()

const defaultHookReturn = {
  draft: null as string | null,
  newsletterStatus: null as string | null,
  isLoading: false,
  isGenerating: false,
  error: null as string | null,
  generate: mockGenerate,
  saveDraft: mockSaveDraft,
  retry: mockRetry,
}

vi.mock('@/hooks/use-newsletter-draft', () => ({
  useNewsletterDraft: () => defaultHookReturn,
}))

const mockAutoSaveSave = vi.fn()
const mockAutoSaveResetValue = vi.fn()
vi.mock('@/hooks/use-auto-save', () => ({
  useAutoSave: () => ({ saveStatus: 'idle', error: null, save: mockAutoSaveSave, resetValue: mockAutoSaveResetValue }),
}))

// --- Fixtures ---

const mockTimestamp = { toDate: () => new Date(), toMillis: () => Date.now(), seconds: 1700000000, nanoseconds: 0 }

function createVideo(overrides?: Partial<VideoSummary>): VideoSummary {
  return {
    id: 'video-1',
    title: 'Episódio sobre IA',
    description: 'Discussão sobre IA generativa',
    videoType: 'episode',
    status: 'sent',
    publishedAt: mockTimestamp,
    transcriptionSRT: 'srt',
    transcriptionTXT: 'txt',
    ...overrides,
  } as VideoSummary
}

// --- Tests ---

describe('NewsletterDraftPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset hook return to defaults
    Object.assign(defaultHookReturn, {
      draft: null,
      newsletterStatus: null,
      isLoading: false,
      isGenerating: false,
      error: null,
    })
  })

  it('exibe spinner de loading', () => {
    defaultHookReturn.isLoading = true

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    expect(screen.getByTestId('newsletter-draft-loading')).toBeInTheDocument()
  })

  it('exibe mensagem de inelegível quando sem transcrição', () => {
    const video = createVideo({ transcriptionTXT: undefined })

    render(<NewsletterDraftPhase videoId="video-1" video={video} />)

    expect(screen.getByTestId('newsletter-draft-ineligible')).toBeInTheDocument()
    expect(screen.getByText(/precisa de título, descrição e transcrição/)).toBeInTheDocument()
  })

  it('exibe mensagem de inelegível quando sem título', () => {
    const video = createVideo({ title: '' })

    render(<NewsletterDraftPhase videoId="video-1" video={video} />)

    expect(screen.getByTestId('newsletter-draft-ineligible')).toBeInTheDocument()
  })

  it('auto-gera draft quando newsletterStatus é null e prerequisites ok', async () => {
    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledTimes(1)
      expect(mockGenerate).toHaveBeenCalledWith()
    })
  })

  it('não auto-gera quando newsletterStatus é idle', () => {
    defaultHookReturn.newsletterStatus = 'idle'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('não auto-gera quando newsletterStatus é draft', () => {
    defaultHookReturn.newsletterStatus = 'draft'
    defaultHookReturn.draft = '# Draft existente'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('não auto-gera quando prerequisites faltam', () => {
    const video = createVideo({ transcriptionTXT: undefined })

    render(<NewsletterDraftPhase videoId="video-1" video={video} />)

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('não auto-gera quando já existe erro', () => {
    defaultHookReturn.error = 'Some error'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('exibe campo additionalContext com maxLength 500 no empty state', () => {
    defaultHookReturn.newsletterStatus = 'idle'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    const textarea = screen.getByTestId('newsletter-additional-context')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveAttribute('maxLength', '500')
  })

  it('exibe botão Gerar Draft no empty state', () => {
    defaultHookReturn.newsletterStatus = 'idle'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    expect(screen.getByTestId('newsletter-draft-empty')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerar Draft' })).toBeInTheDocument()
  })

  it('chama generate ao clicar Gerar Draft', async () => {
    defaultHookReturn.newsletterStatus = 'idle'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    const button = screen.getByRole('button', { name: 'Gerar Draft' })
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith(undefined)
    })
  })

  it('envia additionalContext ao gerar', async () => {
    defaultHookReturn.newsletterStatus = 'idle'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    const textarea = screen.getByTestId('newsletter-additional-context')
    fireEvent.change(textarea, { target: { value: 'Foque nos highlights' } })

    const button = screen.getByRole('button', { name: 'Gerar Draft' })
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith('Foque nos highlights')
    })
  })

  it('exibe spinner durante geração', () => {
    defaultHookReturn.isGenerating = true

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    expect(screen.getByTestId('newsletter-draft-generating')).toBeInTheDocument()
    expect(screen.getByText('Gerando draft da newsletter...')).toBeInTheDocument()
  })

  it('exibe erro com botão retry', () => {
    defaultHookReturn.error = 'Rate limit exceeded'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    expect(screen.getByTestId('newsletter-draft-error')).toBeInTheDocument()
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()

    const retryButton = screen.getByRole('button', { name: 'Tentar novamente' })
    fireEvent.click(retryButton)
    expect(mockRetry).toHaveBeenCalled()
  })

  it('exibe editor e preview quando draft existe', () => {
    defaultHookReturn.draft = '# Newsletter\n\nConteúdo do draft'
    defaultHookReturn.newsletterStatus = 'draft'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    expect(screen.getByTestId('newsletter-draft-result')).toBeInTheDocument()
    expect(screen.getByTestId('newsletter-draft-editor')).toBeInTheDocument()
    expect(screen.getByTestId('newsletter-draft-preview')).toBeInTheDocument()
  })

  it('mostra botão Regenerar e Confirmar Draft quando draft existe', () => {
    defaultHookReturn.draft = '# Newsletter\n\nConteúdo do draft'
    defaultHookReturn.newsletterStatus = 'draft'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    expect(screen.getByRole('button', { name: /Regenerar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar Draft/ })).toBeInTheDocument()
  })

  it('mostra campo additionalContext no resultado para regeneração', () => {
    defaultHookReturn.draft = '# Newsletter'
    defaultHookReturn.newsletterStatus = 'draft'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    const input = screen.getByTestId('newsletter-additional-context')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('placeholder', 'Dica adicional para regeneração (opcional)')
  })

  it('chama onStatusChange ao clicar Confirmar Draft', async () => {
    defaultHookReturn.draft = '# Newsletter'
    defaultHookReturn.newsletterStatus = 'draft'
    const onStatusChange = vi.fn()

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} onStatusChange={onStatusChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Confirmar Draft/ }))

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('draft')
    })
  })

  it('editor contém o draft', () => {
    defaultHookReturn.draft = '# Meu Draft'
    defaultHookReturn.newsletterStatus = 'draft'

    render(<NewsletterDraftPhase videoId="video-1" video={createVideo()} />)

    const editor = screen.getByTestId('newsletter-draft-editor')
    expect(editor).toHaveValue('# Meu Draft')
  })
})
