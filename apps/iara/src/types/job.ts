import type { z } from 'zod'

import type {
  JobCreateSchema,
  JobSchema,
  JobStatusSchema,
  JobUpdateSchema,
} from '@/lib/schemas/job'

export type JobStatus = z.infer<typeof JobStatusSchema>
export type JobCreate = z.infer<typeof JobCreateSchema>
export type JobUpdate = z.infer<typeof JobUpdateSchema>
export type Job = z.infer<typeof JobSchema>
