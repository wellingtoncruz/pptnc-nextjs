import { z } from 'zod'

/**
 * VideoTypeConfig schema - Configuration for video duration thresholds by type.
 *
 * Used to classify videos into episode, cut, or reel based on duration.
 * Durations are stored in seconds.
 *
 * @see architecture-iara.md#Data Architecture
 */
export const VideoTypeConfigSchema = z.object({
  minDuration: z.number().int().nonnegative(),
  maxDuration: z.number().int().positive().nullable(),
})

export type VideoTypeConfig = z.infer<typeof VideoTypeConfigSchema>
