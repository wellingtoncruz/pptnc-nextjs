// Single source of truth: Zod schema in @/lib/schemas/newsletter
export type { NewsletterStatus } from '@/types/newsletter'
import type { NewsletterStatus } from '@/types/newsletter'

export type NewsletterAction = 'generateDraft' | 'selectNews' | 'generateImage' | 'generateReport'

export class InvalidNewsletterTransitionError extends Error {
  constructor(
    public readonly currentStatus: NewsletterStatus,
    public readonly action: NewsletterAction
  ) {
    super(`Invalid newsletter transition: cannot apply action '${action}' to status '${currentStatus}'`)
    this.name = 'InvalidNewsletterTransitionError'
  }
}
