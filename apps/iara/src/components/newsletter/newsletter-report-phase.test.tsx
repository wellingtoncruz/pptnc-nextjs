import { render, screen, fireEvent, waitFor } from '@/test-utils'

import type { NewsletterData } from '@/types/newsletter'

import { NewsletterReportPhase } from './newsletter-report-phase'

// --- Mocks ---

const mockGenerate = vi.fn()
const mockSaveReport = vi.fn()
const mockSetFormatPrompt = vi.fn()
const mockRetry = vi.fn()

const defaultHookReturn = {
  report: null as string | null,
  formatPrompt: 'Prompt padrão',
  isGenerating: false,
  error: null as string | null,
  generate: mockGenerate,
  saveReport: mockSaveReport,
  setFormatPrompt: mockSetFormatPrompt,
  retry: mockRetry,
}

vi.mock('@/hooks/use-newsletter-report', () => ({
  useNewsletterReport: () => defaultHookReturn,
}))

const mockAutoSaveSave = vi.fn()
const mockAutoSaveResetValue = vi.fn()
vi.mock('@/hooks/use-auto-save', () => ({
  useAutoSave: () => ({ saveStatus: 'idle', error: null, save: mockAutoSaveSave, resetValue: mockAutoSaveResetValue }),
}))

// --- Fixtures ---

const defaultNewsletterData: NewsletterData = {
  status: 'image_ready',
  draft: '# Newsletter\n\nConteúdo do draft...',
  news: [{ id: 'n1', title: 'Notícia 1' }],
  imagePrompt: 'prompt',
  imageUrl: 'newsletters/video-1/cover.png',
}

function renderPhase(overrides?: Partial<React.ComponentProps<typeof NewsletterReportPhase>>) {
  return render(
    <NewsletterReportPhase
      videoId="video-1"
      newsletterData={defaultNewsletterData}
      defaultFormatPrompt="Prompt padrão do podcast"
      {...overrides}
    />
  )
}

// --- Tests ---

