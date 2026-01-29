import { describe, it, expect } from 'vitest'

import {
  formatChaptersForYouTube,
  buildDescriptionWithChapters,
  type Chapter,
} from './format-chapters'

describe('formatChaptersForYouTube', () => {
  it('formats single chapter correctly', () => {
    const chapters: Chapter[] = [{ timestamp: '00:00', title: 'Intro' }]
    expect(formatChaptersForYouTube(chapters)).toBe('00:00 Intro')
  })

  it('formats multiple chapters with newlines', () => {
    const chapters: Chapter[] = [
      { timestamp: '00:00', title: 'Introducao' },
      { timestamp: '05:30', title: 'Topico Principal' },
      { timestamp: '15:00', title: 'Conclusao' },
    ]
    const result = formatChaptersForYouTube(chapters)
    expect(result).toBe('00:00 Introducao\n05:30 Topico Principal\n15:00 Conclusao')
  })

  it('returns empty string for empty array', () => {
    expect(formatChaptersForYouTube([])).toBe('')
  })

  it('preserves timestamp format with hours', () => {
    const chapters: Chapter[] = [
      { timestamp: '00:00:00', title: 'Start' },
      { timestamp: '01:30:00', title: 'Middle' },
    ]
    const result = formatChaptersForYouTube(chapters)
    expect(result).toBe('00:00:00 Start\n01:30:00 Middle')
  })

  it('handles special characters in titles', () => {
    const chapters: Chapter[] = [
      { timestamp: '00:00', title: 'Intro: O Começo' },
      { timestamp: '10:00', title: 'Parte #2 - Continuação' },
    ]
    const result = formatChaptersForYouTube(chapters)
    expect(result).toBe('00:00 Intro: O Começo\n10:00 Parte #2 - Continuação')
  })
})

describe('buildDescriptionWithChapters', () => {
  it('returns original description when no chapters', () => {
    const description = 'This is my video description.'
    expect(buildDescriptionWithChapters(description, [])).toBe(description)
  })

  it('returns original description when chapters undefined', () => {
    const description = 'This is my video description.'
    expect(buildDescriptionWithChapters(description)).toBe(description)
  })

  it('prepends chapters with double newline separator', () => {
    const description = 'This is my video description.'
    const chapters: Chapter[] = [
      { timestamp: '00:00', title: 'Intro' },
      { timestamp: '05:00', title: 'Main' },
    ]
    const result = buildDescriptionWithChapters(description, chapters)
    expect(result).toBe('00:00 Intro\n05:00 Main\n\nThis is my video description.')
  })

  it('preserves multiline description', () => {
    const description = 'Line 1\nLine 2\nLine 3'
    const chapters: Chapter[] = [{ timestamp: '00:00', title: 'Start' }]
    const result = buildDescriptionWithChapters(description, chapters)
    expect(result).toBe('00:00 Start\n\nLine 1\nLine 2\nLine 3')
  })

  it('handles empty description with chapters', () => {
    const chapters: Chapter[] = [{ timestamp: '00:00', title: 'Chapter' }]
    const result = buildDescriptionWithChapters('', chapters)
    expect(result).toBe('00:00 Chapter\n\n')
  })
})
