import type { z } from 'zod'

import type {
  ScheduledPostCreateSchema,
  ScheduledPostSchema,
  ScheduledPostStatusSchema,
  ScheduledPostUpdateSchema,
  SourceTypeSchema,
} from '@/lib/schemas/scheduled-post'

export type ScheduledPost = z.infer<typeof ScheduledPostSchema>
export type ScheduledPostCreate = z.infer<typeof ScheduledPostCreateSchema>
export type ScheduledPostUpdate = z.infer<typeof ScheduledPostUpdateSchema>
export type ScheduledPostStatus = z.infer<typeof ScheduledPostStatusSchema>
export type SourceType = z.infer<typeof SourceTypeSchema>
