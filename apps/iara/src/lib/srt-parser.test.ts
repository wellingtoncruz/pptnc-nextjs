import { describe, expect, it } from 'vitest'

import { isValidSrt, parseSrtToText } from './srt-parser'

describe('srt-parser', () => {
  describe('parseSrtToText', () => {
    it('parses single block SRT', () => {
      const srt = `1
00:00:00,000 --> 00:00:02,500
Hello world`

      expect(parseSrtToText(srt)).toBe('Hello world')
    })

    it('parses multiple blocks with paragraph separation', () => {
      const srt = `1
00:00:00,000 --> 00:00:02,500
First sentence

2
00:00:02,500 --> 00:00:05,000
Second sentence`

      expect(parseSrtToText(srt)).toBe('First sentence\n\nSecond sentence')
    })

    it('joins multi-line subtitles with space', () => {
      const srt = `1
00:00:00,000 --> 00:00:02,500
This is a long subtitle
that continues on the next line`

      expect(parseSrtToText(srt)).toBe('This is a long subtitle that continues on the next line')
    })

    it('handles Windows-style line endings (CRLF)', () => {
      const srt = '1\r\n00:00:00,000 --> 00:00:02,500\r\nHello world\r\n\r\n2\r\n00:00:02,500 --> 00:00:05,000\r\nSecond line'

      expect(parseSrtToText(srt)).toBe('Hello world\n\nSecond line')
    })

    it('handles old Mac-style line endings (CR)', () => {
      const srt = '1\r00:00:00,000 --> 00:00:02,500\rHello world\r\r2\r00:00:02,500 --> 00:00:05,000\rSecond line'

      expect(parseSrtToText(srt)).toBe('Hello world\n\nSecond line')
    })

    it('handles timestamps with period instead of comma', () => {
      const srt = `1
00:00:00.000 --> 00:00:02.500
Hello world`

      expect(parseSrtToText(srt)).toBe('Hello world')
    })

    it('skips empty blocks', () => {
      const srt = `1
00:00:00,000 --> 00:00:02,500
Hello world


2
00:00:02,500 --> 00:00:05,000
Second line`

      expect(parseSrtToText(srt)).toBe('Hello world\n\nSecond line')
    })

    it('trims whitespace from text', () => {
      const srt = `1
00:00:00,000 --> 00:00:02,500
  Hello world  `

      expect(parseSrtToText(srt)).toBe('Hello world')
    })

    it('returns empty string for empty input', () => {
      expect(parseSrtToText('')).toBe('')
    })

    it('returns empty string for null/undefined input', () => {
      expect(parseSrtToText(null as unknown as string)).toBe('')
      expect(parseSrtToText(undefined as unknown as string)).toBe('')
    })

    it('skips invalid blocks without timestamp', () => {
      const srt = `1
00:00:00,000 --> 00:00:02,500
Valid block

invalid
no timestamp here

2
00:00:02,500 --> 00:00:05,000
Another valid block`

      expect(parseSrtToText(srt)).toBe('Valid block\n\nAnother valid block')
    })

    it('handles real-world Portuguese SRT example', () => {
      const srt = `1
00:00:00,160 --> 00:00:02,040
Olá pessoal, bem-vindos ao canal

2
00:00:02,040 --> 00:00:04,680
Hoje vamos falar sobre
programação em TypeScript

3
00:00:04,680 --> 00:00:06,800
Vamos começar!`

      const expected = `Olá pessoal, bem-vindos ao canal

Hoje vamos falar sobre programação em TypeScript

Vamos começar!`

      expect(parseSrtToText(srt)).toBe(expected)
    })

    it('handles blocks with only whitespace text lines', () => {
      const srt = `1
00:00:00,000 --> 00:00:02,500


2
00:00:02,500 --> 00:00:05,000
Actual text`

      expect(parseSrtToText(srt)).toBe('Actual text')
    })
  })

  describe('isValidSrt', () => {
    it('returns true for valid SRT content', () => {
      const srt = `1
00:00:00,000 --> 00:00:02,500
Hello world`

      expect(isValidSrt(srt)).toBe(true)
    })

    it('returns true for SRT with period timestamps', () => {
      const srt = `1
00:00:00.000 --> 00:00:02.500
Hello world`

      expect(isValidSrt(srt)).toBe(true)
    })

    it('returns false for plain text', () => {
      expect(isValidSrt('This is just plain text')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isValidSrt('')).toBe(false)
    })

    it('returns false for null/undefined', () => {
      expect(isValidSrt(null as unknown as string)).toBe(false)
      expect(isValidSrt(undefined as unknown as string)).toBe(false)
    })

    it('returns false for HTML content', () => {
      expect(isValidSrt('<html><body>Hello</body></html>')).toBe(false)
    })
  })
})
