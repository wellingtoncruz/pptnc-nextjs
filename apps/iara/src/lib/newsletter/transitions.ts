import type { NewsletterStatus, NewsletterAction } from './types'
import { InvalidNewsletterTransitionError } from './types'

/**
 * Newsletter state transition map.
 *
 * State flow:
 *   idle → draft (via generateDraft)
 *   draft → news_selected (via selectNews ou skipNews)
 *   news_selected → image_ready (via generateImage)
 *   image_ready → completed (via generateReport)
 *
 * `skipNews` leva ao mesmo status de `selectNews`: a edição segue sem seção de
 * notícias (marcada por `newsSkipped` em NewsletterData) e a Fase 3 é liberada.
 * A decisão é reversível — `selectNews` continua válido depois de um skip.
 */
const transitions: Record<NewsletterStatus, Partial<Record<NewsletterAction, NewsletterStatus>>> = {
  idle: { generateDraft: 'draft' },
  draft: { generateDraft: 'draft', selectNews: 'news_selected', skipNews: 'news_selected' },
  news_selected: { generateDraft: 'draft', selectNews: 'news_selected', skipNews: 'news_selected', generateImage: 'image_ready' },
  image_ready: { generateDraft: 'draft', selectNews: 'news_selected', skipNews: 'news_selected', generateReport: 'completed' },
  completed: { generateDraft: 'draft', selectNews: 'news_selected', skipNews: 'news_selected' },
}

/**
 * Executes a newsletter state transition.
 *
 * Pure function — validates the transition and returns the new status,
 * or throws InvalidNewsletterTransitionError if invalid.
 */
export function transition(current: NewsletterStatus, action: NewsletterAction): NewsletterStatus {
  const next = transitions[current]?.[action]
  if (!next) {
    throw new InvalidNewsletterTransitionError(current, action)
  }
  return next
}

/**
 * Checks if a transition is valid without throwing.
 */
export function canTransition(current: NewsletterStatus, action: NewsletterAction): boolean {
  return transitions[current]?.[action] !== undefined
}

/**
 * Returns all valid actions for a given newsletter status.
 */
export function getValidActions(current: NewsletterStatus): NewsletterAction[] {
  return Object.keys(transitions[current] || {}) as NewsletterAction[]
}
