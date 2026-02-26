import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'

import { AdwordsDataSchema, AdwordsDataCreateSchema } from './adwords'

describe('AdwordsDataSchema', () => {
  const now = Timestamp.now()

  const validAdwordsData = {
    guide: '# Guia AdWords\n\nConteúdo do guia...',
    keywords: ['podcast', 'tecnologia', 'IA'],
    generatedAt: now,
  }

  it('validates valid adwords data', () => {
    const result = AdwordsDataSchema.parse(validAdwordsData)
    expect(result.guide).toBe(validAdwordsData.guide)
    expect(result.keywords).toEqual(['podcast', 'tecnologia', 'IA'])
    expect(result.generatedAt).toBe(now)
  })

  it('accepts optional additionalContext', () => {
    const withContext = { ...validAdwordsData, additionalContext: 'Focar em IA generativa' }
    const result = AdwordsDataSchema.parse(withContext)
    expect(result.additionalContext).toBe('Focar em IA generativa')
  })

  it('works without additionalContext', () => {
    const result = AdwordsDataSchema.parse(validAdwordsData)
    expect(result.additionalContext).toBeUndefined()
  })

  it('accepts empty guide string', () => {
    const empty = { ...validAdwordsData, guide: '' }
    const result = AdwordsDataSchema.parse(empty)
    expect(result.guide).toBe('')
  })

  it('accepts empty keywords array', () => {
    const empty = { ...validAdwordsData, keywords: [] }
    const result = AdwordsDataSchema.parse(empty)
    expect(result.keywords).toEqual([])
  })

  it('rejects missing guide', () => {
    const { guide: _, ...noGuide } = validAdwordsData
    expect(() => AdwordsDataSchema.parse(noGuide)).toThrow()
  })

  it('rejects missing keywords', () => {
    const { keywords: _, ...noKeywords } = validAdwordsData
    expect(() => AdwordsDataSchema.parse(noKeywords)).toThrow()
  })

  it('rejects missing generatedAt', () => {
    const { generatedAt: _, ...noTimestamp } = validAdwordsData
    expect(() => AdwordsDataSchema.parse(noTimestamp)).toThrow()
  })

  it('rejects non-array keywords', () => {
    const invalid = { ...validAdwordsData, keywords: 'not-array' }
    expect(() => AdwordsDataSchema.parse(invalid)).toThrow()
  })

  it('rejects empty object', () => {
    expect(() => AdwordsDataSchema.parse({})).toThrow()
  })
})

describe('AdwordsDataCreateSchema', () => {
  it('validates valid create payload', () => {
    const valid = {
      guide: '# Guia AdWords',
      keywords: ['podcast', 'tech'],
    }
    const result = AdwordsDataCreateSchema.parse(valid)
    expect(result.guide).toBe('# Guia AdWords')
    expect(result.keywords).toEqual(['podcast', 'tech'])
  })

  it('accepts optional additionalContext', () => {
    const withContext = {
      guide: '# Guia',
      keywords: ['test'],
      additionalContext: 'Instruções extras',
    }
    const result = AdwordsDataCreateSchema.parse(withContext)
    expect(result.additionalContext).toBe('Instruções extras')
  })

  it('works without additionalContext', () => {
    const valid = { guide: '# Guia', keywords: [] }
    const result = AdwordsDataCreateSchema.parse(valid)
    expect(result.additionalContext).toBeUndefined()
  })

  it('does NOT include generatedAt (server-side)', () => {
    const withTimestamp = {
      guide: '# Guia',
      keywords: [],
      generatedAt: Timestamp.now(),
    }
    const result = AdwordsDataCreateSchema.parse(withTimestamp)
    expect(result).not.toHaveProperty('generatedAt')
  })

  it('rejects missing guide', () => {
    expect(() => AdwordsDataCreateSchema.parse({ keywords: [] })).toThrow()
  })

  it('rejects missing keywords', () => {
    expect(() => AdwordsDataCreateSchema.parse({ guide: 'test' })).toThrow()
  })

  it('accepts empty strings and arrays', () => {
    const empty = { guide: '', keywords: [] }
    const result = AdwordsDataCreateSchema.parse(empty)
    expect(result.guide).toBe('')
    expect(result.keywords).toEqual([])
  })
})
