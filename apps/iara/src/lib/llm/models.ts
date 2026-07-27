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
 * **Família 3.x adicionada em 2026-05-14**, revisada em 2026-07-27. O
 * `gemini-3.1-flash-lite-preview` foi promovido a GA e o alias preview passou a
 * responder **404 NOT_FOUND** — mesmo padrão que derrubou os modelos de imagem
 * em 2026-07-21 (ver `LEGACY_IMAGE_MODEL_ALIASES`), agora no catálogo de texto.
 * Substituído pelo sucessor `gemini-3.1-flash-lite`, com alias legado abaixo.
 *
 * Preços por 1M tokens conferidos no endpoint **global** (que é o default do
 * Vertex — ver `lesson_vertex_global_endpoint`); tier regional custa +10%.
 */
export const AVAILABLE_TEXT_MODELS: ModelOption[] = [
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Econômico, boa qualidade geral. $0,15/$0,60 por 1M tokens.',
  },
  {
    id: 'gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    description: 'Ultra-econômico, tarefas simples. $0,075/$0,30 por 1M tokens.',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Padrão atual — melhor custo-benefício. $0,30/$2,50 por 1M tokens.',
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    description: 'Econômico com capacidades 2.5. $0,10/$0,40 por 1M tokens.',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Maior qualidade da família 2.x. $1,25/$10 por 1M tokens.',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro (Preview)',
    description: 'Reasoning de ponta + 1M context + adaptive thinking. $2/$12 por 1M. Sem SLA.',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash (Preview)',
    description: 'Reasoning + latência baixa. Param thinking_level (min/low/med/high). $0,50/$3 por 1M. Sem SLA.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    description: 'GA — mais econômico da família 3.x. $0,25/$1,50 por 1M tokens.',
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    description: 'GA — geração Flash mais capaz. $1,50/$9 por 1M tokens.',
  },
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    description: 'GA — sucessor do 3.5 Flash, output mais barato. $1,50/$7,50 por 1M tokens.',
  },
]

/**
 * IDs preview de TEXTO aposentados pelo Google → sucessor GA.
 *
 * Mesma mecânica (e mesma armadilha) do `LEGACY_IMAGE_MODEL_ALIASES`: o campo
 * `textModel` do `LlmConfigSchema` usa `.catch(undefined)`, então um ID fora do
 * allowlist seria descartado em SILÊNCIO e a geração cairia no
 * `DEFAULT_TEXT_MODEL` — troca invisível de modelo. O alias normaliza o valor
 * legado ANTES da validação, preservando a escolha do produtor sob o ID novo.
 */
export const LEGACY_TEXT_MODEL_ALIASES: Record<string, string> = {
  'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite',
}

/** Resolve um ID de modelo de texto legado para o sucessor GA. Passthrough se não houver alias. */
export function resolveTextModelId<T extends string | undefined>(modelId: T): T {
  if (!modelId) return modelId
  return (LEGACY_TEXT_MODEL_ALIASES[modelId] ?? modelId) as T
}

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
 * Available Claude models (Anthropic API direta) — Epic 23 / Story 23.4,
 * revisado em 2026-07-27 contra a doc oficial de modelos da Anthropic.
 *
 * **Correção de preço:** o `claude-opus-4-7` estava catalogado a $15/$75, que é
 * o preço do Opus **4.1** (hoje depreciado). O Opus 4.7 real custa $5/$25 — a
 * estimativa mensal exibida no painel estava 3x inflada para esse modelo.
 *
 * Wellington é Max 5x → potencial cobertura via "créditos programáticos" $100/mês
 * a partir de 15-jun-2026 (validar empiricamente pós-data).
 */
export const AVAILABLE_CLAUDE_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    description: 'Padrão atual — frontier intelligence a $3/$15 por 1M tokens. 1M context.',
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    description: 'Qualidade quase-Opus no preço do Sonnet. $3/$15 por 1M (promo $2/$10 até 31-ago-2026).',
  },
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    description: 'Reasoning complexo e trabalho agêntico. $5/$25 por 1M tokens.',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    description: 'Geração anterior do Opus, mesmo preço do Opus 5. $5/$25 por 1M tokens.',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    description: 'Opus legado, mantido para comparação. $5/$25 por 1M tokens.',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    description: 'Econômico e rápido — $1/$5 por 1M tokens. Bom pra volumes altos.',
  },
]

/**
 * Modelos que **rejeitam** o parâmetro `temperature` com HTTP 400.
 *
 * A Anthropic removeu os parâmetros de sampling (`temperature`/`top_p`/`top_k`)
 * a partir do Opus 4.7; no Sonnet 5 qualquer valor não-default também é
 * rejeitado. Como as fases analíticas `edit-check`, `risk` e `chapters` mandam
 * `temperature: 0.3` (ver `prompts.ts`), mandar o parâmetro para um destes
 * modelos quebraria essas três fases com 400.
 *
 * O `AnthropicProvider` consulta `supportsTemperature()` e **omite** o campo
 * nesses modelos — a redução de alucinação passa a vir apenas do prompt. A UI
 * de Configuração avisa o produtor quando ele seleciona um modelo desta lista,
 * para que a mudança de comportamento não seja silenciosa.
 *
 * Gemini aceita `temperature` em toda a linha — a lista é Claude-only.
 */
export const MODELS_WITHOUT_TEMPERATURE_SUPPORT: ReadonlySet<string> = new Set([
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-sonnet-5',
])

/** `true` quando o modelo aceita o parâmetro `temperature` na request. */
export function supportsTemperature(modelId: string | undefined): boolean {
  if (!modelId) return true
  return !MODELS_WITHOUT_TEMPERATURE_SUPPORT.has(modelId)
}

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
