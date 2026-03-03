import { z } from 'zod'

import { VideoTypeConfigSchema } from './video-type-config'

/**
 * Default video type configurations by duration.
 *
 * - episode: >= 20 min (1200s), no max
 * - cut: 3-20 min (180s - 1199s)
 * - reel: < 3 min (0s - 179s)
 *
 * @see architecture-iara.md#Data Architecture
 */
export const DEFAULT_VIDEO_TYPES: {
  episode: { minDuration: number; maxDuration: null }
  cut: { minDuration: number; maxDuration: number }
  reel: { minDuration: number; maxDuration: number }
} = {
  episode: { minDuration: 1200, maxDuration: null },
  cut: { minDuration: 180, maxDuration: 1199 },
  reel: { minDuration: 0, maxDuration: 179 },
}

/**
 * Generic Firestore Timestamp type that works with both Admin and Client SDKs.
 * Both have toDate() method which is the common interface.
 */
interface FirestoreTimestamp {
  toDate(): Date
  toMillis(): number
  seconds: number
  nanoseconds: number
}

/**
 * Firestore Timestamp schema - validates Timestamp objects from Firestore.
 * Works with both Admin SDK and Client SDK Timestamps.
 * Exported for reuse in other schemas (Video, User, etc).
 */
export const TimestampSchema = z.custom<FirestoreTimestamp>(
  (val) => val !== null && typeof val === 'object' && 'toDate' in val,
  'Invalid Firestore Timestamp'
)

/**
 * Maximum length for prompt strings.
 */
export const MAX_PROMPT_LENGTH = 10000

/**
 * Maximum lengths for persona fields.
 */
export const MAX_ROLE_LENGTH = 1000
export const MAX_OBJECTIVE_LENGTH = 2000
export const MAX_RESUME_LENGTH = 5000

/**
 * Maximum length for YouTube footer field.
 * This text is appended to video descriptions.
 */
export const MAX_YOUTUBE_FOOTER_LENGTH = 5000

/**
 * PromptField schema - individual prompt with description and expected output.
 *
 * Each prompt has:
 * - description: What the prompt should do
 * - expectedOutput: What the LLM should return
 */
export const PromptFieldSchema = z.object({
  description: z.string().max(MAX_PROMPT_LENGTH, 'Descrição deve ter no máximo 10000 caracteres'),
  expectedOutput: z.string().max(MAX_PROMPT_LENGTH, 'Retorno esperado deve ter no máximo 10000 caracteres'),
})

/**
 * Episode prompts - prompts specific to full episodes.
 *
 * Includes: critique, editing, compliance, chapters, titles, description, tags, social (optional), adwords (optional)
 */
export const EpisodePromptsSchema = z.object({
  critique: PromptFieldSchema,
  editing: PromptFieldSchema,
  compliance: PromptFieldSchema,
  chapters: PromptFieldSchema,
  titles: PromptFieldSchema,
  description: PromptFieldSchema,
  tags: PromptFieldSchema,
  /** Social media prompts keyed by networkId (e.g., 'instagram', 'linkedin'). */
  social: z.record(z.string(), PromptFieldSchema).optional(),
  /** AdWords/paid traffic optimization prompt. Episode-only (not available for cuts/reels). */
  adwords: PromptFieldSchema.optional(),
  /** Newsletter prompts with 4 sections: draft, news, image, format. Episode-only. */
  newsletter: z.object({
    draft: PromptFieldSchema,
    news: PromptFieldSchema,
    image: PromptFieldSchema,
    format: PromptFieldSchema,
  }).optional(),
})

/**
 * Cut prompts - prompts specific to video cuts.
 *
 * Includes: titles, thumbs, description, tags, social (optional)
 */
export const CutPromptsSchema = z.object({
  titles: PromptFieldSchema,
  thumbs: PromptFieldSchema,
  description: PromptFieldSchema,
  tags: PromptFieldSchema,
  /** Social media prompts keyed by networkId (e.g., 'instagram', 'linkedin'). */
  social: z.record(z.string(), PromptFieldSchema).optional(),
})

