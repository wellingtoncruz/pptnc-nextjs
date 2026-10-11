import { describe, it, expect, vi } from 'vitest'

import { escapeControlCharsInStrings, parseJSONFromLLM, parseJSONFromLLMOrThrow } from './parse-json'

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

  describe('<json_response> tag extraction (hardened prompts)', () => {
    it('extracts JSON from <json_response> tags', () => {
      const text = '<json_response>\n{"hasIssues": true, "issues": []}\n</json_response>'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({ hasIssues: true, issues: [] })
    })

    it('extracts JSON from <json_response> tags with surrounding text', () => {
      const text = 'Here is my analysis:\n<json_response>\n{"hasRisks": false, "risks": []}\n</json_response>\nLet me know if you need more details.'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({ hasRisks: false, risks: [] })
    })

    it('extracts JSON from <json_response> tags without newlines', () => {
      const text = '<json_response>{"hasIssues": true, "issues": [{"timestamp": "00:12:45", "description": "Test"}]}</json_response>'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({
        hasIssues: true,
        issues: [{ timestamp: '00:12:45', description: 'Test' }],
      })
    })

    it('handles whitespace inside <json_response> tags', () => {
      const text = '<json_response>  \n  {"name": "test"}  \n  </json_response>'
      const result = parseJSONFromLLM(text)
      expect(result).toEqual({ name: 'test' })
    })

    it('extracts complex Phase 2 response', () => {
      const text = `Based on my analysis of the transcription:
<json_response>
{"hasIssues": true, "issues": [{"timestamp": "00:12:45", "description": "Pausa longa de 5 segundos"}, {"timestamp": "00:25:30", "description": "Repetição da palavra então"}]}
</json_response>
Please review these issues.`
      const result = parseJSONFromLLM<{ hasIssues: boolean; issues: unknown[] }>(text)
      expect(result).toEqual({
        hasIssues: true,
        issues: [
          { timestamp: '00:12:45', description: 'Pausa longa de 5 segundos' },
          { timestamp: '00:25:30', description: 'Repetição da palavra então' },
        ],
      })
    })

    it('extracts complex Phase 3 response', () => {
      const text = `<json_response>
{"hasRisks": true, "risks": [{"timestamp": "00:08:20", "risk": "brand_mention", "description": "Menção à marca Apple"}]}
</json_response>`
      const result = parseJSONFromLLM<{ hasRisks: boolean; risks: unknown[] }>(text)
      expect(result).toEqual({
        hasRisks: true,
        risks: [{ timestamp: '00:08:20', risk: 'brand_mention', description: 'Menção à marca Apple' }],
      })
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

    it('parses JSON wrapper even when the body contains nested code blocks (hotfix newsletter-parse-fence)', () => {
      // Regression for the 2026-05-18 incident: newsletter phase 4 generated
      // a JSON whose `report` string contained ``` fenced code blocks. The
      // lazy regex match stopped at the first nested ``` and produced
      // invalid JSON. Stripping the outer fence handles this transparently.
      const innerReport = [
        '# Cabeçalho',
        '',
        'Conteúdo qualquer.',
        '',
        '```typescript',
        'const x = 1',
        '```',
        '',
        'Mais conteúdo.',
        '',
        '```bash',
        'pnpm install',
        '```',
      ].join('\\n')

      const text = '```json\n{"report": "' + innerReport + '"}\n```'
      const result = parseJSONFromLLM<{ report: string }>(text)
      expect(result).not.toBeNull()
      expect(result?.report).toContain('# Cabeçalho')
      expect(result?.report).toContain('pnpm install')
    })

    it('handles fenced JSON with hashtags, emojis and escaped newlines like the 2026-05-18 newsletter payload', () => {
      // Shape mirroring the real production payload.
      const payload =
        '```json\n{\n  "report": "# 🤖 IA na Operação de TI\\n\\nTexto.",\n  "hashtags": "#InteligênciaArtificial #PPTNãoCompila"\n}\n```'
      const result = parseJSONFromLLM<{ report: string; hashtags: string }>(payload)
      expect(result).not.toBeNull()
      expect(result?.hashtags).toContain('#PPTNãoCompila')
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

  // PROD 08–11/10/2026: claude-sonnet-5 separa parágrafos com newline cru
  // dentro da string. 13 jobs de descrição perdidos com o texto correto.
  describe('raw control characters inside strings', () => {
    const paragraphs = 'Primeiro parágrafo.\n\nSegundo parágrafo.'

    it('parses a bare object with raw newlines in the value', () => {
      const raw = `{\n  "description": "${paragraphs}"\n}`
      expect(parseJSONFromLLM(raw)).toEqual({ description: paragraphs })
    })

    it('parses a fenced object with raw newlines in the value', () => {
      const raw = '```json\n{\n  "description": "' + paragraphs + '"\n}\n```'
      expect(parseJSONFromLLM(raw)).toEqual({ description: paragraphs })
    })

    it('keeps escaped quotes and already-escaped newlines intact', () => {
      const raw = '{"description": "Ele disse \\"oi\\".\\nFim\n\tcom tab"}'
      expect(parseJSONFromLLM(raw)).toEqual({ description: 'Ele disse "oi".\nFim\n\tcom tab' })
    })

    it('does not touch whitespace outside strings', () => {
      const raw = '{\n\t"a": "x",\r\n\t"b": [1,\n2]\n}'
      expect(escapeControlCharsInStrings(raw)).toBe(raw)
    })

    it('still returns null when the JSON is broken for another reason', () => {
      expect(parseJSONFromLLM('{"description": "linha\nquebrada", "x":')).toBeNull()
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
