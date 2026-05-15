'use client'

import { useMemo, useState } from 'react'

import { Label } from '@/components/ui/label'
import { log } from '@/lib/logger'
import {
  AVAILABLE_IMAGE_MODELS,
  getTextModelsForProvider,
  type LLMProviderId,
  type ModelOption,
} from '@/lib/llm/models'
import type { LlmConfig } from '@/types/podcast'
import { CostEstimateBadge } from './cost-estimate-badge'

interface LlmConfigSettingsFormProps {
  llmConfig?: LlmConfig
}

const SYSTEM_DEFAULT = ''
const DEFAULT_PROVIDER: LLMProviderId = 'gemini'

/**
 * Sanitize initial model value: if the stored ID is not in the current allowlist,
 * fall back to system default. This prevents stale model IDs (removed from allowlist
 * after a deploy) from causing confusing UI state.
 */
function sanitizeModelValue(value: string | undefined, allowlist: ModelOption[]): string {
  if (!value) return SYSTEM_DEFAULT
  return allowlist.some((m) => m.id === value) ? value : SYSTEM_DEFAULT
}

/**
 * Inferir o provider a partir do textModel salvo. Compatibilidade com docs
 * legacy que tinham só `textModel` sem `provider`.
 */
function inferProvider(llmConfig: LlmConfig | undefined): LLMProviderId {
  if (llmConfig?.provider === 'claude' || llmConfig?.provider === 'gemini') {
    return llmConfig.provider
  }
  if (llmConfig?.textModel?.startsWith('claude-')) return 'claude'
  return DEFAULT_PROVIDER
}

async function updateLlmConfigViaApi(llmConfig: LlmConfig): Promise<void> {
  const response = await fetch('/api/podcast', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ llmConfig }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Erro ao salvar')
  }
}

/**
 * Settings form for LLM model selection.
 *
 * Epic 23 / Story 23.4: ganha dropdown de Provider (Gemini/Claude) que
 * filtra os modelos de texto disponíveis. Image generation continua
 * Gemini-only — Claude não gera imagens.
 *
 * @see Story 18.11 — Parametrização do Modelo LLM original
 * @see Epic 23 — Multi-Provider LLM
 */