/**
 * Reel prompts - prompts specific to short reels.
 *
 * Includes: titles, description, tags, social (optional)
 */
export const ReelPromptsSchema = z.object({
  titles: PromptFieldSchema,
  description: PromptFieldSchema,
  tags: PromptFieldSchema,
  /** Social media prompts keyed by networkId (e.g., 'instagram', 'linkedin'). */
  social: z.record(z.string(), PromptFieldSchema).optional(),
})

/**
 * News prompts - prompts for news-related features.
 *
 * Includes: news_social (social media copy generation from news + episode)
 */
export const NewsPromptsSchema = z.object({
  news_social: PromptFieldSchema.optional(),
})

/**
 * Prompts schema - AI prompts organized by video type + resource type.
 * Each video type has multiple specific prompts.
 * News prompts are optional (backward-compatible).
 */
export const PromptsSchema = z.object({
  episode: EpisodePromptsSchema,
  cut: CutPromptsSchema,
  reel: ReelPromptsSchema,
  news: NewsPromptsSchema.optional(),
})

/**
 * Persona schema - LLM persona configuration.
 *
 * Each persona has:
 * - role: The role/character the LLM should assume
 * - objective: What the persona aims to achieve
 * - resume: Background/credentials of the persona
 */
export const PersonaSchema = z.object({
  role: z.string().max(MAX_ROLE_LENGTH, `Papel deve ter no máximo ${MAX_ROLE_LENGTH} caracteres`),
  objective: z.string().max(MAX_OBJECTIVE_LENGTH, `Objetivo deve ter no máximo ${MAX_OBJECTIVE_LENGTH} caracteres`),
  resume: z.string().max(MAX_RESUME_LENGTH, `Currículo deve ter no máximo ${MAX_RESUME_LENGTH} caracteres`),
})

/**
 * Personas schema - LLM personas at podcast level.
 *
 * Includes:
 * - critic: Persona for critique/review tasks
 * - writer: Persona for content writing tasks
 * - socialmedia: Persona for social media post generation (optional, backward-compatible)
 * - adwords: Persona for AdWords/paid traffic guide generation (optional, backward-compatible)
 */
export const PersonasSchema = z.object({
  critic: PersonaSchema,
  writer: PersonaSchema,
  socialmedia: PersonaSchema.optional(),
  adwords: PersonaSchema.optional(),
})

/**
 * Video type enum for prompt updates.
 */
export const VideoTypeEnum = z.enum(['episode', 'cut', 'reel'])

/**
 * VideoTypesConfig schema - duration thresholds for video classification.
 */
export const VideoTypesConfigSchema = z.object({
  episode: VideoTypeConfigSchema,
  cut: VideoTypeConfigSchema,
  reel: VideoTypeConfigSchema,
})

/**
 * Default PromptField value.
 */
export const DEFAULT_PROMPT_FIELD = {
  description: '',
  expectedOutput: '',
}

/**
 * Default Episode prompts.
 */
export const DEFAULT_EPISODE_PROMPTS = {
  critique: { ...DEFAULT_PROMPT_FIELD },
  editing: { ...DEFAULT_PROMPT_FIELD },
  compliance: { ...DEFAULT_PROMPT_FIELD },
  chapters: { ...DEFAULT_PROMPT_FIELD },
  titles: { ...DEFAULT_PROMPT_FIELD },
  description: { ...DEFAULT_PROMPT_FIELD },
  tags: { ...DEFAULT_PROMPT_FIELD },
  adwords: { ...DEFAULT_PROMPT_FIELD },
  newsletter: {
    draft: { ...DEFAULT_PROMPT_FIELD },
    news: { ...DEFAULT_PROMPT_FIELD },
    image: { ...DEFAULT_PROMPT_FIELD },
    format: { ...DEFAULT_PROMPT_FIELD },
  },
}

