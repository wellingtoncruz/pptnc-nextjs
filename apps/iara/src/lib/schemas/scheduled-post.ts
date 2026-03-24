import { z } from 'zod'

import { TimestampSchema } from './podcast'

/**
 * Status enum for scheduled posts.
 *
 * - scheduled: Waiting for Cloud Task to execute at scheduledAt time
 * - publishing: Cloud Task fired, execution in progress
 * - published: Post + comment both succeeded
 * - partially_published: Post succeeded but comment failed
 * - failed: Post failed entirely
 * - cancelled: Cancelled by producer before execution
 */
export const ScheduledPostStatusSchema = z.enum([
  'scheduled',
  'publishing',
  'published',
  'partially_published',
  'failed',
  'cancelled',
])

/**
 * Source type — which tab/feature originated the post.
 * Extensible for future tabs (video, newsletter).
 */
export const SourceTypeSchema = z.enum(['news', 'video', 'newsletter'])

/**
 * Network target type — page or profile publication.
 */
export const NetworkConfigSchema = z.object({
  targetId: z.string().min(1),
  targetType: z.enum(['page', 'profile']),
})

/**
 * Full scheduled post document schema — for reading from Firestore.
 *
 * Collection: podcasts/{podcastId}/scheduled-posts/{postId}
 */
export const ScheduledPostSchema = z.object({
  id: z.string().min(1),

  // Origin
  sourceType: SourceTypeSchema,
  sourceId: z.string().min(1),

  // Content (delivered ready by each tab)
  content: z.string().min(1),
  firstComment: z.string().optional(),
  imageUrl: z.string().optional(),

  // Destination
  network: z.string().min(1),
  networkConfig: NetworkConfigSchema,

  // Scheduling
  scheduledAt: TimestampSchema,
  scheduledBy: z.string().min(1),

  // Execution
  status: ScheduledPostStatusSchema,
  publishedAt: TimestampSchema.optional(),
  externalPostId: z.string().optional(),
  externalCommentId: z.string().optional(),
  error: z.string().optional(),

  // Cloud Tasks
  taskName: z.string().optional(),

  // Housekeeping
  dismissed: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

/**
 * Schema for creating a scheduled post — omits server-managed fields.
 */
export const ScheduledPostCreateSchema = z.object({
  sourceType: SourceTypeSchema,
  sourceId: z.string().min(1),
  content: z.string().min(1),
  firstComment: z.string().optional(),
  imageUrl: z.string().optional(),
  network: z.string().min(1),
  networkConfig: NetworkConfigSchema,
  scheduledAt: z.string().datetime({ message: 'scheduledAt deve ser ISO 8601' }),
  scheduledBy: z.string().min(1),
})

/**
 * Schema for updating a scheduled post — only mutable fields.
 */
export const ScheduledPostUpdateSchema = z.object({
  status: ScheduledPostStatusSchema.optional(),
  publishedAt: TimestampSchema.optional(),
  externalPostId: z.string().optional(),
  externalCommentId: z.string().optional(),
  error: z.string().optional(),
  taskName: z.string().optional(),
  dismissed: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Ao menos um campo deve ser fornecido para atualização' }
)
