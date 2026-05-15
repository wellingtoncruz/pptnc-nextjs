/**
 * Tests para AnthropicProvider — Epic 23 / Story 23.3.
 *
 * Cobre o contrato `LLMProvider` isolado, sem chamar Anthropic API real.
 * Mocks de `@anthropic-ai/sdk` em vi.hoisted pra factory functions verem
 * antes do import do provider.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockMessagesCreate, mockMessagesStream } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockMessagesStream: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: mockMessagesCreate,
      stream: mockMessagesStream,
    }
    constructor() {}
  }
  return { default: MockAnthropic }
})

function makeStreamMock(deltas: string[], usage: { input_tokens: number; output_tokens: number }) {
  const events: Array<Record<string, unknown>> = deltas.map((text) => ({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text },
  }))
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const ev of events) yield ev
    },
    finalMessage: async () => ({ usage }),
  }
}

import { LLMError } from '../errors'

import {
  AnthropicProvider,
  getAnthropicProvider,
  resetAnthropicProvider,
} from './anthropic-provider'

describe('AnthropicProvider', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset()
    mockMessagesStream.mockReset()
    resetAnthropicProvider()
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
  })

  describe('contract', () => {
    it('exposes name="claude" and defaultModel', () => {
      const p = new AnthropicProvider()
      expect(p.name).toBe('claude')
      expect(p.defaultModel).toBe('claude-sonnet-4-6')
    })

    it('throws if ANTHROPIC_API_KEY is missing', () => {
      delete process.env.ANTHROPIC_API_KEY
      expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/)
    })
  })

  describe('singleton', () => {
    it('getAnthropicProvider returns the same instance', () => {
      const a = getAnthropicProvider()
      const b = getAnthropicProvider()
      expect(a).toBe(b)
    })

    it('resetAnthropicProvider forces a fresh instance', () => {
      const a = getAnthropicProvider()
      resetAnthropicProvider()
      const b = getAnthropicProvider()
      expect(a).not.toBe(b)
    })
  })

  describe('generateText', () => {
    it('returns text + usage + cost + latency on success', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"result":"ok"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })

      const p = new AnthropicProvider()
      const result = await p.generateText({
        systemPrompt: 'You are helpful.',
        userPrompt: 'Hi.',
      })

      expect(result.text).toBe('{"result":"ok"}')
      expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 })
      expect(result.estimatedCostUsd).toBeGreaterThan(0) // Sonnet pricing
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
      expect(result.modelUsed).toBe('claude-sonnet-4-6')
    })

    it('uses model override when provided', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })

      const p = new AnthropicProvider()
      const result = await p.generateText({
        systemPrompt: 'x',
        userPrompt: 'y',
        model: 'claude-opus-4-7',
      })
      expect(result.modelUsed).toBe('claude-opus-4-7')
      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-opus-4-7' })
      )
    })

    it('packs attachment inline in user content (not file)', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      })

      const p = new AnthropicProvider()
      await p.generateText({
        systemPrompt: 'sys',
        userPrompt: 'analise:',
        attachment: { mimeType: 'text/plain', content: 'transcrição completa aqui' },
      })

      const call = mockMessagesCreate.mock.calls[0][0]
      expect(call.messages[0].content).toContain('analise:')
      expect(call.messages[0].content).toContain('ANEXO (text/plain)')
      expect(call.messages[0].content).toContain('transcrição completa aqui')
    })

    it('throws INVALID_RESPONSE when content has no text', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [],
        usage: { input_tokens: 1, output_tokens: 0 },
      })

      const p = new AnthropicProvider()
      await expect(p.generateText({ systemPrompt: 'x', userPrompt: 'y' })).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
    })

    it('maps 429 to RATE_LIMIT (retryable)', async () => {
      mockMessagesCreate.mockRejectedValue(
        Object.assign(new Error('rate limit'), { status: 429 })
      )

      const p = new AnthropicProvider()
      const err = await p.generateText({ systemPrompt: 'x', userPrompt: 'y' }).catch((e) => e)
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('RATE_LIMIT')
      expect((err as LLMError).retryable).toBe(true)
    })

    it('maps 401 to API_ERROR (non-retryable)', async () => {
      mockMessagesCreate.mockRejectedValue(
        Object.assign(new Error('auth'), { status: 401 })
      )

      const p = new AnthropicProvider()
      const err = await p.generateText({ systemPrompt: 'x', userPrompt: 'y' }).catch((e) => e)
      expect((err as LLMError).code).toBe('API_ERROR')
      expect((err as LLMError).retryable).toBe(false)
    })

    it('maps 504 to TIMEOUT (retryable)', async () => {
      mockMessagesCreate.mockRejectedValue(
        Object.assign(new Error('timeout'), { status: 504 })
      )

      const p = new AnthropicProvider()
      const err = await p.generateText({ systemPrompt: 'x', userPrompt: 'y' }).catch((e) => e)
      expect((err as LLMError).code).toBe('TIMEOUT')
    })

    it('maps 5xx generic to API_ERROR (retryable)', async () => {
      mockMessagesCreate.mockRejectedValue(
        Object.assign(new Error('boom'), { status: 503 })
      )

      const p = new AnthropicProvider()
      const err = await p.generateText({ systemPrompt: 'x', userPrompt: 'y' }).catch((e) => e)
      expect((err as LLMError).code).toBe('API_ERROR')
      expect((err as LLMError).retryable).toBe(true)
    })
  })

  describe('streamText', () => {
    it('yields delta events for each text delta then done with usage', async () => {
      mockMessagesStream.mockResolvedValue(
        makeStreamMock(['hello ', 'world'], { input_tokens: 5, output_tokens: 2 })
      )

      const p = new AnthropicProvider()
      const events = []
      for await (const ev of p.streamText({ systemPrompt: 'x', userPrompt: 'y' })) {
        events.push(ev)
      }

      const deltas = events.filter((e) => e.type === 'delta')
      const done = events.find((e) => e.type === 'done')
      expect(deltas.map((d) => (d.type === 'delta' ? d.text : '')).join('')).toBe('hello world')
      expect(done).toBeDefined()
      if (done?.type === 'done') {
        expect(done.usage.totalTokens).toBe(7)
        expect(done.modelUsed).toBe('claude-sonnet-4-6')
      }
    })

    it('emits error event when stream rejects', async () => {
      mockMessagesStream.mockRejectedValue(
        Object.assign(new Error('blew up'), { status: 503 })
      )

      const p = new AnthropicProvider()
      const events = []
      for await (const ev of p.streamText({ systemPrompt: 'x', userPrompt: 'y' })) {
        events.push(ev)
      }
      const errorEvent = events.find((e) => e.type === 'error')
      expect(errorEvent).toBeDefined()
      if (errorEvent?.type === 'error') {
        expect(errorEvent.code).toBe('API_ERROR')
      }
    })
  })

  describe('estimateTokens', () => {
    it('returns chars/4 ceil (same heuristic as Gemini)', () => {
      const p = new AnthropicProvider()
      expect(p.estimateTokens('')).toBe(0)
      expect(p.estimateTokens('abcd')).toBe(1)
      expect(p.estimateTokens('A engenharia de software é um campo em constante evolução.')).toBe(15)
    })
  })
})
