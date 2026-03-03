import { describe, expect, it } from 'vitest'

import { LlmConfigSchema, PromptsSchema } from './podcast'

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

  // Story 18.8 — news_image prompt field
  it('parses with news group containing news_image', () => {
    const result = PromptsSchema.safeParse({
      ...basePrompts,
      news: {
        news_image: { description: 'Image prompt', expectedOutput: 'Image output' },
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.news?.news_image?.description).toBe('Image prompt')
      expect(result.data.news?.news_image?.expectedOutput).toBe('Image output')
    }
  })

  it('parses with both news_social and news_image', () => {
    const result = PromptsSchema.safeParse({
      ...basePrompts,
      news: {
        news_social: { description: 'Social desc', expectedOutput: 'Social out' },
        news_image: { description: 'Image desc', expectedOutput: 'Image out' },
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.news?.news_social?.description).toBe('Social desc')
      expect(result.data.news?.news_image?.description).toBe('Image desc')
    }
  })
})

// Story 18.11 — LlmConfigSchema
describe('LlmConfigSchema (Story 18.11)', () => {
  it('accepts valid textModel from allowlist', () => {
    const result = LlmConfigSchema.safeParse({ textModel: 'gemini-2.5-flash' })
    expect(result.success).toBe(true)
  })

  it('accepts valid imageModel from allowlist', () => {
    const result = LlmConfigSchema.safeParse({ imageModel: 'gemini-2.5-flash-image' })
    expect(result.success).toBe(true)
  })

  it('accepts both textModel and imageModel together', () => {
    const result = LlmConfigSchema.safeParse({
      textModel: 'gemini-2.0-flash',
      imageModel: 'gemini-2.5-flash-image',
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty object (all defaults)', () => {
    const result = LlmConfigSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects invalid textModel not in allowlist', () => {
    const result = LlmConfigSchema.safeParse({ textModel: 'gpt-4' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid imageModel not in allowlist', () => {
    const result = LlmConfigSchema.safeParse({ imageModel: 'dall-e-3' })
    expect(result.success).toBe(false)
  })
})
