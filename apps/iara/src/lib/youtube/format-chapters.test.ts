import { describe, it, expect } from 'vitest'

import {
  formatChaptersForYouTube,
  buildDescriptionWithChapters,
  buildCompleteYouTubeDescription,
  resolveVideoPlaceholders,
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

describe('resolveVideoPlaceholders', () => {
  it('replaces {{video.spotifyUrl}} with actual value', () => {
    const result = resolveVideoPlaceholders(
      'Ouça no Spotify: {{video.spotifyUrl}}',
      { spotifyUrl: 'https://open.spotify.com/episode/123' }
    )
    expect(result).toBe('Ouça no Spotify: https://open.spotify.com/episode/123')
  })

  it('replaces multiple placeholders', () => {
    const result = resolveVideoPlaceholders(
      '{{video.title}} - Spotify: {{video.spotifyUrl}}',
      { title: 'Meu Episódio', spotifyUrl: 'https://open.spotify.com/ep/1' }
    )
    expect(result).toBe('Meu Episódio - Spotify: https://open.spotify.com/ep/1')
  })

  it('removes placeholder when field is missing', () => {
    const result = resolveVideoPlaceholders(
      'Ouça no Spotify: {{video.spotifyUrl}}',
      { title: 'Test' }
    )
    expect(result).toBe('Ouça no Spotify: ')
  })

  it('removes placeholder when field is empty string', () => {
    const result = resolveVideoPlaceholders(
      'Ouça no Spotify: {{video.spotifyUrl}}',
      { spotifyUrl: '' }
    )
    expect(result).toBe('Ouça no Spotify: ')
  })

  it('removes placeholder when field is null', () => {
    const result = resolveVideoPlaceholders(
      'Ouça: {{video.spotifyUrl}}',
      { spotifyUrl: null }
    )
    expect(result).toBe('Ouça: ')
  })

  it('returns template unchanged when no placeholders', () => {
    const footer = 'Siga nosso podcast nas redes sociais!'
    const result = resolveVideoPlaceholders(footer, { title: 'Test' })
    expect(result).toBe(footer)
  })

  it('handles numeric fields', () => {
    const result = resolveVideoPlaceholders(
      'Duração: {{video.duration}}s',
      { duration: 3600 }
    )
    expect(result).toBe('Duração: 3600s')
  })
})

describe('buildCompleteYouTubeDescription with footer placeholders', () => {
  it('resolves footer placeholders when video is provided', () => {
    const result = buildCompleteYouTubeDescription({
      description: 'Descrição do vídeo',
      youtubeFooter: 'Spotify: {{video.spotifyUrl}}',
      video: { spotifyUrl: 'https://open.spotify.com/ep/1' },
    })
    expect(result).toContain('Spotify: https://open.spotify.com/ep/1')
  })

  it('keeps raw footer when video is not provided', () => {
    const result = buildCompleteYouTubeDescription({
      description: 'Descrição',
      youtubeFooter: 'Spotify: {{video.spotifyUrl}}',
    })
    expect(result).toContain('Spotify: {{video.spotifyUrl}}')
  })

  it('omits footer section when all placeholders resolve to empty', () => {
    const result = buildCompleteYouTubeDescription({
      description: 'Descrição',
      youtubeFooter: '{{video.spotifyUrl}}',
      video: { spotifyUrl: '' },
    })
    expect(result).toBe('Descrição')
  })
})

describe('buildCompleteYouTubeDescription — Links section (Epic 26)', () => {
  it('appends only links flagged includeInDescription', () => {
    const result = buildCompleteYouTubeDescription({
      description: 'Descrição',
      links: [
        { url: 'https://incluso.com', description: 'Incluso', includeInDescription: true },
        { url: 'https://oculto.com', description: 'Oculto', includeInDescription: false },
      ],
    })
    expect(result).toContain('Links')
    expect(result).toContain('Incluso: https://incluso.com')
    expect(result).not.toContain('https://oculto.com')
  })

  it('omits the Links section when no link is flagged', () => {
    const result = buildCompleteYouTubeDescription({
      description: 'Descrição',
      links: [{ url: 'https://x.com', description: 'X', includeInDescription: false }],
    })
    expect(result).toBe('Descrição')
  })

  it('omits the Links section when links is empty or undefined', () => {
    expect(buildCompleteYouTubeDescription({ description: 'Só descrição', links: [] })).toBe('Só descrição')
    expect(buildCompleteYouTubeDescription({ description: 'Só descrição' })).toBe('Só descrição')
  })

  it('places Links after chapters and before the footer', () => {
    const result = buildCompleteYouTubeDescription({
      description: 'Descrição',
      chapters: [{ timestamp: '00:00', title: 'Intro' }],
      links: [{ url: 'https://l.com', description: 'L', includeInDescription: true }],
      youtubeFooter: 'Rodapé',
    })
    const chaptersIdx = result.indexOf('Intro')
    const linksIdx = result.indexOf('Links')
    const footerIdx = result.indexOf('Rodapé')
    expect(chaptersIdx).toBeLessThan(linksIdx)
    expect(linksIdx).toBeLessThan(footerIdx)
  })

  it('falls back to the bare URL when description is blank', () => {
    const result = buildCompleteYouTubeDescription({
      description: 'Descrição',
      links: [{ url: 'https://nodesc.com', description: ' ', includeInDescription: true }],
    })
    expect(result).toContain('https://nodesc.com')
    expect(result).not.toContain(' : https://nodesc.com')
  })
})
