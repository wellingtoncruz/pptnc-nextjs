/**
 * Available LLM models for Vertex AI.
 *
 * Centralized allowlist used by:
 * - Zod schema validation (podcast.llmConfig)
 * - Settings UI (model select options)
 * - Client fallback defaults
 *
 * @see Story 18.11 — Parametrização do Modelo LLM
 */

export interface ModelOption {
  /** Vertex AI model ID (e.g., "gemini-2.5-flash") */
  id: string
  /** Display label for UI */
  label: string
  /** Short description of the model's profile */
  description: string
}

/**
 * Available text generation models on Vertex AI.
 *
 * **Família 3.x adicionada em 2026-05-14** — todos em PREVIEW (sem SLA,
 * quota agressiva). Use `gemini-2.5-flash` (default) ou `gemini-2.5-pro`
 * em produção; os 3.x ficam como opt-in pra A/B test em fases LLM.
 */
export const AVAILABLE_TEXT_MODELS: ModelOption[] = [
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Econômico, boa qualidade geral',
  },
  {
    id: 'gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    description: 'Ultra-econômico, tarefas simples',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Padrão atual — melhor custo-benefício',
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    description: 'Econômico com capacidades 2.5',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Maior qualidade, custo maior',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro (Preview)',
    description: 'Reasoning de ponta + 1M context + adaptive thinking. Sem SLA, quota agressiva.',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash (Preview)',
    description: 'Reasoning + latência baixa. Param thinking_level (min/low/med/high). Sem SLA.',
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite (Preview)',
    description: 'Mais econômico da família 3.x. Sem SLA, quota agressiva.',
  },
]

/**
 * Available image generation models on Vertex AI.
 *
 * **Família 3.x promovida a GA em 2026-07 (incidente de produção 2026-07-21).**
 * O Google removeu os aliases `-preview` do publisher ao promover os modelos:
 * `gemini-3.1-flash-image-preview` e `gemini-3-pro-image-preview` passaram a
 * responder **404 NOT_FOUND**, derrubando a geração de thumbnail, a capa da
 * newsletter e a imagem de notícias de uma vez. Era o risco aceito por escrito
 * no Epic 22 / Story 22.2-bis ao adotar um modelo preview (sem SLA), com plano
 * de migração previsto justamente para quando fosse GA — este é o momento.
 * Ver `spike-image-generation-models.md` e `LEGACY_IMAGE_MODEL_ALIASES` abaixo.
 */
export const AVAILABLE_IMAGE_MODELS: ModelOption[] = [
  {
    id: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image',
    description: 'GA — mais econômico. Reference images com qualidade inferior (rejeitado p/ Thumbnail no Epic 22).',
  },
  {
    id: 'gemini-3.1-flash-image',
    label: 'Gemini 3.1 Flash Image (Nano Banana 2)',
    description: 'GA — qualidade superior com reference images. Sucessor direto do preview usado no Thumbnail.',
  },
  {
    id: 'gemini-3-pro-image',
    label: 'Gemini 3 Pro Image',
    description: 'GA — Nano Banana com reasoning. Melhor para gerações multi-turn e edições complexas. Custo maior.',
  },
]

/**
 * IDs preview aposentados pelo Google → sucessor GA.
 *
 * Existe para os valores **já gravados** em `podcast.llmConfig` no Firestore:
 * como os campos de modelo usam `.catch(undefined)` no `LlmConfigSchema`, um ID
 * fora do allowlist seria descartado em SILÊNCIO e a geração cairia no default
 * (`gemini-2.5-flash-image`) — a feature voltaria a funcionar aparentando
 * normalidade, mas com o modelo que o Epic 22 rejeitou por qualidade. O mapa
 * normaliza o valor legado antes da validação, então o produtor continua no
 * mesmo modelo que escolheu, apenas sob o ID novo.
 */
export const LEGACY_IMAGE_MODEL_ALIASES: Record<string, string> = {
  'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image',
  'gemini-3-pro-image-preview': 'gemini-3-pro-image',
}

/** Resolve um ID de modelo de imagem legado para o sucessor GA. Passthrough se não houver alias. */
export function resolveImageModelId<T extends string | undefined>(modelId: T): T {
  if (!modelId) return modelId
  return (LEGACY_IMAGE_MODEL_ALIASES[modelId] ?? modelId) as T
}

/**
 * Available Claude models (Anthropic API direta) — Epic 23 / Story 23.4.
 *
 * Pricing por 1M tokens (USD, 2026-05): Sonnet $3/$15, Opus $15/$75, Haiku $1/$5.
 * Wellington é Max 5x → potencial cobertura via "créditos programáticos" $100/mês
 * a partir de 15-jun-2026 (validar empiricamente pós-data).
 */
export const AVAILABLE_CLAUDE_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    description: 'Padrão recomendado — frontier intelligence a $3/$15 por 1M tokens. 1M context.',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    description: 'Top de linha pra reasoning complexo. $15/$75 por 1M (5x mais caro que Sonnet).',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    description: 'Econômico e rápido — $1/$5 por 1M tokens. Bom pra volumes altos.',
  },
]

/** Provider name → model registry. Usado pra filtrar dropdown no Settings. */
export type LLMProviderId = 'gemini' | 'claude'

export function getTextModelsForProvider(provider: LLMProviderId): ModelOption[] {
  return provider === 'claude' ? AVAILABLE_CLAUDE_MODELS : AVAILABLE_TEXT_MODELS
}

/**
 * Default text model por provider quando produtor não tem `textModel` salvo.
 */
export function getDefaultTextModelForProvider(provider: LLMProviderId): string {
  return provider === 'claude' ? 'claude-sonnet-4-6' : DEFAULT_TEXT_MODEL
}

/** Text model IDs array (Gemini) for legacy Zod enum validation. */
export const TEXT_MODEL_IDS = AVAILABLE_TEXT_MODELS.map(m => m.id)

/** Claude model IDs. */
export const CLAUDE_MODEL_IDS = AVAILABLE_CLAUDE_MODELS.map(m => m.id)

/** All text model IDs across providers (Gemini + Claude) — usado em LlmConfigSchema. */
export const ALL_TEXT_MODEL_IDS = [...TEXT_MODEL_IDS, ...CLAUDE_MODEL_IDS]

/** Image model IDs array for Zod enum validation. */
export const IMAGE_MODEL_IDS = AVAILABLE_IMAGE_MODELS.map(m => m.id)

/** Default text model when no override is configured. */
export const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash'

/** Default image model (Newsletter) when no override is configured. */
export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image'

/**
 * Default image model for Thumbnail wizard phase (Epic 22).
 * Separado do DEFAULT_IMAGE_MODEL porque o Thumbnail depende de reference
 * images com qualidade que o 2.5 não entrega. GA desde 2026-07 — antes disso
 * apontava para `gemini-3.1-flash-image-preview`, que passou a dar 404.
 */
export const DEFAULT_THUMBNAIL_IMAGE_MODEL = 'gemini-3.1-flash-image'