export function LlmConfigSettingsForm({ llmConfig }: LlmConfigSettingsFormProps) {
  const [provider, setProvider] = useState<LLMProviderId>(inferProvider(llmConfig))
  const availableTextModels = useMemo(() => getTextModelsForProvider(provider), [provider])
  const [textModel, setTextModel] = useState(sanitizeModelValue(llmConfig?.textModel, availableTextModels))
  const [imageModel, setImageModel] = useState(sanitizeModelValue(llmConfig?.imageModel, AVAILABLE_IMAGE_MODELS))
  const [thumbnailImageModel, setThumbnailImageModel] = useState(
    sanitizeModelValue(llmConfig?.thumbnailImageModel, AVAILABLE_IMAGE_MODELS)
  )
  const [fallbackEnabled, setFallbackEnabled] = useState(llmConfig?.fallbackProvider === 'gemini')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  type LlmField = 'provider' | 'textModel' | 'imageModel' | 'thumbnailImageModel' | 'fallbackEnabled'

  async function handleChange(field: LlmField, value: string | boolean) {
    setError(null)
    setSaving(true)

    // Compute the next full state local-first, then push via API
    const prev = { provider, textModel, imageModel, thumbnailImageModel, fallbackEnabled }
    const next = { ...prev }
    if (field === 'provider') {
      // Troca de provider zera o textModel — produtor reescolhe na nova lista.
      next.provider = value as LLMProviderId
      next.textModel = SYSTEM_DEFAULT
      setProvider(next.provider)
      setTextModel(SYSTEM_DEFAULT)
    } else if (field === 'textModel') {
      next.textModel = value as string
      setTextModel(value as string)
    } else if (field === 'imageModel') {
      next.imageModel = value as string
      setImageModel(value as string)
    } else if (field === 'thumbnailImageModel') {
      next.thumbnailImageModel = value as string
      setThumbnailImageModel(value as string)
    } else if (field === 'fallbackEnabled') {
      next.fallbackEnabled = value as boolean
      setFallbackEnabled(value as boolean)
    }

    // Build payload: empty string → undefined (omitido em JSON, limpo em Firestore).
    // `provider: 'gemini'` é o default da aplicação — só inclui no payload quando
    // for `'claude'`, pra manter docs legacy enxutos e backward compat com testes
    // que esperam payload sem `provider`.
    const payload: LlmConfig = {}
    if (next.provider && next.provider !== DEFAULT_PROVIDER) payload.provider = next.provider
    if (next.textModel) payload.textModel = next.textModel
    if (next.imageModel) payload.imageModel = next.imageModel
    if (next.thumbnailImageModel) payload.thumbnailImageModel = next.thumbnailImageModel
    if (next.fallbackEnabled) payload.fallbackProvider = 'gemini'

    try {
      await updateLlmConfigViaApi(payload)
    } catch (err) {
      // Revert on failure
      setProvider(prev.provider)
      setTextModel(prev.textModel)
      setImageModel(prev.imageModel)
      setThumbnailImageModel(prev.thumbnailImageModel)
      setFallbackEnabled(prev.fallbackEnabled)
      const message = err instanceof Error ? err.message : 'Erro ao salvar'
      setError(message)
      log('ERROR', 'Failed to save LLM config', { field, error: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Selecione o provider de LLM e os modelos utilizados para geração de texto e imagens.
        A opção padrão utiliza o modelo configurado no ambiente.
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="llm-provider">Provider de Texto</Label>
          <select
            id="llm-provider"
            value={provider}
            onChange={(e) => handleChange('provider', e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="gemini">Gemini (Google) — padrão</option>
            <option value="claude">Claude (Anthropic) — opt-in, requer ANTHROPIC_API_KEY</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Trocar o provider zera o modelo selecionado — escolha um modelo da lista filtrada abaixo.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-text-model">Modelo de Texto</Label>
          <select
            id="llm-text-model"
            value={textModel}
            onChange={(e) => handleChange('textModel', e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Padrão do sistema</option>
            {availableTextModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} — {model.description}
              </option>
            ))}
          </select>
          {textModel && (
            <CostEstimateBadge provider={provider} model={textModel} />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-image-model">Modelo de Imagem (Newsletter)</Label>
          <p className="text-xs text-muted-foreground">
            Sempre Gemini — Claude não gera imagens.
          </p>
          <select
            id="llm-image-model"
            value={imageModel}
            onChange={(e) => handleChange('imageModel', e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Padrão do sistema</option>
            {AVAILABLE_IMAGE_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} — {model.description}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-thumbnail-image-model">Modelo de Imagem (Thumbnail)</Label>
          <p className="text-xs text-muted-foreground">
            Usado pela fase Thumbnail do wizard (Epic 22). Separado do modelo da Newsletter para permitir uso de preview models. Sempre Gemini.
          </p>
          <select
            id="llm-thumbnail-image-model"
            value={thumbnailImageModel}
            onChange={(e) => handleChange('thumbnailImageModel', e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Padrão do sistema</option>
            {AVAILABLE_IMAGE_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} — {model.description}
              </option>
            ))}
          </select>
        </div>

        {provider === 'claude' && (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fallbackEnabled}
                onChange={(e) => handleChange('fallbackEnabled', e.target.checked)}
                disabled={saving}
                className="mt-0.5 h-4 w-4 rounded border-input bg-background"
              />
              <div className="space-y-1">
                <div className="text-sm font-medium">Usar Gemini automaticamente quando Claude falhar</div>
                <p className="text-xs text-muted-foreground">
                  Após esgotar os retries (RATE_LIMIT/erro persistente), a chamada é re-executada uma vez com Gemini. Aviso silencioso — sem alerta na UI.
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {saving && <p className="text-xs text-muted-foreground">Salvando...</p>}
    </div>
  )
}
