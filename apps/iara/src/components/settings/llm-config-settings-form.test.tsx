import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

vi.mock('./cost-estimate-badge', () => ({
  CostEstimateBadge: () => null,
}))

import { LlmConfigSettingsForm } from './llm-config-settings-form'
import { AVAILABLE_TEXT_MODELS, AVAILABLE_CLAUDE_MODELS } from '@/lib/llm/models'

const mockFetch = vi.fn()

describe('LlmConfigSettingsForm', () => {
  beforeEach(() => {
    global.fetch = mockFetch
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
  })

  it('renders text and image model selects', () => {
    render(<LlmConfigSettingsForm />)
    expect(screen.getByLabelText('Modelo de Texto')).toBeInTheDocument()
    expect(screen.getByLabelText('Modelo de Imagem (Newsletter)')).toBeInTheDocument()
  })

  it('shows "Padrão do sistema" as default for both selects', () => {
    render(<LlmConfigSettingsForm />)
    expect(screen.getByLabelText('Modelo de Texto')).toHaveValue('')
    expect(screen.getByLabelText('Modelo de Imagem (Newsletter)')).toHaveValue('')
  })

  it('shows configured values when llmConfig is provided', () => {
    render(
      <LlmConfigSettingsForm
        llmConfig={{ textModel: 'gemini-2.5-pro', imageModel: 'gemini-2.5-flash-image' }}
      />
    )
    expect(screen.getByLabelText('Modelo de Texto')).toHaveValue('gemini-2.5-pro')
    expect(screen.getByLabelText('Modelo de Imagem (Newsletter)')).toHaveValue('gemini-2.5-flash-image')
  })

  it('lists all available text models plus system default', () => {
    render(<LlmConfigSettingsForm />)
    const textSelect = screen.getByLabelText('Modelo de Texto')
    // Derivado do catálogo (+1 pela opção "Padrão do sistema"), em vez de um
    // número fixo: a contagem literal quebrava a cada modelo adicionado ou
    // aposentado sem sinalizar nada de útil.
    expect(textSelect.querySelectorAll('option')).toHaveLength(AVAILABLE_TEXT_MODELS.length + 1)
  })

  it('does not offer the retired gemini-3.1-flash-lite-preview', () => {
    render(<LlmConfigSettingsForm />)
    const textSelect = screen.getByLabelText('Modelo de Texto')
    const values = Array.from(textSelect.querySelectorAll('option')).map(o => o.getAttribute('value'))
    expect(values).not.toContain('gemini-3.1-flash-lite-preview')
    expect(values).toContain('gemini-3.1-flash-lite')
  })

  it('lists all available image models plus system default', () => {
    render(<LlmConfigSettingsForm />)
    const imageSelect = screen.getByLabelText('Modelo de Imagem (Newsletter)')
    // 3 modelos GA (2.5-flash-image, 3.1-flash-image, 3-pro-image — a família 3.x
    // saiu de preview em 2026-07) + 1 "Padrão do sistema" option
    expect(imageSelect.querySelectorAll('option')).toHaveLength(4)
  })

  it('displays model label and description in option text', () => {
    render(<LlmConfigSettingsForm />)
    // Monta o texto esperado a partir do catálogo — hardcodar a descrição
    // completa fazia o teste quebrar em toda revisão de copy.
    for (const model of [AVAILABLE_TEXT_MODELS[0], AVAILABLE_TEXT_MODELS[2]]) {
      expect(screen.getByText(`${model.label} — ${model.description}`)).toBeInTheDocument()
    }
  })

  it('saves text model selection via PATCH /api/podcast', async () => {
    const user = userEvent.setup()
    render(<LlmConfigSettingsForm />)

    await user.selectOptions(screen.getByLabelText('Modelo de Texto'), 'gemini-2.5-pro')

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
      }))
    })

    // Verify payload: textModel set, imageModel omitted (system default)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toEqual({ llmConfig: { textModel: 'gemini-2.5-pro' } })
  })

  it('saves image model selection via PATCH /api/podcast', async () => {
    const user = userEvent.setup()
    render(<LlmConfigSettingsForm />)

    await user.selectOptions(screen.getByLabelText('Modelo de Imagem (Newsletter)'), 'gemini-2.5-flash-image')

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/podcast', expect.objectContaining({
        method: 'PATCH',
      }))
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toEqual({ llmConfig: { imageModel: 'gemini-2.5-flash-image' } })
  })

  it('preserves existing text model when changing image model', async () => {
    const user = userEvent.setup()
    render(
      <LlmConfigSettingsForm llmConfig={{ textModel: 'gemini-2.5-pro' }} />
    )

    await user.selectOptions(screen.getByLabelText('Modelo de Imagem (Newsletter)'), 'gemini-2.5-flash-image')

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toEqual({
      llmConfig: { textModel: 'gemini-2.5-pro', imageModel: 'gemini-2.5-flash-image' },
    })
  })

  it('sends empty llmConfig when selecting "Padrão do sistema" for all', async () => {
    const user = userEvent.setup()
    render(
      <LlmConfigSettingsForm llmConfig={{ textModel: 'gemini-2.5-pro' }} />
    )

    await user.selectOptions(screen.getByLabelText('Modelo de Texto'), '')

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toEqual({ llmConfig: {} })
  })

  it('shows error and reverts on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Erro de teste' } }),
    })

    const user = userEvent.setup()
    render(<LlmConfigSettingsForm />)

    await user.selectOptions(screen.getByLabelText('Modelo de Texto'), 'gemini-2.5-pro')

    await waitFor(() => {
      expect(screen.getByText('Erro de teste')).toBeInTheDocument()
    })

    // Verify revert to system default
    expect(screen.getByLabelText('Modelo de Texto')).toHaveValue('')
  })

  it('shows saving indicator during API call', async () => {
    let resolvePromise: (value: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise(resolve => { resolvePromise = resolve }))

    const user = userEvent.setup()
    render(<LlmConfigSettingsForm />)

    await user.selectOptions(screen.getByLabelText('Modelo de Texto'), 'gemini-2.5-pro')

    expect(screen.getByText('Salvando...')).toBeInTheDocument()

    resolvePromise!({ ok: true, json: () => Promise.resolve({}) })

    await waitFor(() => {
      expect(screen.queryByText('Salvando...')).not.toBeInTheDocument()
    })
  })

  it('disables selects while saving', async () => {
    let resolvePromise: (value: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise(resolve => { resolvePromise = resolve }))

    const user = userEvent.setup()
    render(<LlmConfigSettingsForm />)

    await user.selectOptions(screen.getByLabelText('Modelo de Texto'), 'gemini-2.5-pro')

    expect(screen.getByLabelText('Modelo de Texto')).toBeDisabled()
    expect(screen.getByLabelText('Modelo de Imagem (Newsletter)')).toBeDisabled()

    resolvePromise!({ ok: true, json: () => Promise.resolve({}) })

    await waitFor(() => {
      expect(screen.getByLabelText('Modelo de Texto')).not.toBeDisabled()
    })
  })

  it('shows descriptive text about model selection', () => {
    render(<LlmConfigSettingsForm />)
    expect(
      screen.getByText(/Selecione o provider de LLM e os modelos/)
    ).toBeInTheDocument()
  })

  it('falls back to system default when stored textModel is not in allowlist', () => {
    render(
      <LlmConfigSettingsForm llmConfig={{ textModel: 'gemini-1.0-removed' }} />
    )
    // Stale model ID not in allowlist → sanitized to system default
    expect(screen.getByLabelText('Modelo de Texto')).toHaveValue('')
  })

  it('falls back to system default when stored imageModel is not in allowlist', () => {
    render(
      <LlmConfigSettingsForm llmConfig={{ imageModel: 'gemini-old-image' }} />
    )
    expect(screen.getByLabelText('Modelo de Imagem (Newsletter)')).toHaveValue('')
  })

  // =========================================================================
  // Epic 22 / Story 22.2-bis — thumbnailImageModel (separated from Newsletter)
  // =========================================================================

  describe('thumbnailImageModel (Epic 22)', () => {
    it('renders a dedicated select for Thumbnail image model', () => {
      render(<LlmConfigSettingsForm />)
      expect(screen.getByLabelText('Modelo de Imagem (Thumbnail)')).toBeInTheDocument()
    })

    it('hydrates from llmConfig.thumbnailImageModel when provided', () => {
      render(
        <LlmConfigSettingsForm llmConfig={{ thumbnailImageModel: 'gemini-3.1-flash-image' }} />
      )
      expect(screen.getByLabelText('Modelo de Imagem (Thumbnail)')).toHaveValue(
        'gemini-3.1-flash-image'
      )
    })

    /**
     * Incidente 2026-07-21: docs no Firestore ainda guardam o ID `-preview`
     * aposentado pelo Google. O select precisa mostrar o sucessor GA — exibir
     * "padrão do sistema" sugeriria que a escolha do produtor foi perdida.
     */
    it('hydrates the GA successor when the stored ID is a retired preview', () => {
      render(
        <LlmConfigSettingsForm
          llmConfig={{
            imageModel: 'gemini-3.1-flash-image-preview',
            thumbnailImageModel: 'gemini-3-pro-image-preview',
          }}
        />
      )
      expect(screen.getByLabelText('Modelo de Imagem (Newsletter)')).toHaveValue(
        'gemini-3.1-flash-image'
      )
      expect(screen.getByLabelText('Modelo de Imagem (Thumbnail)')).toHaveValue(
        'gemini-3-pro-image'
      )
    })

    it('falls back to system default when stored thumbnailImageModel is not in allowlist', () => {
      render(
        <LlmConfigSettingsForm llmConfig={{ thumbnailImageModel: 'gemini-old-thumb' }} />
      )
      expect(screen.getByLabelText('Modelo de Imagem (Thumbnail)')).toHaveValue('')
    })

    it('persists thumbnailImageModel alongside other fields on change', async () => {
      const user = userEvent.setup()
      render(
        <LlmConfigSettingsForm
          llmConfig={{ textModel: 'gemini-2.5-pro', imageModel: 'gemini-2.5-flash-image' }}
        />
      )

      await user.selectOptions(
        screen.getByLabelText('Modelo de Imagem (Thumbnail)'),
        'gemini-3.1-flash-image'
      )

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body).toEqual({
        llmConfig: {
          textModel: 'gemini-2.5-pro',
          imageModel: 'gemini-2.5-flash-image',
          thumbnailImageModel: 'gemini-3.1-flash-image',
        },
      })
    })

    it('omits thumbnailImageModel from payload when set back to system default', async () => {
      const user = userEvent.setup()
      render(
        <LlmConfigSettingsForm
          llmConfig={{ thumbnailImageModel: 'gemini-3.1-flash-image' }}
        />
      )

      await user.selectOptions(screen.getByLabelText('Modelo de Imagem (Thumbnail)'), '')

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body).toEqual({ llmConfig: {} })
    })
  })

  describe('aviso de temperature não suportada', () => {
    const WARNING = 'temperature-unsupported-warning'

    it('avisa quando o modelo escolhido rejeita sampling params', () => {
      render(<LlmConfigSettingsForm llmConfig={{ provider: 'claude', textModel: 'claude-opus-5' }} />)
      const warning = screen.getByTestId(WARNING)
      expect(warning).toBeInTheDocument()
      // O aviso precisa nomear as fases afetadas — um "modelo incompatível"
      // genérico não diria ao produtor o que muda no produto dele.
      expect(warning.textContent).toMatch(/Verificação de Edição/)
      expect(warning.textContent).toMatch(/Risco/)
      expect(warning.textContent).toMatch(/Capítulos/)
    })

    it('não avisa nos modelos que aceitam temperature', () => {
      render(<LlmConfigSettingsForm llmConfig={{ provider: 'claude', textModel: 'claude-sonnet-4-6' }} />)
      expect(screen.queryByTestId(WARNING)).not.toBeInTheDocument()
    })

    it('não avisa quando nenhum modelo está selecionado (padrão do sistema)', () => {
      render(<LlmConfigSettingsForm />)
      expect(screen.queryByTestId(WARNING)).not.toBeInTheDocument()
    })

    it('cobre todos os modelos Claude sem suporte a temperature', () => {
      // Percorre o catálogo real: se um modelo novo entrar sem suporte a
      // temperature, este teste falha até o aviso cobri-lo.
      const unsupported = AVAILABLE_CLAUDE_MODELS.filter(m =>
        ['claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5', 'claude-sonnet-5'].includes(m.id)
      )
      expect(unsupported.length).toBeGreaterThan(0)
      for (const model of unsupported) {
        const { unmount } = render(
          <LlmConfigSettingsForm llmConfig={{ provider: 'claude', textModel: model.id }} />
        )
        expect(screen.getByTestId(WARNING)).toBeInTheDocument()
        unmount()
      }
    })
  })
})
