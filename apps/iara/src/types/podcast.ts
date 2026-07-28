import type { z } from 'zod'

import type {
  PodcastSchema,
  PodcastCreateSchema,
  PodcastUpdateSchema,
  LlmConfigSchema,
  PromptsSchema,
  PromptFieldSchema,
  ThumbnailPromptFieldSchema,
  ExtraImagesPromptsSchema,
  EpisodePromptsSchema,
  CutPromptsSchema,
  ReelPromptsSchema,
  NewsPromptsSchema,
  PersonaSchema,
  PersonasSchema,
  VideoTypesConfigSchema,
  TimestampSchema,
} from '@/lib/schemas/podcast'
import type { VideoTypeConfigSchema } from '@/lib/schemas/video-type-config'

/**
 * Full podcast document type.
 */
export type Podcast = z.infer<typeof PodcastSchema>

/**
 * Input for creating a new podcast.
 */
export type PodcastCreate = z.infer<typeof PodcastCreateSchema>

/**
 * Input for updating podcast fields.
 */
export type PodcastUpdate = z.infer<typeof PodcastUpdateSchema>

/**
 * LLM model configuration (text and image model overrides).
 */
export type LlmConfig = z.infer<typeof LlmConfigSchema>

/**
 * All prompts organized by video type.
 */
export type Prompts = z.infer<typeof PromptsSchema>

/**
 * Individual prompt field with description and expectedOutput.
 */
export type PromptField = z.infer<typeof PromptFieldSchema>

/**
 * Thumbnail prompt field — description/expectedOutput + Base/Reference image URLs (Epic 22).
 */
export type ThumbnailPromptField = z.infer<typeof ThumbnailPromptFieldSchema>

/**
 * Config das imagens extras do episódio — Story, Vitrine e Feed (Epic 28).
 * Cada uma tem a mesma forma do Thumbnail.
 */
export type ExtraImagesPrompts = z.infer<typeof ExtraImagesPromptsSchema>

/**
 * Episode-specific prompts.
 */
export type EpisodePrompts = z.infer<typeof EpisodePromptsSchema>

/**
 * Cut-specific prompts.
 */
export type CutPrompts = z.infer<typeof CutPromptsSchema>

/**
 * Reel-specific prompts.
 */
export type ReelPrompts = z.infer<typeof ReelPromptsSchema>

/**
 * News-specific prompts (social copy generation).
 */
export type NewsPrompts = z.infer<typeof NewsPromptsSchema>

/**
 * LLM persona configuration.
 */
export type Persona = z.infer<typeof PersonaSchema>

/**
 * All personas (critic, writer, socialmedia, adwords).
 */
export type Personas = z.infer<typeof PersonasSchema>

/**
 * Valid persona key derived from PersonasSchema.
 * Centralized to avoid duplicating the union type across files.
 */
export type PersonaKey = keyof Personas

/**
 * Video type duration configuration.
 */
export type VideoTypesConfig = z.infer<typeof VideoTypesConfigSchema>

/**
 * Single video type config (minDuration, maxDuration).
 */
export type VideoTypeConfig = z.infer<typeof VideoTypeConfigSchema>

/**
 * Firestore Timestamp type.
 */
export type FirestoreTimestamp = z.infer<typeof TimestampSchema>

/**
 * Serialized podcast for client components.
 * Timestamps are converted to ISO strings for JSON serialization.
 */
export type SerializedPodcast = Omit<Podcast, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}
