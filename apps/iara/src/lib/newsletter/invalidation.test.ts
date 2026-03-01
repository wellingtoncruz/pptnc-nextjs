import { describe, it, expect } from 'vitest'

import { invalidateFromDraft, invalidateFromImage } from './invalidation'
import type { NewsletterData } from '@/types/newsletter'

const fullData: NewsletterData = {
  status: 'completed',
  draft: 'Conteúdo do draft',
  news: [
    { id: 'n1', title: 'Notícia 1', source: 'Fonte A' },
    { id: 'n2', title: 'Notícia 2' },
  ],
  imagePrompt: 'prompt para imagem',
  imageUrl: 'https://example.com/image.png',
  formatPrompt: 'prompt de formato',
  report: 'Relatório final completo',
}

describe('invalidateFromDraft()', () => {
  it('sets status to draft', () => {
    const result = invalidateFromDraft(fullData)
    expect(result.status).toBe('draft')
  })

  it('preserves draft field', () => {
    const result = invalidateFromDraft(fullData)
    expect(result.draft).toBe('Conteúdo do draft')
  })

  it('clears news field', () => {
    const result = invalidateFromDraft(fullData)
    expect(result.news).toBeUndefined()
  })

  it('clears imagePrompt field', () => {
    const result = invalidateFromDraft(fullData)
    expect(result.imagePrompt).toBeUndefined()
  })

  it('clears imageUrl field', () => {
    const result = invalidateFromDraft(fullData)
    expect(result.imageUrl).toBeUndefined()
  })

  it('clears formatPrompt field', () => {
    const result = invalidateFromDraft(fullData)
    expect(result.formatPrompt).toBeUndefined()
  })

  it('clears report field', () => {
    const result = invalidateFromDraft(fullData)
    expect(result.report).toBeUndefined()
  })
})

describe('invalidateFromImage()', () => {
  it('sets status to image_ready', () => {
    const result = invalidateFromImage(fullData)
    expect(result.status).toBe('image_ready')
  })

  it('preserves draft field', () => {
    const result = invalidateFromImage(fullData)
    expect(result.draft).toBe('Conteúdo do draft')
  })

  it('preserves news field', () => {
    const result = invalidateFromImage(fullData)
    expect(result.news).toEqual(fullData.news)
  })

  it('preserves imagePrompt field', () => {
    const result = invalidateFromImage(fullData)
    expect(result.imagePrompt).toBe('prompt para imagem')
  })

  it('preserves imageUrl field', () => {
    const result = invalidateFromImage(fullData)
    expect(result.imageUrl).toBe('https://example.com/image.png')
  })

  it('clears report field', () => {
    const result = invalidateFromImage(fullData)
    expect(result.report).toBeUndefined()
  })

  it('preserves formatPrompt field', () => {
    const result = invalidateFromImage(fullData)
    expect(result.formatPrompt).toBe('prompt de formato')
  })

  it('does NOT include formatPrompt key when absent in input', () => {
    const { formatPrompt, ...dataWithoutFormat } = fullData
    const result = invalidateFromImage(dataWithoutFormat as NewsletterData)
    expect('formatPrompt' in result).toBe(false)
  })
})
