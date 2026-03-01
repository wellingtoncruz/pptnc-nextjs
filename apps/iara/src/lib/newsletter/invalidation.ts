import type { NewsletterData } from '@/types/newsletter'

/**
 * Invalidates from draft phase — regenerate draft.
 *
 * Returns data with status 'draft', clearing all downstream fields
 * (news, imagePrompt, imageUrl, report).
 * Preserves only draft and status.
 */
export function invalidateFromDraft(data: NewsletterData): NewsletterData {
  return {
    status: 'draft',
    draft: data.draft,
  }
}

/**
 * Invalidates from image phase — regenerate report.
 *
 * Returns data with status 'image_ready', clearing only the report field.
 * Preserves draft, news, imagePrompt, imageUrl.
 */
export function invalidateFromImage(data: NewsletterData): NewsletterData {
  return {
    status: 'image_ready',
    draft: data.draft,
    news: data.news,
    imagePrompt: data.imagePrompt,
    imageUrl: data.imageUrl,
  }
}