describe('NewsletterReportPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(defaultHookReturn, {
      report: null,
      formatPrompt: 'Prompt padrão',
      isGenerating: false,
      error: null,
    })
  })

  // --- Auto-generate ---

  it('auto-gera relatório quando sem report e formatPrompt disponível', async () => {
    mockGenerate.mockResolvedValue(true)

    renderPhase()

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith('Prompt padrão')
    })
  })

  it('chama onStatusChange com completed quando auto-generate retorna true', async () => {
    mockGenerate.mockResolvedValue(true)
    const onStatusChange = vi.fn()

    renderPhase({ onStatusChange })

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('completed')
    })
  })

  it('NÃO chama onStatusChange quando auto-generate retorna false', async () => {
    mockGenerate.mockResolvedValue(false)
    const onStatusChange = vi.fn()

    renderPhase({ onStatusChange })

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalled()
    })

    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it('não auto-gera quando formatPrompt vazio', () => {
    defaultHookReturn.formatPrompt = ''

    renderPhase()

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('não auto-gera quando já existe erro', () => {
    defaultHookReturn.error = 'Some error'

    renderPhase()

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('exibe spinner de preparação quando sem report (auto-generate pendente)', () => {
    // formatPrompt vazio impede auto-generate, mas componente mostra spinner
    defaultHookReturn.formatPrompt = ''

    renderPhase()

    expect(screen.getByTestId('newsletter-report-auto-generating')).toBeInTheDocument()
  })

  // --- Prompt editor via "Alterar Prompt" ---

  it('alterar prompt mostra prompt editável', () => {
    defaultHookReturn.report = '# Relatório'

    renderPhase()

    fireEvent.click(screen.getByRole('button', { name: /Regenerar Relatório/ }))

    expect(screen.getByTestId('newsletter-report-prompt')).toBeInTheDocument()
    expect(screen.getByTestId('newsletter-format-prompt')).toBeInTheDocument()
  })

  it('pré-preenche prompt com valor do hook no editor de prompt', () => {
    defaultHookReturn.report = '# Relatório'
    defaultHookReturn.formatPrompt = 'Meu prompt editado'

    renderPhase()

    fireEvent.click(screen.getByRole('button', { name: /Regenerar Relatório/ }))

    const textarea = screen.getByTestId('newsletter-format-prompt')
    expect(textarea).toHaveValue('Meu prompt editado')
  })

  it('botão Gerar Relatório desabilitado se prompt vazio', () => {
    defaultHookReturn.report = '# Relatório'
    defaultHookReturn.formatPrompt = ''

    renderPhase()

    fireEvent.click(screen.getByRole('button', { name: /Regenerar Relatório/ }))

    const button = screen.getByTestId('newsletter-generate-report-btn')
    expect(button).toBeDisabled()
  })

  it('botão Gerar Relatório habilitado se prompt preenchido', () => {
    defaultHookReturn.report = '# Relatório'
    defaultHookReturn.formatPrompt = 'Prompt válido'

    renderPhase()

    fireEvent.click(screen.getByRole('button', { name: /Regenerar Relatório/ }))

    const button = screen.getByTestId('newsletter-generate-report-btn')
    expect(button).not.toBeDisabled()
  })

  it('chama generate ao clicar Gerar Relatório', async () => {
    mockGenerate.mockResolvedValue(true)
    defaultHookReturn.report = '# Relatório'
    defaultHookReturn.formatPrompt = 'Meu prompt de formato'

    renderPhase()

    fireEvent.click(screen.getByRole('button', { name: /Regenerar Relatório/ }))
    fireEvent.click(screen.getByTestId('newsletter-generate-report-btn'))

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith('Meu prompt de formato')
    })
  })

  it('chama onStatusChange com completed quando generate manual retorna true', async () => {
    mockGenerate.mockResolvedValue(true)
    defaultHookReturn.report = '# Relatório'
    defaultHookReturn.formatPrompt = 'test'
    const onStatusChange = vi.fn()

    renderPhase({ onStatusChange })

    fireEvent.click(screen.getByRole('button', { name: /Regenerar Relatório/ }))
    fireEvent.click(screen.getByTestId('newsletter-generate-report-btn'))

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('completed')
    })
  })

  it('NÃO chama onStatusChange quando generate manual retorna false', async () => {
    mockGenerate.mockResolvedValue(false)
    defaultHookReturn.report = '# Relatório'
    defaultHookReturn.formatPrompt = 'test'
    const onStatusChange = vi.fn()

    renderPhase({ onStatusChange })

    fireEvent.click(screen.getByRole('button', { name: /Regenerar Relatório/ }))
    fireEvent.click(screen.getByTestId('newsletter-generate-report-btn'))

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalled()
    })

    expect(onStatusChange).not.toHaveBeenCalled()
  })

  // --- Generating state ---

  it('exibe spinner durante geração', () => {
    defaultHookReturn.isGenerating = true

    renderPhase()

    expect(screen.getByTestId('newsletter-report-generating')).toBeInTheDocument()
    expect(screen.getByText('Gerando relatório final...')).toBeInTheDocument()
  })

  // --- Error state ---

  it('exibe erro com botão retry', () => {
    defaultHookReturn.error = 'Rate limit exceeded'

    renderPhase()

    expect(screen.getByTestId('newsletter-report-error')).toBeInTheDocument()
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(mockRetry).toHaveBeenCalled()
  })

  // --- Result state ---

  it('exibe editor e preview quando report existe', () => {
    defaultHookReturn.report = '# Relatório Final\n\nConteúdo formatado...'

    renderPhase()

    expect(screen.getByTestId('newsletter-report-result')).toBeInTheDocument()
    expect(screen.getByTestId('newsletter-report-editor')).toBeInTheDocument()
    expect(screen.getByTestId('newsletter-report-preview')).toBeInTheDocument()
  })

  it('editor contém o report', () => {
    defaultHookReturn.report = '# Meu Relatório'

    renderPhase()

    const editor = screen.getByTestId('newsletter-report-editor')
    expect(editor).toHaveValue('# Meu Relatório')
  })

  it('mostra botão Alterar Prompt quando report existe', () => {
    defaultHookReturn.report = '# Relatório'

    renderPhase()

    expect(screen.getByRole('button', { name: /Regenerar Relatório/ })).toBeInTheDocument()
  })
})
