import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'

import { LlmLogCreateSchema, LlmLogSchema } from './llm-log'

const validLogCreate = {
  component: 'wizard/phase-5',
  model: 'gemini-2.5-flash',
  videoId: 'video-123',
  videoType: 'episode' as const,
  prompt: {
    system: 'You are a content analyst.',
    user: 'Analyze this video transcript.',
  },
  response: 'The video covers topics about...',
}

describe('LlmLogCreateSchema', () => {
  it('validates valid log create data', () => {
    const result = LlmLogCreateSchema.parse(validLogCreate)
    expect(result.component).toBe('wizard/phase-5')
    expect(result.model).toBe('gemini-2.5-flash')
    expect(result.videoId).toBe('video-123')
    expect(result.videoType).toBe('episode')
    expect(result.prompt.system).toBe('You are a content analyst.')
    expect(result.prompt.user).toBe('Analyze this video transcript.')
    expect(result.response).toBe('The video covers topics about...')
  })

  it('rejects empty component', () => {
    expect(() => LlmLogCreateSchema.parse({ ...validLogCreate, component: '' })).toThrow(ZodError)
  })

  it('rejects empty model', () => {
    expect(() => LlmLogCreateSchema.parse({ ...validLogCreate, model: '' })).toThrow(ZodError)
  })

  it('rejects empty videoId', () => {
    expect(() => LlmLogCreateSchema.parse({ ...validLogCreate, videoId: '' })).toThrow(ZodError)
  })

  it('rejects invalid videoType', () => {
    expect(() => LlmLogCreateSchema.parse({ ...validLogCreate, videoType: 'invalid' })).toThrow(ZodError)
  })

  it('validates all video types', () => {
    expect(LlmLogCreateSchema.parse({ ...validLogCreate, videoType: 'episode' }).videoType).toBe('episode')
    expect(LlmLogCreateSchema.parse({ ...validLogCreate, videoType: 'cut' }).videoType).toBe('cut')
    expect(LlmLogCreateSchema.parse({ ...validLogCreate, videoType: 'reel' }).videoType).toBe('reel')
  })

  it('rejects missing prompt fields', () => {
    expect(() => LlmLogCreateSchema.parse({ ...validLogCreate, prompt: { system: 'test' } })).toThrow(ZodError)
    expect(() => LlmLogCreateSchema.parse({ ...validLogCreate, prompt: { user: 'test' } })).toThrow(ZodError)
  })

  it('accepts empty prompt strings', () => {
    const result = LlmLogCreateSchema.parse({ ...validLogCreate, prompt: { system: '', user: '' } })
    expect(result.prompt.system).toBe('')
    expect(result.prompt.user).toBe('')
  })

  it('accepts empty response', () => {
    const result = LlmLogCreateSchema.parse({ ...validLogCreate, response: '' })
    expect(result.response).toBe('')
  })

  it('accepts optional attachment info', () => {
    const result = LlmLogCreateSchema.parse({
      ...validLogCreate,
      attachment: { sizeKB: 42.5, estimatedTokens: 10880 },
    })
    expect(result.attachment?.sizeKB).toBe(42.5)
    expect(result.attachment?.estimatedTokens).toBe(10880)
  })

  it('accepts optional usage info', () => {
    const result = LlmLogCreateSchema.parse({
      ...validLogCreate,
      usage: { promptTokens: 1200, completionTokens: 350, totalTokens: 1550 },
    })
    expect(result.usage?.promptTokens).toBe(1200)
    expect(result.usage?.totalTokens).toBe(1550)
  })

  it('omits attachment and usage when not provided', () => {
    const result = LlmLogCreateSchema.parse(validLogCreate)
    expect(result.attachment).toBeUndefined()
    expect(result.usage).toBeUndefined()
  })

  it('rejects negative attachment sizeKB', () => {
    expect(() => LlmLogCreateSchema.parse({
      ...validLogCreate,
      attachment: { sizeKB: -1, estimatedTokens: 100 },
    })).toThrow(ZodError)
  })
})

describe('LlmLogSchema', () => {
  it('validates full log with string createdAt', () => {
    const result = LlmLogSchema.parse({
      ...validLogCreate,
      id: 'log-1',
      createdAt: '2026-02-26T16:00:00.000Z',
    })
    expect(result.id).toBe('log-1')
    expect(result.createdAt).toBe('2026-02-26T16:00:00.000Z')
  })

  it('validates full log with Firestore Timestamp', () => {
    const mockTimestamp = { toDate: () => new Date(), seconds: 123, nanoseconds: 0 }
    const result = LlmLogSchema.parse({
      ...validLogCreate,
      id: 'log-2',
      createdAt: mockTimestamp,
    })
    expect(result.id).toBe('log-2')
  })

  it('rejects empty id', () => {
    expect(() => LlmLogSchema.parse({ ...validLogCreate, id: '', createdAt: 'date' })).toThrow(ZodError)
  })
})