/**
 * Default Cut prompts.
 */
export const DEFAULT_CUT_PROMPTS = {
  titles: { ...DEFAULT_PROMPT_FIELD },
  thumbs: { ...DEFAULT_PROMPT_FIELD },
  description: { ...DEFAULT_PROMPT_FIELD },
  tags: { ...DEFAULT_PROMPT_FIELD },
}

/**
 * Default Reel prompts.
 */
export const DEFAULT_REEL_PROMPTS = {
  titles: { ...DEFAULT_PROMPT_FIELD },
  description: { ...DEFAULT_PROMPT_FIELD },
  tags: { ...DEFAULT_PROMPT_FIELD },
}

/**
 * Default News prompts.
 */
export const DEFAULT_NEWS_PROMPTS = {
  news_social: { ...DEFAULT_PROMPT_FIELD },
}

/**
 * Default prompts for all video types + resources.
 */
export const DEFAULT_PROMPTS = {
  episode: DEFAULT_EPISODE_PROMPTS,
  cut: DEFAULT_CUT_PROMPTS,
  reel: DEFAULT_REEL_PROMPTS,
  news: DEFAULT_NEWS_PROMPTS,
}

/**
 * Default Persona value.
 */
export const DEFAULT_PERSONA = {
  role: '',
  objective: '',
  resume: '',
}

/**
 * Default personas.
 */
export const DEFAULT_PERSONAS = {
  critic: { ...DEFAULT_PERSONA },
  writer: { ...DEFAULT_PERSONA },
  socialmedia: { ...DEFAULT_PERSONA },
  adwords: { ...DEFAULT_PERSONA },
}

/**
 * PodcastSchema - Full podcast document schema for reading from Firestore.
 *
 * @see architecture-iara.md#Data Architecture
 */
export const PodcastSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  channelId: z.string().min(1),
  ownerId: z.string().min(1),
  prompts: PromptsSchema,
  personas: PersonasSchema,
  videoTypes: VideoTypesConfigSchema,
  /** Name of the podcast host/presenter. Included in Phase 6 (description) prompts. */
  hostName: z.string().max(200, 'Nome do host deve ter no máximo 200 caracteres').optional(),
  /** YouTube footer text appended to video descriptions. */
  youtubeFooter: z.string().max(MAX_YOUTUBE_FOOTER_LENGTH, `Rodapé deve ter no máximo ${MAX_YOUTUBE_FOOTER_LENGTH} caracteres`).optional(),
  /** IDs of social networks enabled for this podcast. Undefined/absent = none enabled. */
  enabledSocialNetworks: z.array(z.string()).optional(),
  /** Feature toggles for optional sections and sync behavior. */
  features: z.object({
    editorial: z.boolean().default(true),
    news: z.boolean().default(true),
    /** Include videos generated from livestreams in sync. Default: false (skip lives). */
    includeLivestreams: z.boolean().default(false),
    /** Enable social media posts section. Default: false (hidden until explicitly enabled). */
    socialMedia: z.boolean().default(false),
    /** Enable AdWords/paid traffic guide section. Default: false (hidden until explicitly enabled). */
    adwords: z.boolean().default(false),
    /** Enable newsletter generation section. Default: false (hidden until explicitly enabled). */
    newsletter: z.boolean().default(false),
    /** Enable LLM debug mode: logs prompts and responses to Firestore. Default: false. */
    llmDebugMode: z.boolean().default(false),
  }).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

/**
 * PodcastCreateSchema - Schema for creating a new podcast (without auto-generated fields).
 */
export const PodcastCreateSchema = PodcastSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

/**
 * PodcastUpdateSchema - Partial schema for updating podcast fields.
 * Excludes id, createdAt, updatedAt (managed by system).
 */
export const PodcastUpdateSchema = PodcastSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial()
