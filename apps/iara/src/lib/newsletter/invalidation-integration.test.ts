import { describe, it, expect } from 'vitest'

import { invalidateFromDraft, invalidateFromImage } from './invalidation'
import type { NewsletterData } from '@/types/newsletter'

/**
 * Table-driven integration tests for invalidation chains.
 *
 * These tests verify the full invalidation behavior across different
 * starting states, ensuring that downstream fields are always properly
 * cleared and preserved fields remain intact.
 */

const fullData: NewsletterData = {
  status: 'completed',
  draft: 'Conteúdo do draft original',
  news: [
    { id: 'n1', title: 'Notícia 1', source: 'Fonte A', url: 'https://a.com' },
    { id: 'n2', title: 'Notícia 2' },
  ],
  imagePrompt: 'A futuristic podcast studio',
  imageUrl: 'newsletters/pptnc/video-1/cover.png',
  report: 'Relatório final completo',
}

interface InvalidationScenario {
  name: string
  input: NewsletterData
  fn: (data: NewsletterData) => NewsletterData
  expectedStatus: string
  preservedFields: (keyof NewsletterData)[]
  clearedFields: (keyof NewsletterData)[]
}

const scenarios: InvalidationScenario[] = [
  {
    name: 'invalidateFromDraft: completed → draft (limpa tudo downstream)',
    input: { ...fullData },
    fn: invalidateFromDraft,
    expectedStatus: 'draft',
    preservedFields: ['draft'],
    clearedFields: ['news', 'imagePrompt', 'imageUrl', 'report'],
  },
  {
    name: 'invalidateFromDraft: image_ready → draft (limpa news e imagem)',
    input: {
      status: 'image_ready',
      draft: 'Draft existente',
      news: [{ id: 'n1', title: 'News' }],
      imagePrompt: 'prompt',
      imageUrl: 'path/img.png',
    },
    fn: invalidateFromDraft,
    expectedStatus: 'draft',
    preservedFields: ['draft'],
    clearedFields: ['news', 'imagePrompt', 'imageUrl'],
  },
  {
    name: 'invalidateFromDraft: news_selected → draft (limpa news)',
    input: {
      status: 'news_selected',
      draft: 'Draft existente',
      news: [{ id: 'n1', title: 'News' }],
    },
    fn: invalidateFromDraft,
    expectedStatus: 'draft',
    preservedFields: ['draft'],
    clearedFields: ['news'],
  },
  {
    name: 'invalidateFromDraft: draft → draft (apenas substitui draft)',
    input: {
      status: 'draft',
      draft: 'Draft antigo',
    },
    fn: invalidateFromDraft,
    expectedStatus: 'draft',
    preservedFields: ['draft'],
    clearedFields: [],
  },
  {
    name: 'invalidateFromImage: completed → image_ready (limpa report)',
    input: { ...fullData },
    fn: invalidateFromImage,
    expectedStatus: 'image_ready',
    preservedFields: ['draft', 'news', 'imagePrompt', 'imageUrl'],
    clearedFields: ['report'],
  },
  {
    name: 'invalidateFromImage: image_ready → image_ready (preserva tudo)',
    input: {
      status: 'image_ready',
      draft: 'Draft',
      news: [{ id: 'n1', title: 'News' }],
      imagePrompt: 'prompt',
      imageUrl: 'path/img.png',
    },
    fn: invalidateFromImage,
    expectedStatus: 'image_ready',
    preservedFields: ['draft', 'news', 'imagePrompt', 'imageUrl'],
    clearedFields: [],
  },
]

describe('Invalidation integration (table-driven)', () => {
  describe.each(scenarios)('$name', ({ input, fn, expectedStatus, preservedFields, clearedFields }) => {
    it(`sets status to '${expectedStatus}'`, () => {
      const result = fn(input)
      expect(result.status).toBe(expectedStatus)
    })

    if (preservedFields.length > 0) {
      it.each(preservedFields)('preserves field: %s', (field) => {
        const result = fn(input)
        expect(result[field]).toEqual(input[field])
      })
    }

    if (clearedFields.length > 0) {
      it.each(clearedFields)('clears field: %s', (field) => {
        const result = fn(input)
        expect(result[field]).toBeUndefined()
      })
    }
  })

  it('chain: draft regen from completed clears ALL downstream', () => {
    const result = invalidateFromDraft(fullData)
    expect(result).toEqual({
      status: 'draft',
      draft: fullData.draft,
    })
    expect(Object.keys(result)).toHaveLength(2)
  })

  it('chain: image regen from completed preserves all except report', () => {
    const result = invalidateFromImage(fullData)
    expect(result.status).toBe('image_ready')
    expect(result.draft).toBe(fullData.draft)
    expect(result.news).toEqual(fullData.news)
    expect(result.imagePrompt).toBe(fullData.imagePrompt)
    expect(result.imageUrl).toBe(fullData.imageUrl)
    expect(result.report).toBeUndefined()
  })

  it('chain: image regen after draft regen returns minimal data', () => {
    // First: regenerate draft (clears everything downstream)
    const afterDraft = invalidateFromDraft(fullData)
    // Then simulate: user completes phases 1-3, gets to image_ready
    const afterImage = invalidateFromImage({
      ...afterDraft,
      status: 'image_ready',
      news: [{ id: 'new-n1', title: 'New News' }],
      imagePrompt: 'new prompt',
      imageUrl: 'new/path.png',
    })
    expect(afterImage.status).toBe('image_ready')
    expect(afterImage.draft).toBe(fullData.draft)
    expect(afterImage.news).toEqual([{ id: 'new-n1', title: 'New News' }])
    expect(afterImage.report).toBeUndefined()
  })
})
