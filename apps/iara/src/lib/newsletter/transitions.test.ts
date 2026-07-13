import { describe, it, expect } from 'vitest'

import { transition, canTransition, getValidActions } from './transitions'
import { InvalidNewsletterTransitionError } from './types'
import type { NewsletterStatus, NewsletterAction } from './types'

const ALL_STATUSES: NewsletterStatus[] = ['idle', 'draft', 'news_selected', 'image_ready', 'completed']
const ALL_ACTIONS: NewsletterAction[] = ['generateDraft', 'selectNews', 'generateImage', 'generateReport']

describe('newsletter transitions', () => {
  describe('transition()', () => {
    it.each<[NewsletterStatus, NewsletterAction, NewsletterStatus]>([
      ['idle', 'generateDraft', 'draft'],
      ['draft', 'generateDraft', 'draft'],
      ['draft', 'selectNews', 'news_selected'],
      ['news_selected', 'generateDraft', 'draft'],
      ['news_selected', 'selectNews', 'news_selected'],
      ['news_selected', 'generateImage', 'image_ready'],
      ['image_ready', 'generateDraft', 'draft'],
      ['image_ready', 'selectNews', 'news_selected'],
      ['image_ready', 'generateReport', 'completed'],
      ['completed', 'generateDraft', 'draft'],
      ['completed', 'selectNews', 'news_selected'],
      ['draft', 'skipNews', 'news_selected'],
      ['news_selected', 'skipNews', 'news_selected'],
      ['image_ready', 'skipNews', 'news_selected'],
      ['completed', 'skipNews', 'news_selected'],
    ])('transitions %s + %s → %s', (from, action, expected) => {
      expect(transition(from, action)).toBe(expected)
    })

    it('rejeita skipNews antes do rascunho existir (idle)', () => {
      expect(() => transition('idle', 'skipNews')).toThrow(InvalidNewsletterTransitionError)
    })

    it('skip é reversível: selectNews continua válido depois de pular', () => {
      const afterSkip = transition('draft', 'skipNews')
      expect(transition(afterSkip, 'selectNews')).toBe('news_selected')
    })

    it.each<[NewsletterStatus, NewsletterAction]>([
      ['idle', 'selectNews'],
      ['idle', 'generateImage'],
      ['idle', 'generateReport'],
      ['draft', 'generateImage'],
      ['draft', 'generateReport'],
      ['news_selected', 'generateReport'],
      ['image_ready', 'generateImage'],
      ['completed', 'generateImage'],
      ['completed', 'generateReport'],
    ])('throws InvalidNewsletterTransitionError for %s + %s', (from, action) => {
      expect(() => transition(from, action)).toThrow(InvalidNewsletterTransitionError)
    })

    it('error contains currentStatus and action', () => {
      try {
        transition('idle', 'selectNews')
        expect.unreachable('should have thrown InvalidNewsletterTransitionError')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidNewsletterTransitionError)
        const e = error as InvalidNewsletterTransitionError
        expect(e.currentStatus).toBe('idle')
        expect(e.action).toBe('selectNews')
        expect(e.name).toBe('InvalidNewsletterTransitionError')
      }
    })
  })

  describe('canTransition()', () => {
    it.each<[NewsletterStatus, NewsletterAction, boolean]>([
      ['idle', 'generateDraft', true],
      ['idle', 'selectNews', false],
      ['draft', 'selectNews', true],
      ['draft', 'generateDraft', true],
      ['news_selected', 'generateImage', true],
      ['news_selected', 'selectNews', true],
      ['news_selected', 'generateDraft', true],
      ['image_ready', 'generateReport', true],
      ['image_ready', 'generateDraft', true],
      ['image_ready', 'selectNews', true],
      ['image_ready', 'generateImage', false],
      ['completed', 'generateDraft', true],
      ['completed', 'selectNews', true],
      ['completed', 'generateReport', false],
    ])('canTransition(%s, %s) → %s', (from, action, expected) => {
      expect(canTransition(from, action)).toBe(expected)
    })
  })

  describe('getValidActions()', () => {
    it.each<[NewsletterStatus, NewsletterAction[]]>([
      ['idle', ['generateDraft']],
      ['draft', ['generateDraft', 'selectNews', 'skipNews']],
      ['news_selected', ['generateDraft', 'selectNews', 'skipNews', 'generateImage']],
      ['image_ready', ['generateDraft', 'selectNews', 'skipNews', 'generateReport']],
      ['completed', ['generateDraft', 'selectNews', 'skipNews']],
    ])('getValidActions(%s) → %j', (status, expected) => {
      expect(getValidActions(status)).toEqual(expected)
    })
  })

  it('covers all status × action combinations', () => {
    // Ensure every status has been tested for every action
    for (const status of ALL_STATUSES) {
      for (const action of ALL_ACTIONS) {
        // Must not throw unexpected errors — either returns a status or throws InvalidNewsletterTransitionError
        try {
          const result = transition(status, action)
          expect(typeof result).toBe('string')
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidNewsletterTransitionError)
        }
      }
    }
  })
})
