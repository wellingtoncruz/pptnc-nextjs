import type { z } from 'zod'

import type {
  NewsletterDataSchema,
  NewsletterDataCreateSchema,
  NewsletterStatusSchema,
  NewsletterNewsItemSchema,
} from '@/lib/schemas/newsletter'

export type NewsletterData = z.infer<typeof NewsletterDataSchema>
export type NewsletterDataCreate = z.infer<typeof NewsletterDataCreateSchema>
export type NewsletterStatus = z.infer<typeof NewsletterStatusSchema>
export type NewsletterNewsItem = z.infer<typeof NewsletterNewsItemSchema>
