'use client'

import { useState } from 'react'

import { Label } from '@/components/ui/label'
import { log } from '@/lib/logger'
import {
  AVAILABLE_TEXT_MODELS,
  AVAILABLE_IMAGE_MODELS,
} from '@/lib/llm/models'
import type { LlmConfig } from '@/types/podcast'

interface LlmConfigSettingsFormProps {
  llmConfig?: LlmConfig
}

/**
 * Sanitize initial model value: if the stored ID is not in the current allowlist,
 * fall back to system default. This prevents stale model IDs (removed from allowlist
 * after a deploy) from causing confusing UI state or Zod validation errors on save.
 */
function sanitizeModelValue(value: string | undefined, allowlist: Array<{ id: string }>): string {
  if (!value) return SYSTEM_DEFAULT
  return allowlist.some(m => m.id === value) ? value : SYSTEM_DEFAULT
}

const SYSTEM_DEFAULT = ''

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
 * Settings form for LLM model selection (text and image).
 * Saves immediately on change with optimistic update and rollback on error.
 *
 * @see Story 18.11 — Parametrização do Modelo LLM
 */
export function LlmConfigSettingsForm({ llmConfig }: LlmConfigSettingsFormProps) {
  const [textModel, setTextModel] = useState(sanitizeModelValue(llmConfig?.textModel, AVAILABLE_TEXT_MODELS))
  const [imageModel, setImageModel] = useState(sanitizeModelValue(llmConfig?.imageModel, AVAILABLE_IMAGE_MODELS))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(
    field: 'textModel' | 'imageModel',
    value: string
  ) {
    const prev = field === 'textModel' ? textModel : imageModel
    const setter = field === 'textModel' ? setTextModel : setImageModel

    // Optimistic update
    setter(value)
    setError(null)
    setSaving(true)

    // Build payload: empty string → undefined (omitted in JSON, cleared in Firestore)
    const updatedConfig: LlmConfig = {}
    const newTextModel = field === 'textModel' ? value : textModel
    const newImageModel = field === 'imageModel' ? value : imageModel
    if (newTextModel) updatedConfig.textModel = newTextModel
    if (newImageModel) updatedConfig.imageModel = newImageModel

    try {
      await updateLlmConfigViaApi(updatedConfig)
    } catch (err) {
      // Revert on failure
      setter(prev)
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
        Selecione os modelos Gemini utilizados para geração de texto e imagens.
        A opção padrão utiliza o modelo configurado no ambiente.
      </p>

      <div className="space-y-4">
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
            {AVAILABLE_TEXT_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} — {model.description}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-image-model">Modelo de Imagem</Label>
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
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {saving && (
        <p className="text-xs text-muted-foreground">Salvando...</p>
      )}
    </div>
  )
}
