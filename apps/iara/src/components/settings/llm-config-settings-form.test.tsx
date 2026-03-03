import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
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
    expect(screen.getByLabelText('Modelo de Imagem')).toBeInTheDocument()
  })

  it('shows "Padrão do sistema" as default for both selects', () => {
    render(<LlmConfigSettingsForm />)
    expect(screen.getByLabelText('Modelo de Texto')).toHaveValue('')
    expect(screen.getByLabelText('Modelo de Imagem')).toHaveValue('')
  })

  it('shows configured values when llmConfig is provided', () => {
    render(
      <LlmConfigSettingsForm
        llmConfig={{ textModel: 'gemini-2.5-pro', imageModel: 'gemini-2.5-flash-image' }}
      />
    )
    expect(screen.getByLabelText('Modelo de Texto')).toHaveValue('gemini-2.5-pro')
    expect(screen.getByLabelText('Modelo de Imagem')).toHaveValue('gemini-2.5-flash-image')
  })

  it('lists all available text models plus system default', () => {
    render(<LlmConfigSettingsForm />)
    const textSelect = screen.getByLabelText('Modelo de Texto')
    // 5 text models + 1 "Padrão do sistema" option
    expect(textSelect.querySelectorAll('option')).toHaveLength(6)
  })

  it('lists all available image models plus system default', () => {
    render(<LlmConfigSettingsForm />)
    const imageSelect = screen.getByLabelText('Modelo de Imagem')
    // 1 image model + 1 "Padrão do sistema" option
    expect(imageSelect.querySelectorAll('option')).toHaveLength(2)
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

    await user.selectOptions(screen.getByLabelText('Modelo de Imagem'), 'gemini-2.5-flash-image')

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

    await user.selectOptions(screen.getByLabelText('Modelo de Imagem'), 'gemini-2.5-flash-image')

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
    expect(screen.getByLabelText('Modelo de Imagem')).toBeDisabled()

    resolvePromise!({ ok: true, json: () => Promise.resolve({}) })

    await waitFor(() => {
      expect(screen.getByLabelText('Modelo de Texto')).not.toBeDisabled()
    })
  })

  it('shows descriptive text about model selection', () => {
    render(<LlmConfigSettingsForm />)
    expect(
      screen.getByText(/Selecione os modelos Gemini utilizados/)
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
    expect(screen.getByLabelText('Modelo de Imagem')).toHaveValue('')
  })
})
