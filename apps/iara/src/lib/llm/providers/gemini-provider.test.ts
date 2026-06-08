/**
 * Tests para GeminiProvider — Epic 23 / Story 23.2.
 *
 * Cobre o contrato `LLMProvider` isolado, sem passar pelo wrapper `callGenAI`.
 * Mocks de `@google/genai` em vi.hoisted pra factory functions verem antes do
 * import do provider.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGenerateContentStream } = vi.hoisted(() => ({
  mockGenerateContentStream: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

vi.mock('@/lib/firebase/config', () => ({
  PROJECT_ID: 'test-project',
  VERTEX_AI_LOCATION: 'global',
  VERTEX_AI_MODEL: undefined,
}))

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = {
      generateContentStream: mockGenerateContentStream,
    }
    constructor() {}
  }
  return { GoogleGenAI: MockGoogleGenAI }
})

function makeStream(chunks: Array<{ text?: string; usageMetadata?: object }>) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) {
        yield c
      }
    },
  }
}

import { LLMError } from '../errors'

import {
  GeminiProvider,
  getGeminiProvider,
  resetGeminiProvider,
} from './gemini-provider'

describe('GeminiProvider', () => {
  beforeEach(() => {
    mockGenerateContentStream.mockReset()
    resetGeminiProvider()
  })

  describe('contract', () => {
    it('exposes name="gemini" and defaultModel', () => {
      const p = new GeminiProvider()
      expect(p.name).toBe('gemini')
      expect(p.defaultModel).toBeTruthy() // 'gemini-2.5-flash' default
    })
  })

  describe('singleton', () => {
    it('getGeminiProvider returns the same instance on repeated calls', () => {
      const a = getGeminiProvider()
      const b = getGeminiProvider()
      expect(a).toBe(b)
    })

    it('resetGeminiProvider forces a fresh instance', () => {
      const a = getGeminiProvider()
      resetGeminiProvider()
      const b = getGeminiProvider()
      expect(a).not.toBe(b)
    })
  })

  describe('generateText', () => {
    it('returns text + usage + cost + latency on success', async () => {
      mockGenerateContentStream.mockResolvedValue(
        makeStream([
          {
            text: '{"result":"ok"}',
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
          },
        ])
      )

      const p = new GeminiProvider()
      const result = await p.generateText({
        systemPrompt: 'You are a helpful assistant.',
        userPrompt: 'Hi.',
      })

      expect(result.text).toBe('{"result":"ok"}')
      expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
      expect(result.estimatedCostUsd).toBeGreaterThan(0)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
      expect(result.modelUsed).toBe('gemini-2.5-flash')
    })

    it('uses the model override when provided', async () => {
      mockGenerateContentStream.mockResolvedValue(
        makeStream([
          {
            text: '{}',
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
          },
        ])
      )

      const p = new GeminiProvider()
      const result = await p.generateText({
        systemPrompt: 'x',
        userPrompt: 'y',
        model: 'gemini-2.5-pro',
      })

      expect(result.modelUsed).toBe('gemini-2.5-pro')
      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-pro' })
      )
    })

    it('uses temperature override when provided', async () => {
      mockGenerateContentStream.mockResolvedValue(
        makeStream([
          { text: '{}', usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } },
        ])
      )

      const p = new GeminiProvider()
      await p.generateText({ systemPrompt: 'x', userPrompt: 'y', temperature: 0.3 })

      const call = mockGenerateContentStream.mock.calls[0][0]
      expect(call.config.temperature).toBe(0.3)
    })

    it('defaults temperature to 0.7 when not provided', async () => {
      mockGenerateContentStream.mockResolvedValue(
        makeStream([
          { text: '{}', usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } },
        ])
      )

      const p = new GeminiProvider()
      await p.generateText({ systemPrompt: 'x', userPrompt: 'y' })

      const call = mockGenerateContentStream.mock.calls[0][0]
      expect(call.config.temperature).toBe(0.7)
    })

    it('packs attachment as inlineData base64', async () => {
      mockGenerateContentStream.mockResolvedValue(
        makeStream([
          { text: '{}', usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } },
        ])
      )

      const p = new GeminiProvider()
      await p.generateText({
        systemPrompt: 'sys',
        userPrompt: 'user',
        attachment: { mimeType: 'text/plain', content: 'transcrição completa' },
      })

      const call = mockGenerateContentStream.mock.calls[0][0]
      expect(call.contents).toEqual([
        { text: 'user' },
        {
          inlineData: {
            mimeType: 'text/plain',
            data: Buffer.from('transcrição completa', 'utf-8').toString('base64'),
          },
        },
      ])
    })

    it('throws INVALID_RESPONSE if no text in any chunk', async () => {
      mockGenerateContentStream.mockResolvedValue(
        makeStream([
          {
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 0, totalTokenCount: 1 },
          },
        ])
      )

      const p = new GeminiProvider()
      await expect(p.generateText({ systemPrompt: 'x', userPrompt: 'y' })).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
    })

    it('maps native SDK errors via createLLMError', async () => {
      mockGenerateContentStream.mockRejectedValue(
        Object.assign(new Error('429 Too Many Requests'), { status: 429 })
      )

      const p = new GeminiProvider()
      const err = await p.generateText({ systemPrompt: 'x', userPrompt: 'y' }).catch((e) => e)
      expect(err).toBeInstanceOf(LLMError)
      // createLLMError mapeia 429/quota → RATE_LIMIT
      expect((err as LLMError).code).toBe('RATE_LIMIT')
    })

    it('accumulates text across multiple chunks', async () => {
      mockGenerateContentStream.mockResolvedValue(
        makeStream([
          { text: 'parte 1 ' },
          { text: 'parte 2 ' },
          {
            text: 'parte 3',
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 30, totalTokenCount: 40 },
          },
        ])
      )

      const p = new GeminiProvider()
      const result = await p.generateText({ systemPrompt: 'x', userPrompt: 'y' })
      expect(result.text).toBe('parte 1 parte 2 parte 3')
      expect(result.usage.totalTokens).toBe(40)
    })
  })

  describe('streamText', () => {
    it('yields delta events for each chunk then done with usage', async () => {
      mockGenerateContentStream.mockResolvedValue(
        makeStream([
          { text: 'hello ' },
          { text: 'world' },
          {
            text: '',
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 },
          },
        ])
      )

      const p = new GeminiProvider()
      const events = []
      for await (const ev of p.streamText({ systemPrompt: 'x', userPrompt: 'y' })) {
        events.push(ev)
      }

      const deltas = events.filter((e) => e.type === 'delta')
      const done = events.find((e) => e.type === 'done')
      expect(deltas).toHaveLength(2)
      expect(deltas.map((d) => (d.type === 'delta' ? d.text : '')).join('')).toBe('hello world')
      expect(done).toBeDefined()
      if (done?.type === 'done') {
        expect(done.usage.totalTokens).toBe(7)
        expect(done.modelUsed).toBe('gemini-2.5-flash')
      }
    })

    it('emits error event when SDK rejects', async () => {
      mockGenerateContentStream.mockRejectedValue(
        Object.assign(new Error('timeout'), { status: 504 })
      )

      const p = new GeminiProvider()
      const events = []
      for await (const ev of p.streamText({ systemPrompt: 'x', userPrompt: 'y' })) {
        events.push(ev)
      }
      const errorEvent = events.find((e) => e.type === 'error')
      expect(errorEvent).toBeDefined()
      if (errorEvent?.type === 'error') {
        expect(errorEvent.code).toBeTruthy()
      }
    })
  })

  describe('estimateTokens', () => {
    it('returns chars/4 ceil', () => {
      const p = new GeminiProvider()
      expect(p.estimateTokens('')).toBe(0)
      expect(p.estimateTokens('abcd')).toBe(1)
      expect(p.estimateTokens('abcde')).toBe(2)
      expect(p.estimateTokens('A engenharia de software é um campo em constante evolução.')).toBe(15)
    })
  })
})
