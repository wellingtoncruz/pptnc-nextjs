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
]

/**
 * Available image generation models on Vertex AI.
 *
 * Notes:
 * - `gemini-2.5-flash-image` is GA — current default for Newsletter cover images.
 * - `gemini-3.1-flash-image-preview` (Nano Banana 2) is PREVIEW — added in
 *   Epic 22 / Story 22.2-bis specifically for the Thumbnail wizard phase, which
 *   requires reference image support that the GA model can't deliver at the
 *   required quality. See spike-image-generation-models.md for the evaluation,
 *   accepted risks (no SLA, aggressive quota), and migration plan when GA.
 */
export const AVAILABLE_IMAGE_MODELS: ModelOption[] = [
  {
    id: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image',
    description: 'GA — usado pela Newsletter',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image (Nano Banana 2)',
    description: 'Preview — qualidade superior com reference images. Para Thumbnail (Epic 22). Sem SLA, quota agressiva.',
  },
]

/** Text model IDs array for Zod enum validation. */
export const TEXT_MODEL_IDS = AVAILABLE_TEXT_MODELS.map(m => m.id)

/** Image model IDs array for Zod enum validation. */
export const IMAGE_MODEL_IDS = AVAILABLE_IMAGE_MODELS.map(m => m.id)

/** Default text model when no override is configured. */
export const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash'

/** Default image model (Newsletter) when no override is configured. */
export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image'

/**
 * Default image model for Thumbnail wizard phase (Epic 22).
 * Separated from DEFAULT_IMAGE_MODEL because Newsletter uses GA models and
 * Thumbnail accepts preview models for the quality/feature trade-off.
 */
export const DEFAULT_THUMBNAIL_IMAGE_MODEL = 'gemini-3.1-flash-image-preview'
