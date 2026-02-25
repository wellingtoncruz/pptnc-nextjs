import { z } from 'zod'

import { TimestampSchema } from './podcast'

/**
 * SocialNetwork schema - global catalog of available social networks.
 *
 * Stored in the global `socialNetworks/{networkId}` collection (not per-podcast).
 * The `id` field matches the Firestore document ID.
 */
export const SocialNetworkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().min(1),
  createdAt: TimestampSchema,
})

/**
 * SocialPost schema - AI-generated social media post per video per network.
 *
 * Stored in subcollection `podcasts/{podcastId}/videos/{videoId}/socialPosts/{networkId}`.
 * The `networkId` field matches the Firestore document ID.
 *
 * @see epic-14-redes-sociais.md#Schema: socialPosts
 */
export const SocialPostSchema = z.object({
  networkId: z.string().min(1),
  cta: z.string(),
  body: z.string(),
  hashtags: z.array(z.string()),
  additionalContext: z.string().optional(),
  generatedAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema,
  processedBy: z.enum(['llm', 'manual']),
})

/**
 * SocialPostUpdate schema - for validating PUT request body.
 *
 * Only includes user-editable fields. Timestamps and processedBy
 * are managed server-side.
 */
export const SocialPostUpdateSchema = z.object({
  cta: z.string(),
  body: z.string(),
  hashtags: z.array(z.string()),
})
