import type { z } from 'zod'

import type { AdwordsDataSchema, AdwordsDataCreateSchema } from '@/lib/schemas/adwords'

export type AdwordsData = z.infer<typeof AdwordsDataSchema>
export type AdwordsDataCreate = z.infer<typeof AdwordsDataCreateSchema>
