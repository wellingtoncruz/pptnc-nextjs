export type NewsletterStatus = 'idle' | 'draft' | 'news_selected' | 'image_ready' | 'completed'

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
