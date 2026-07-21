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
    // 5 GA (2.0-flash, 2.0-flash-lite, 2.5-flash, 2.5-flash-lite, 2.5-pro)
    // + 3 preview 3.x (3.1-pro-preview, 3-flash, 3.1-flash-lite — adicionados 2026-05-14)
    // + 1 "Padrão do sistema" option
    expect(textSelect.querySelectorAll('option')).toHaveLength(9)
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
    expect(screen.getByText('Gemini 2.5 Flash — Padrão atual — melhor custo-benefício')).toBeInTheDocument()
    expect(screen.getByText('Gemini 2.5 Pro — Maior qualidade, custo maior')).toBeInTheDocument()
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
})
