import { describe, it, expect, vi } from 'vitest'

import { parseJSONFromLLM, parseJSONFromLLMOrThrow } from './parse-json'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

describe('parseJSONFromLLM', () => {
  describe('direct JSON parsing', () => {
    it('parses valid JSON object', () => {
      const result = parseJSONFromLLM('{"name": "test", "value": 42}')
      expect(result).toEqual({ name: 'test', value: 42 })
    })

    it('parses valid JSON array', () => {
      const result = parseJSONFromLLM('[1, 2, 3]')
      expect(result).toEqual([1, 2, 3])
    })

    it('parses nested JSON', () => {
      const result = parseJSONFromLLM('{"outer": {"inner": "value"}}')
      expect(result).toEqual({ outer: { inner: 'value' } })
    })
  })

  describe('markdown code block extraction', () => {
    it('extracts JSON from ```json code block', () => {
      const text = '```json\n{"name": "test"}\n```'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({ name: 'test' })
    })

    it('extracts JSON from ``` code block (no language)', () => {
      const text = '```\n{"name": "test"}\n```'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({ name: 'test' })
    })

    it('extracts JSON with surrounding text', () => {
      const text = 'Here is the response:\n```json\n{"name": "test"}\n```\nHope this helps!'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({ name: 'test' })
    })

    it('handles code block without newlines', () => {
      const text = '```json{"name": "test"}```'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({ name: 'test' })
    })
  })

  describe('JSON extraction from text', () => {
    it('extracts JSON object from text with prefix', () => {
      const text = 'The analysis is: {"hasIssues": true, "issues": []}'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({ hasIssues: true, issues: [] })
    })

    it('extracts JSON object from text with suffix', () => {
      const text = '{"hasIssues": false} - No issues found.'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({ hasIssues: false })
    })

    it('extracts JSON array from text', () => {
      const text = 'Tags: ["tag1", "tag2", "tag3"]'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual(['tag1', 'tag2', 'tag3'])
    })

    it('extracts complex nested JSON from text', () => {
      const text = `Based on my analysis:
        {
          "hasRisks": true,
          "risks": [
            {"timestamp": "00:05:30", "risk": "brand_mention", "description": "Mentioned XYZ"}
          ]
        }
        Let me know if you need more details.`
      const result = parseJSONFromLLM<{ hasRisks: boolean; risks: unknown[] }>(text)
      expect(result).toEqual({
        hasRisks: true,
        risks: [{ timestamp: '00:05:30', risk: 'brand_mention', description: 'Mentioned XYZ' }],
      })
    })
  })

  describe('failure cases', () => {
    it('returns null for empty string', () => {
      const result = parseJSONFromLLM('')
      expect(result).toBeNull()
    })

    it('returns null for plain text', () => {
      const result = parseJSONFromLLM('This is just plain text without any JSON.')
      expect(result).toBeNull()
    })

    it('returns null for malformed JSON', () => {
      const result = parseJSONFromLLM('{name: "test"}') // Missing quotes on key
      expect(result).toBeNull()
    })

    it('returns null for truncated JSON', () => {
      const result = parseJSONFromLLM('{"name": "test", "value":')
      expect(result).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('handles JSON with escaped characters', () => {
      const result = parseJSONFromLLM('{"text": "Line1\\nLine2"}')
      expect(result).toEqual({ text: 'Line1\nLine2' })
    })

    it('handles JSON with unicode', () => {
      const result = parseJSONFromLLM('{"emoji": "🎉", "portuguese": "descrição"}')
      expect(result).toEqual({ emoji: '🎉', portuguese: 'descrição' })
    })

    it('handles empty object', () => {
      const result = parseJSONFromLLM('{}')
      expect(result).toEqual({})
    })

    it('handles empty array', () => {
      const result = parseJSONFromLLM('[]')
      expect(result).toEqual([])
    })
  })
})

describe('parseJSONFromLLMOrThrow', () => {
  it('returns parsed JSON on success', () => {
    const result = parseJSONFromLLMOrThrow('{"name": "test"}')
    expect(result).toEqual({ name: 'test' })
  })

  it('throws on parse failure', () => {
    expect(() => parseJSONFromLLMOrThrow('not json')).toThrow('Failed to parse JSON from LLM response')
  })

  it('logs error details on failure', async () => {
    const { log } = await import('@/lib/logger')

    try {
      parseJSONFromLLMOrThrow('invalid json content', { phase: 2 })
    } catch {
      // Expected to throw
    }

    expect(log).toHaveBeenCalledWith('ERROR', 'Failed to parse JSON from LLM response', expect.objectContaining({
      phase: 2,
      rawResponseLength: 20,
      rawResponsePreview: 'invalid json content',
    }))
  })
})
