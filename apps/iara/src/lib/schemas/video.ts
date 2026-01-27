import { z } from 'zod'

import { TimestampSchema } from './podcast'

/**
 * Video Status schema - validates VideoStatus union type.
 *
 * @see src/lib/video-state-machine/types.ts
 */
export const VideoStatusSchema = z.enum([
  'new',
  'processing',
  'draft',
  'ready',
  'sending',
  'sent',
])

/**
 * Video Type schema - classifies videos by duration.
 *
 * - episode: Full podcast episodes (typically >= 20 min)
 * - cut: Video clips/highlights (typically 3-20 min)
 * - reel: Short-form content (typically < 3 min)
 */
export const VideoTypeSchema = z.enum(['episode', 'cut', 'reel'])

/**
 * YouTube Privacy Status schema - video visibility on YouTube.
 *
 * - public: Visible to everyone
 * - unlisted: Accessible via link but not searchable
 * - private: Only visible to owner
 */
export const YouTubePrivacyStatusSchema = z.enum(['public', 'unlisted', 'private'])

// ============================================================================
// YOUTUBE DATA SCHEMAS
// ============================================================================
//
// REGRA IMUTÁVEL: O schema de videos NUNCA pode ser incompatível com
// EpisodeEntity do portal-web (packages/types/src/episode.ts).
// IAra pode ADICIONAR campos, mas NUNCA remover/renomear/alterar tipo.
// ============================================================================

/**
 * Thumbnail item schema - single thumbnail resolution.
 * From YouTube API snippet.thumbnails.
 */
export const ThumbnailItemSchema = z.object({
  url: z.string().url(),
  width: z.number().optional(),
  height: z.number().optional(),
})

/**
 * Thumbnails schema - all available thumbnail resolutions.
 * From YouTube API snippet.thumbnails.
 */
export const ThumbnailsSchema = z.object({
  default: ThumbnailItemSchema.optional(),
  medium: ThumbnailItemSchema.optional(),
  high: ThumbnailItemSchema.optional(),
  standard: ThumbnailItemSchema.optional(),
  maxres: ThumbnailItemSchema.optional(),
})

/**
 * Statistics schema - video statistics from YouTube API.
 */
export const StatisticsSchema = z.object({
  viewCount: z.union([z.number(), z.string()]).optional(),
  likeCount: z.union([z.number(), z.string()]).optional(),
  commentCount: z.union([z.number(), z.string()]).optional(),
})

// ============================================================================
// IARA-SPECIFIC SCHEMAS (AI-generated metadata)
// ============================================================================

/**
 * Chapter schema - represents a chapter marker in the video.
 *
 * Used for YouTube chapters feature.
 */
export const ChapterSchema = z.object({
  title: z.string().min(1, 'Chapter title is required'),
  timestamp: z.number().nonnegative('Timestamp must be non-negative'),
})

/**
 * Compliance Item schema - represents a single compliance issue.
 *
 * Compliance issues are flagged by AI during content analysis.
 */
export const ComplianceItemSchema = z.object({
  risk: z.string().min(1, 'Risk description is required'),
  argument: z.string().min(1, 'Argument/context is required'),
  timestamp: z.number().nonnegative('Timestamp must be non-negative'),
})

/**
 * Compliance schema - overall compliance status for a video.
 *
 * - ok: No compliance issues found
 * - warning: Issues found that need review
 */
export const ComplianceSchema = z.object({
  status: z.enum(['ok', 'warning']),
  items: z.array(ComplianceItemSchema),
})

// ============================================================================
// VIDEO SCHEMA
// ============================================================================
//
// REGRA IMUTÁVEL: Compatibilidade com EpisodeEntity (packages/types/src/episode.ts)
// - IAra pode ADICIONAR campos novos
// - IAra NÃO PODE remover, renomear ou alterar tipo de campos existentes
// ============================================================================

/**
 * Video Schema - Full video document schema for reading from Firestore.
 *
 * Campos do YouTube (title, description, etc.) são valores iniciais do sync.
 * O produtor edita diretamente esses campos na plataforma.
 * Funcionalidade "Restaurar dados do YouTube" permite reverter aos originais.
 *
 * Path: podcasts/{podcastId}/videos/{videoId}
 *
 * @see architecture-iara.md#Data Architecture
 */
export const VideoSchema = z.object({
  // === Document ID (YouTube video ID) ===
  id: z.string().min(1, 'Video ID is required'),

  // === YouTube API fields (flat, from snippet) ===
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  publishedAt: TimestampSchema,
  thumbnails: ThumbnailsSchema.optional(),
  duration: z.number().nonnegative('Duration must be non-negative'),

  // === YouTube API fields (from statistics) ===
  statistics: StatisticsSchema.optional(),

  // === Portal-web fields ===
  transcriptionSRT: z.string().optional(),
  transcriptionTXT: z.string().optional(),
  guests: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),

  // === Campos IAra (adicionados ao schema existente) ===
  // Opcional para vídeos legados - serão enriquecidos no sync
  podcastId: z.string().optional(),
  status: VideoStatusSchema.optional(),
  videoType: VideoTypeSchema.optional(),
  youtubePrivacyStatus: YouTubePrivacyStatusSchema.optional(),

  // Campos gerados por IA
  tags: z.array(z.string()).optional(),
  chapters: z.array(ChapterSchema).optional(),
  compliance: ComplianceSchema.optional(),

  // Timestamps
  createdAt: TimestampSchema.optional(), // Optional for legacy docs
  updatedAt: TimestampSchema.optional(), // Optional for legacy docs
}).passthrough() // Allow additional legacy fields

/**
 * Video Create Schema - for creating/updating a video document via sync.
 *
 * Contains the IAra fields that sync adds to a video document.
 * Does NOT include legacy fields that already exist.
 */
export const VideoCreateSchema = z.object({
  id: z.string().min(1, 'Video ID is required'),
  podcastId: z.string().min(1, 'Podcast ID is required'),

  // YouTube data (flat)
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  thumbnails: ThumbnailsSchema.optional(),
  duration: z.number().nonnegative('Duration must be non-negative'),
  publishedAt: TimestampSchema,

  // IAra-specific fields
  status: VideoStatusSchema,
  videoType: VideoTypeSchema,
  youtubePrivacyStatus: YouTubePrivacyStatusSchema,
})

/**
 * Video Update Schema - for partial updates to video documents.
 *
 * All fields are optional. Used for incremental updates.
 */
export const VideoUpdateSchema = z.object({
  // YouTube data updates
  title: z.string().optional(),
  description: z.string().optional(),
  thumbnails: ThumbnailsSchema.optional(),
  duration: z.number().optional(),
  publishedAt: TimestampSchema.optional(),
  statistics: StatisticsSchema.optional(),

  // IAra fields updates
  status: VideoStatusSchema.optional(),
  videoType: VideoTypeSchema.optional(),
  youtubePrivacyStatus: YouTubePrivacyStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  chapters: z.array(ChapterSchema).optional(),
  compliance: ComplianceSchema.optional(),
})

/**
 * Video Summary Schema - minimal fields for list display.
 *
 * Used in VideoListItem component.
 * Campos IAra são opcionais para suportar vídeos legados.
 */
export const VideoSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  thumbnails: ThumbnailsSchema.optional(),
  duration: z.number().nonnegative().default(0),
  status: VideoStatusSchema.optional().default('new'),
  videoType: VideoTypeSchema.optional().default('episode'),
  youtubePrivacyStatus: YouTubePrivacyStatusSchema.optional(),
})
