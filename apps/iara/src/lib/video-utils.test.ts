import { describe, it, expect } from 'vitest'

import {
  classifyVideoType,
  parseYouTubeDuration,
  getBestThumbnailUrl,
  inferVideoType,
  needsIaraFields,
} from './video-utils'
import { DEFAULT_VIDEO_TYPES } from '@/lib/schemas/podcast'

describe('parseYouTubeDuration', () => {
  it.each([
    ['PT1H2M3S', 3723],
    ['PT5M', 300],
    ['PT30S', 30],
    ['PT1H', 3600],
    ['PT1H30M', 5400],
    ['PT2H', 7200],
    ['PT1M30S', 90],
    ['PT0S', 0],
  ])('parses %s to %d seconds', (input, expected) => {
    expect(parseYouTubeDuration(input)).toBe(expected)
  })

  it('returns 0 for P0D format (livestream)', () => {
    expect(parseYouTubeDuration('P0D')).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseYouTubeDuration('')).toBe(0)
  })

  it('returns 0 for invalid format', () => {
    expect(parseYouTubeDuration('invalid')).toBe(0)
  })

  it('returns 0 for null-like strings', () => {
    expect(parseYouTubeDuration('P')).toBe(0)
    expect(parseYouTubeDuration('T')).toBe(0)
  })
})

describe('classifyVideoType', () => {
  const config = DEFAULT_VIDEO_TYPES

  describe('with DEFAULT_VIDEO_TYPES (episode: 1200s, cut: 180s, reel: 0s)', () => {
    it.each([
      [1200, 'episode'], // exactly minDuration for episode
      [3600, 'episode'], // 1 hour
      [7200, 'episode'], // 2 hours
      [1201, 'episode'], // just above episode threshold
    ])('classifies %d seconds as %s (episode range)', (duration, expected) => {
      expect(classifyVideoType(duration, config)).toBe(expected)
    })

    it.each([
      [180, 'cut'], // exactly minDuration for cut
      [600, 'cut'], // 10 minutes
      [1199, 'cut'], // just below episode threshold
      [181, 'cut'], // just above cut threshold
    ])('classifies %d seconds as %s (cut range)', (duration, expected) => {
      expect(classifyVideoType(duration, config)).toBe(expected)
    })

    it.each([
      [0, 'reel'], // edge case: 0 seconds
      [60, 'reel'], // 1 minute
      [179, 'reel'], // just below cut threshold
      [1, 'reel'], // minimal duration
    ])('classifies %d seconds as %s (reel range)', (duration, expected) => {
      expect(classifyVideoType(duration, config)).toBe(expected)
    })
  })

  describe('with custom configuration', () => {
    const customConfig = {
      episode: { minDuration: 600, maxDuration: null },
      cut: { minDuration: 120, maxDuration: 599 },
      reel: { minDuration: 0, maxDuration: 119 },
    }

    it('classifies based on custom thresholds', () => {
      expect(classifyVideoType(600, customConfig)).toBe('episode')
      expect(classifyVideoType(599, customConfig)).toBe('cut')
      expect(classifyVideoType(120, customConfig)).toBe('cut')
      expect(classifyVideoType(119, customConfig)).toBe('reel')
    })
  })
})

// ============================================================================
// THUMBNAIL UTILITIES
// ============================================================================

describe('getBestThumbnailUrl', () => {
  it('prefers maxres > standard > high > medium > default', () => {
    const allThumbs = {
      default: { url: 'default.jpg' },
      medium: { url: 'medium.jpg' },
      high: { url: 'high.jpg' },
      standard: { url: 'standard.jpg' },
      maxres: { url: 'maxres.jpg' },
    }
    expect(getBestThumbnailUrl(allThumbs)).toBe('maxres.jpg')

    const noMaxres = { ...allThumbs, maxres: undefined }
    expect(getBestThumbnailUrl(noMaxres)).toBe('standard.jpg')

    const noStandard = { ...noMaxres, standard: undefined }
    expect(getBestThumbnailUrl(noStandard)).toBe('high.jpg')

    const noHigh = { ...noStandard, high: undefined }
    expect(getBestThumbnailUrl(noHigh)).toBe('medium.jpg')

    const onlyDefault = { default: { url: 'default.jpg' } }
    expect(getBestThumbnailUrl(onlyDefault)).toBe('default.jpg')
  })

  it('returns empty string for undefined thumbnails', () => {
    expect(getBestThumbnailUrl(undefined)).toBe('')
  })

  it('returns empty string for empty thumbnails object', () => {
    expect(getBestThumbnailUrl({})).toBe('')
  })
})

// ============================================================================
// VIDEO TYPE INFERENCE
// ============================================================================

describe('inferVideoType', () => {
  it('infers episode for duration >= 1200s', () => {
    expect(inferVideoType(1200)).toBe('episode')
    expect(inferVideoType(3600)).toBe('episode')
  })

  it('infers cut for duration >= 180s and < 1200s', () => {
    expect(inferVideoType(180)).toBe('cut')
    expect(inferVideoType(600)).toBe('cut')
    expect(inferVideoType(1199)).toBe('cut')
  })

  it('infers reel for duration < 180s', () => {
    expect(inferVideoType(0)).toBe('reel')
    expect(inferVideoType(60)).toBe('reel')
    expect(inferVideoType(179)).toBe('reel')
  })

  it('returns reel for undefined duration', () => {
    expect(inferVideoType(undefined)).toBe('reel')
  })
})

// ============================================================================
// DOCUMENT ENRICHMENT DETECTION
// ============================================================================

describe('needsIaraFields', () => {
  it('returns true when status is missing', () => {
    const doc = {
      title: 'Test Video',
      duration: 600,
      videoType: 'cut',
    }
    expect(needsIaraFields(doc)).toBe(true)
  })

  it('returns true when videoType is missing', () => {
    const doc = {
      title: 'Test Video',
      duration: 600,
      status: 'new',
    }
    expect(needsIaraFields(doc)).toBe(true)
  })

  it('returns true when both status and videoType are missing', () => {
    const doc = {
      title: 'Test Video',
      duration: 600,
    }
    expect(needsIaraFields(doc)).toBe(true)
  })

  it('returns false when both status and videoType are present', () => {
    const doc = {
      title: 'Test Video',
      duration: 600,
      status: 'draft',
      videoType: 'cut',
    }
    expect(needsIaraFields(doc)).toBe(false)
  })

  it('returns true for empty object', () => {
    expect(needsIaraFields({})).toBe(true)
  })
})
