import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'

import { SocialNetworkSchema, SocialPostSchema, SocialPostUpdateSchema } from './social'

describe('SocialNetworkSchema', () => {
  const now = Timestamp.now()

  it('validates a valid social network document', () => {
    const valid = { id: 'instagram', name: 'Instagram', icon: '📸', createdAt: now }
    const result = SocialNetworkSchema.parse(valid)
    expect(result.id).toBe('instagram')
    expect(result.name).toBe('Instagram')
    expect(result.icon).toBe('📸')
    expect(result.createdAt).toBe(now)
  })

  it('validates another valid social network', () => {
    const valid = { id: 'linkedin', name: 'LinkedIn', icon: '💼', createdAt: now }
    const result = SocialNetworkSchema.parse(valid)
    expect(result.id).toBe('linkedin')
    expect(result.name).toBe('LinkedIn')
  })

  it('rejects missing id', () => {
    const invalid = { name: 'Instagram', icon: '📸', createdAt: now }
    expect(() => SocialNetworkSchema.parse(invalid)).toThrow()
  })

  it('rejects empty id', () => {
    const invalid = { id: '', name: 'Instagram', icon: '📸', createdAt: now }
    expect(() => SocialNetworkSchema.parse(invalid)).toThrow()
  })

  it('rejects missing name', () => {
    const invalid = { id: 'instagram', icon: '📸', createdAt: now }
    expect(() => SocialNetworkSchema.parse(invalid)).toThrow()
  })

  it('rejects empty name', () => {
    const invalid = { id: 'instagram', name: '', icon: '📸', createdAt: now }
    expect(() => SocialNetworkSchema.parse(invalid)).toThrow()
  })

  it('rejects missing icon', () => {
    const invalid = { id: 'instagram', name: 'Instagram', createdAt: now }
    expect(() => SocialNetworkSchema.parse(invalid)).toThrow()
  })

  it('rejects empty icon', () => {
    const invalid = { id: 'instagram', name: 'Instagram', icon: '', createdAt: now }
    expect(() => SocialNetworkSchema.parse(invalid)).toThrow()
  })

  it('rejects missing createdAt', () => {
    const invalid = { id: 'instagram', name: 'Instagram', icon: '📸' }
    expect(() => SocialNetworkSchema.parse(invalid)).toThrow()
  })

  it('rejects empty object', () => {
    expect(() => SocialNetworkSchema.parse({})).toThrow()
  })
})

describe('SocialPostSchema', () => {
  const now = Timestamp.now()

  const validPost = {
    networkId: 'instagram',
    cta: 'Confira o novo episódio!',
    body: 'Neste episódio falamos sobre IA e produtividade.',
    hashtags: ['#podcast', '#tech', '#ai'],
    generatedAt: now,
    updatedAt: now,
    processedBy: 'llm' as const,
  }

  it('validates a valid social post', () => {
    const result = SocialPostSchema.parse(validPost)
    expect(result.networkId).toBe('instagram')
    expect(result.cta).toBe('Confira o novo episódio!')
    expect(result.body).toContain('IA e produtividade')
    expect(result.hashtags).toHaveLength(3)
    expect(result.processedBy).toBe('llm')
  })

  it('accepts processedBy manual', () => {
    const manual = { ...validPost, processedBy: 'manual' as const }
    const result = SocialPostSchema.parse(manual)
    expect(result.processedBy).toBe('manual')
  })

  it('rejects invalid processedBy value', () => {
    const invalid = { ...validPost, processedBy: 'auto' }
    expect(() => SocialPostSchema.parse(invalid)).toThrow()
  })

  it('accepts optional additionalContext', () => {
    const withContext = { ...validPost, additionalContext: 'Focus on AI topics' }
    const result = SocialPostSchema.parse(withContext)
    expect(result.additionalContext).toBe('Focus on AI topics')
  })

  it('works without additionalContext', () => {
    const result = SocialPostSchema.parse(validPost)
    expect(result.additionalContext).toBeUndefined()
  })

  it('accepts empty hashtags array', () => {
    const noHashtags = { ...validPost, hashtags: [] }
    const result = SocialPostSchema.parse(noHashtags)
    expect(result.hashtags).toEqual([])
  })

  it('accepts empty cta and body strings', () => {
    const empty = { ...validPost, cta: '', body: '' }
    const result = SocialPostSchema.parse(empty)
    expect(result.cta).toBe('')
    expect(result.body).toBe('')
  })

  it('rejects missing networkId', () => {
    const { networkId: _, ...noNetworkId } = validPost
    expect(() => SocialPostSchema.parse(noNetworkId)).toThrow()
  })

  it('rejects empty networkId', () => {
    const invalid = { ...validPost, networkId: '' }
    expect(() => SocialPostSchema.parse(invalid)).toThrow()
  })

  it('works without generatedAt (manual post)', () => {
    const { generatedAt: _, ...manualPost } = validPost
    const result = SocialPostSchema.parse(manualPost)
    expect(result.generatedAt).toBeUndefined()
  })

  it('rejects missing updatedAt', () => {
    const { updatedAt: _, ...noUpdatedAt } = validPost
    expect(() => SocialPostSchema.parse(noUpdatedAt)).toThrow()
  })

  it('rejects missing processedBy', () => {
    const { processedBy: _, ...noProcessedBy } = validPost
    expect(() => SocialPostSchema.parse(noProcessedBy)).toThrow()
  })
})

describe('SocialPostUpdateSchema', () => {
  it('validates a valid update payload', () => {
    const valid = { cta: 'Updated CTA', body: 'Updated body', hashtags: ['#new'] }
    const result = SocialPostUpdateSchema.parse(valid)
    expect(result.cta).toBe('Updated CTA')
    expect(result.body).toBe('Updated body')
    expect(result.hashtags).toEqual(['#new'])
  })

  it('accepts empty strings and arrays', () => {
    const empty = { cta: '', body: '', hashtags: [] }
    const result = SocialPostUpdateSchema.parse(empty)
    expect(result.cta).toBe('')
    expect(result.hashtags).toEqual([])
  })

  it('rejects missing cta', () => {
    const invalid = { body: 'Body', hashtags: [] }
    expect(() => SocialPostUpdateSchema.parse(invalid)).toThrow()
  })

  it('rejects missing body', () => {
    const invalid = { cta: 'CTA', hashtags: [] }
    expect(() => SocialPostUpdateSchema.parse(invalid)).toThrow()
  })

  it('rejects missing hashtags', () => {
    const invalid = { cta: 'CTA', body: 'Body' }
    expect(() => SocialPostUpdateSchema.parse(invalid)).toThrow()
  })

  it('rejects non-array hashtags', () => {
    const invalid = { cta: 'CTA', body: 'Body', hashtags: 'not-array' }
    expect(() => SocialPostUpdateSchema.parse(invalid)).toThrow()
  })
})
