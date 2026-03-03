import { describe, expect, it } from 'vitest'

import { NewsSchema } from './news'

describe('NewsSchema — Epic 18 fields', () => {
  const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

  const baseNews = {
    id: 'news-1',
    titulo: 'Test News',
    descricao: 'Description',
    resumo: 'Summary',
    comentarios: 'Comments',
    data: '2024-01-01',
    fonte: { nome: 'Source', url: 'https://source.com' },
    importedAt: mockTimestamp,
  }

  it('parses without new fields (backward-compatible)', () => {
    const result = NewsSchema.safeParse(baseNews)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.related_videos).toBeUndefined()
      expect(result.data.selected_video).toBeUndefined()
      expect(result.data.social).toBeUndefined()
    }
  })

  it('parses with related_videos array', () => {
    const result = NewsSchema.safeParse({
      ...baseNews,
      related_videos: ['vid-1', 'vid-2', 'vid-3'],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.related_videos).toEqual(['vid-1', 'vid-2', 'vid-3'])
    }
  })

  it('parses with selected_video string', () => {
    const result = NewsSchema.safeParse({
      ...baseNews,
      selected_video: 'vid-1',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.selected_video).toBe('vid-1')
    }
  })

  it('parses with selected_video as null', () => {
    const result = NewsSchema.safeParse({
      ...baseNews,
      selected_video: null,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.selected_video).toBeNull()
    }
  })

  it('parses with social string', () => {
    const result = NewsSchema.safeParse({
      ...baseNews,
      social: 'Generated social text',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.social).toBe('Generated social text')
    }
  })

  it('parses with social as null', () => {
    const result = NewsSchema.safeParse({
      ...baseNews,
      social: null,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.social).toBeNull()
    }
  })

  it('parses with all new fields together', () => {
    const result = NewsSchema.safeParse({
      ...baseNews,
      related_videos: ['vid-1', 'vid-2'],
      selected_video: 'vid-1',
      social: 'Social text',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.related_videos).toEqual(['vid-1', 'vid-2'])
      expect(result.data.selected_video).toBe('vid-1')
      expect(result.data.social).toBe('Social text')
    }
  })

  // Story 18.8 — Image fields
  it('parses with imageUrl string', () => {
    const result = NewsSchema.safeParse({
      ...baseNews,
      imageUrl: 'news-images/pptnc/news-1/123.png',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.imageUrl).toBe('news-images/pptnc/news-1/123.png')
    }
  })

  it('parses with imagePrompt string', () => {
    const result = NewsSchema.safeParse({
      ...baseNews,
      imagePrompt: 'A detailed image prompt',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.imagePrompt).toBe('A detailed image prompt')
    }
  })

  it('parses without image fields (backward-compatible)', () => {
    const result = NewsSchema.safeParse(baseNews)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.imageUrl).toBeUndefined()
      expect(result.data.imagePrompt).toBeUndefined()
    }
  })
})
