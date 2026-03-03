import { describe, expect, it } from 'vitest'

import { PromptsSchema } from './podcast'

describe('PromptsSchema — news group (Epic 18)', () => {
  const basePromptField = { description: 'desc', expectedOutput: 'output' }

  const basePrompts = {
    episode: {
      critique: basePromptField,
      editing: basePromptField,
      compliance: basePromptField,
      chapters: basePromptField,
      titles: basePromptField,
      description: basePromptField,
      tags: basePromptField,
    },
    cut: {
      titles: basePromptField,
      thumbs: basePromptField,
      description: basePromptField,
      tags: basePromptField,
    },
    reel: {
      titles: basePromptField,
      description: basePromptField,
      tags: basePromptField,
    },
  }

  it('parses without news group (backward-compatible)', () => {
    const result = PromptsSchema.safeParse(basePrompts)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.news).toBeUndefined()
    }
  })

  it('parses with news group containing news_social', () => {
    const result = PromptsSchema.safeParse({
      ...basePrompts,
      news: {
        news_social: { description: 'Social prompt', expectedOutput: 'Social output' },
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.news?.news_social?.description).toBe('Social prompt')
      expect(result.data.news?.news_social?.expectedOutput).toBe('Social output')
    }
  })

  it('parses with news group with empty news_social', () => {
    const result = PromptsSchema.safeParse({
      ...basePrompts,
      news: {},
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.news).toBeDefined()
      expect(result.data.news?.news_social).toBeUndefined()
    }
  })
})
