import { describe, it, expect } from 'vitest'

import {
  VideoSchema,
  VideoCreateSchema,
  VideoUpdateSchema,
  VideoTypeSchema,
  VideoStatusSchema,
  ChapterSchema,
  ComplianceSchema,
  ComplianceItemSchema,
  EditingIssueSchema,
  RiskAndComplianceItemSchema,
  VideoSummarySchema,
  ThumbnailsSchema,
  StatisticsSchema,
  GuestSchema,
  EpisodeContextFormSchema,
} from './video'

// Helper to create a valid Firestore-like Timestamp
function createMockTimestamp(): { toDate: () => Date } {
  return {
    toDate: () => new Date(),
  }
}

describe('VideoStatusSchema', () => {
  it('accepts valid status values', () => {
    const validStatuses = ['new', 'processing', 'draft', 'ready', 'sending', 'sent']
    validStatuses.forEach((status) => {
      expect(VideoStatusSchema.parse(status)).toBe(status)
    })
  })

  it('rejects invalid status values', () => {
    expect(() => VideoStatusSchema.parse('invalid')).toThrow()
    expect(() => VideoStatusSchema.parse('')).toThrow()
    expect(() => VideoStatusSchema.parse(123)).toThrow()
  })
})

describe('VideoTypeSchema', () => {
  it('accepts valid video types', () => {
    const validTypes = ['episode', 'cut', 'reel']
    validTypes.forEach((type) => {
      expect(VideoTypeSchema.parse(type)).toBe(type)
    })
  })

  it('rejects invalid video types', () => {
    expect(() => VideoTypeSchema.parse('invalid')).toThrow()
    expect(() => VideoTypeSchema.parse('short')).toThrow()
  })
})

describe('ChapterSchema', () => {
  it('accepts valid chapter with MM:SS timestamp', () => {
    const chapter = { timestamp: '00:00', title: 'Introduction' }
    expect(ChapterSchema.parse(chapter)).toEqual(chapter)
  })

  it('accepts valid chapter with HH:MM:SS timestamp', () => {
    const chapter = { timestamp: '01:30:00', title: 'Second Hour' }
    expect(ChapterSchema.parse(chapter)).toEqual(chapter)
  })

  it('rejects chapter with empty title', () => {
    expect(() => ChapterSchema.parse({ timestamp: '00:00', title: '' })).toThrow()
  })

  it('rejects chapter with empty timestamp', () => {
    expect(() => ChapterSchema.parse({ timestamp: '', title: 'Test' })).toThrow()
  })
})

describe('ComplianceItemSchema', () => {
  it('accepts valid compliance item', () => {
    const item = {
      risk: 'Potential copyright issue',
      argument: 'Music playing in background',
      timestamp: 120,
    }
    expect(ComplianceItemSchema.parse(item)).toEqual(item)
  })

  it('rejects item with missing fields', () => {
    expect(() => ComplianceItemSchema.parse({ risk: 'Test' })).toThrow()
    expect(() => ComplianceItemSchema.parse({ argument: 'Test' })).toThrow()
  })
})

describe('ComplianceSchema', () => {
  it('accepts compliance with ok status', () => {
    const compliance = { status: 'ok', items: [] }
    expect(ComplianceSchema.parse(compliance)).toEqual(compliance)
  })

  it('accepts compliance with warning status and items', () => {
    const compliance = {
      status: 'warning',
      items: [{ risk: 'Issue', argument: 'Details', timestamp: 60 }],
    }
    expect(ComplianceSchema.parse(compliance)).toEqual(compliance)
  })

  it('rejects invalid status', () => {
    expect(() => ComplianceSchema.parse({ status: 'error', items: [] })).toThrow()
  })
})

describe('EditingIssueSchema', () => {
  it('accepts valid editing issue', () => {
    const issue = {
      timestamp: '00:05:30',
      description: 'Corte abrupto na fala do entrevistado',
    }
    expect(EditingIssueSchema.parse(issue)).toEqual(issue)
  })

  it('rejects issue with empty timestamp', () => {
    expect(() => EditingIssueSchema.parse({ timestamp: '', description: 'Test' })).toThrow()
  })

  it('rejects issue with empty description', () => {
    expect(() => EditingIssueSchema.parse({ timestamp: '00:01:00', description: '' })).toThrow()
  })

  it('rejects issue with missing fields', () => {
    expect(() => EditingIssueSchema.parse({ timestamp: '00:01:00' })).toThrow()
    expect(() => EditingIssueSchema.parse({ description: 'Test' })).toThrow()
  })
})

describe('RiskAndComplianceItemSchema', () => {
  it('accepts valid risk item', () => {
    const item = {
      timestamp: '00:12:45',
      risk: 'Menção de marca',
      description: 'Menção positiva da marca XYZ sem divulgação de patrocínio',
    }
    expect(RiskAndComplianceItemSchema.parse(item)).toEqual(item)
  })

  it('rejects item with empty timestamp', () => {
    expect(() =>
      RiskAndComplianceItemSchema.parse({ timestamp: '', risk: 'Test', description: 'Test' })
    ).toThrow()
  })

  it('rejects item with empty risk', () => {
    expect(() =>
      RiskAndComplianceItemSchema.parse({ timestamp: '00:01:00', risk: '', description: 'Test' })
    ).toThrow()
  })

  it('rejects item with empty description', () => {
    expect(() =>
      RiskAndComplianceItemSchema.parse({ timestamp: '00:01:00', risk: 'Test', description: '' })
    ).toThrow()
  })

  it('rejects item with missing fields', () => {
    expect(() => RiskAndComplianceItemSchema.parse({ timestamp: '00:01:00' })).toThrow()
    expect(() => RiskAndComplianceItemSchema.parse({ risk: 'Test' })).toThrow()
  })
})

describe('ThumbnailsSchema', () => {
  it('accepts empty thumbnails object', () => {
    expect(ThumbnailsSchema.parse({})).toEqual({})
  })

  it('accepts partial thumbnails', () => {
    const partial = {
      high: { url: 'https://example.com/high.jpg', width: 480, height: 360 },
    }
    expect(ThumbnailsSchema.parse(partial)).toEqual(partial)
  })

  it('accepts complete thumbnails', () => {
    const complete = {
      default: { url: 'https://example.com/default.jpg', width: 120, height: 90 },
      medium: { url: 'https://example.com/medium.jpg', width: 320, height: 180 },
      high: { url: 'https://example.com/high.jpg', width: 480, height: 360 },
      standard: { url: 'https://example.com/standard.jpg', width: 640, height: 480 },
      maxres: { url: 'https://example.com/maxres.jpg', width: 1280, height: 720 },
    }
    const result = ThumbnailsSchema.parse(complete)
    expect(result.maxres?.url).toBe('https://example.com/maxres.jpg')
  })

  it('accepts thumbnails without dimensions', () => {
    const noDimensions = {
      high: { url: 'https://example.com/high.jpg' },
    }
    expect(ThumbnailsSchema.parse(noDimensions).high?.url).toBe('https://example.com/high.jpg')
  })
})

describe('StatisticsSchema', () => {
  it('accepts statistics with numbers', () => {
    const stats = { viewCount: 1000, likeCount: 50, commentCount: 10 }
    expect(StatisticsSchema.parse(stats)).toEqual(stats)
  })

  it('accepts statistics with strings (YouTube API sometimes returns strings)', () => {
    const stats = { viewCount: '1000', likeCount: '50', commentCount: '10' }
    expect(StatisticsSchema.parse(stats)).toEqual(stats)
  })

  it('accepts partial statistics', () => {
    const partial = { viewCount: 1000 }
    expect(StatisticsSchema.parse(partial)).toEqual(partial)
  })

  it('accepts empty statistics', () => {
    expect(StatisticsSchema.parse({})).toEqual({})
  })
})

describe('VideoSchema (flat structure)', () => {
  const validVideo = {
    id: 'dQw4w9WgXcQ',
    podcastId: 'pptnc',
    title: 'Test Video',
    description: 'A test video description',
    thumbnails: {
      high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
    },
    duration: 1200,
    publishedAt: createMockTimestamp(),
    status: 'new',
    videoType: 'episode',
    deleted: false,
  }

  it('accepts valid video with flat YouTube fields', () => {
    const result = VideoSchema.parse(validVideo)
    expect(result.id).toBe('dQw4w9WgXcQ')
    expect(result.title).toBe('Test Video')
    expect(result.status).toBe('new')
    expect(result.videoType).toBe('episode')
  })

  it('accepts video with IAra AI-generated fields', () => {
    const videoWithAIFields = {
      ...validVideo,
      tags: ['tag1', 'tag2'],
      chapters: [{ timestamp: '00:00', title: 'Intro' }],
      compliance: { status: 'ok', items: [] },
    }
    const result = VideoSchema.parse(videoWithAIFields)
    expect(result.tags).toEqual(['tag1', 'tag2'])
    expect(result.chapters).toHaveLength(1)
  })

  it('accepts video with Phase 2 and Phase 3 fields (editingIssues, riskAndCompliance)', () => {
    const videoWithPhase2And3 = {
      ...validVideo,
      critique: 'Excelente episódio com discussão profunda sobre tecnologia.',
      editingIssues: [
        { timestamp: '00:05:30', description: 'Corte abrupto na fala' },
        { timestamp: '00:12:00', description: 'Silêncio prolongado' },
      ],
      riskAndCompliance: [
        { timestamp: '00:20:00', risk: 'Menção de marca', description: 'Menção positiva da marca XYZ' },
      ],
    }
    const result = VideoSchema.parse(videoWithPhase2And3)
    expect(result.critique).toBe('Excelente episódio com discussão profunda sobre tecnologia.')
    expect(result.editingIssues).toHaveLength(2)
    expect(result.riskAndCompliance).toHaveLength(1)
    expect(result.riskAndCompliance?.[0]?.risk).toBe('Menção de marca')
  })

  it('accepts video with portal-web specific fields', () => {
    const videoWithPortalFields = {
      ...validVideo,
      transcriptionSRT: '1\n00:00:00,000 --> 00:00:05,000\nHello',
      transcriptionTXT: 'Hello world',
      guests: [{ name: 'Guest 1', role: 'CEO', company: 'TechCorp', linkedin: 'https://linkedin.com/in/guest1' }],
      topics: ['Topic A'],
      statistics: { viewCount: 1000 },
    }
    const result = VideoSchema.parse(videoWithPortalFields)
    expect(result.transcriptionTXT).toBe('Hello world')
    expect(result.guests?.[0]?.name).toBe('Guest 1')
  })

  it('accepts video without deleted field (legacy compat)', () => {
    const videoWithoutDeleted = { ...validVideo }
    delete (videoWithoutDeleted as Record<string, unknown>).deleted
    const result = VideoSchema.parse(videoWithoutDeleted)
    // deleted field removed from schema for legacy compatibility
    expect(result).not.toHaveProperty('deleted')
  })

  it('accepts video without timestamps (legacy docs)', () => {
    const videoWithoutTimestamps = { ...validVideo }
    // createdAt and updatedAt are optional for legacy docs
    const result = VideoSchema.parse(videoWithoutTimestamps)
    expect(result.id).toBe('dQw4w9WgXcQ')
  })

  it('rejects video without id', () => {
    const { id: _id, ...videoWithoutId } = validVideo
    expect(() => VideoSchema.parse(videoWithoutId)).toThrow()
  })

  it('accepts video without podcastId (legacy compat)', () => {
    const { podcastId: _podcastId, ...videoWithoutPodcastId } = validVideo
    // podcastId is optional for legacy videos from portal-web
    const result = VideoSchema.parse(videoWithoutPodcastId)
    expect(result.podcastId).toBeUndefined()
  })

  it('rejects video without title', () => {
    const { title: _title, ...videoWithoutTitle } = validVideo
    expect(() => VideoSchema.parse(videoWithoutTitle)).toThrow()
  })

  it('rejects video with invalid status', () => {
    const invalidVideo = { ...validVideo, status: 'invalid' }
    expect(() => VideoSchema.parse(invalidVideo)).toThrow()
  })

  it('rejects video with invalid videoType', () => {
    const invalidVideo = { ...validVideo, videoType: 'invalid' }
    expect(() => VideoSchema.parse(invalidVideo)).toThrow()
  })

  it('passes through unknown fields (passthrough)', () => {
    const videoWithCustomFields = {
      ...validVideo,
      customField: 'custom value',
      legacyField: 123,
    }
    const result = VideoSchema.parse(videoWithCustomFields)
    expect((result as Record<string, unknown>).customField).toBe('custom value')
    expect((result as Record<string, unknown>).legacyField).toBe(123)
  })
})

describe('VideoCreateSchema', () => {
  const validVideoCreate = {
    id: 'abc123',
    podcastId: 'pptnc',
    title: 'Test Video',
    description: 'Description',
    thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
    duration: 600,
    publishedAt: createMockTimestamp(),
    status: 'new',
    videoType: 'cut',
    youtubePrivacyStatus: 'public',
  }

  it('accepts valid video create input', () => {
    const result = VideoCreateSchema.parse(validVideoCreate)
    expect(result.id).toBe('abc123')
    expect(result.title).toBe('Test Video')
    expect(result.status).toBe('new')
    expect(result.youtubePrivacyStatus).toBe('public')
  })

  it('accepts all privacy status values', () => {
    const statuses = ['public', 'unlisted', 'private'] as const
    for (const privacyStatus of statuses) {
      const result = VideoCreateSchema.parse({ ...validVideoCreate, youtubePrivacyStatus: privacyStatus })
      expect(result.youtubePrivacyStatus).toBe(privacyStatus)
    }
  })
})

describe('VideoUpdateSchema', () => {
  it('accepts partial update with status only', () => {
    const result = VideoUpdateSchema.parse({ status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('accepts partial update with title', () => {
    const result = VideoUpdateSchema.parse({ title: 'Updated Title' })
    expect(result.title).toBe('Updated Title')
  })

  it('accepts partial update with AI-generated fields', () => {
    const result = VideoUpdateSchema.parse({
      tags: ['tag1', 'tag2'],
      chapters: [{ timestamp: '00:00', title: 'Intro' }],
    })
    expect(result.tags).toEqual(['tag1', 'tag2'])
    expect(result.chapters).toHaveLength(1)
  })

  it('accepts partial update with Phase 2 and Phase 3 fields', () => {
    const result = VideoUpdateSchema.parse({
      editingIssues: [{ timestamp: '00:05:30', description: 'Corte abrupto' }],
      riskAndCompliance: [{ timestamp: '00:20:00', risk: 'Linguagem', description: 'Linguagem informal' }],
    })
    expect(result.editingIssues).toHaveLength(1)
    expect(result.riskAndCompliance).toHaveLength(1)
  })

  it('accepts empty arrays for editingIssues and riskAndCompliance', () => {
    const result = VideoUpdateSchema.parse({
      editingIssues: [],
      riskAndCompliance: [],
    })
    expect(result.editingIssues).toEqual([])
    expect(result.riskAndCompliance).toEqual([])
  })

  it('rejects invalid editingIssues items', () => {
    expect(() =>
      VideoUpdateSchema.parse({
        editingIssues: [{ timestamp: '', description: 'Test' }],
      })
    ).toThrow()
    expect(() =>
      VideoUpdateSchema.parse({
        editingIssues: [{ timestamp: '00:01:00', description: '' }],
      })
    ).toThrow()
  })

  it('rejects invalid riskAndCompliance items', () => {
    expect(() =>
      VideoUpdateSchema.parse({
        riskAndCompliance: [{ timestamp: '', risk: 'Test', description: 'Test' }],
      })
    ).toThrow()
    expect(() =>
      VideoUpdateSchema.parse({
        riskAndCompliance: [{ timestamp: '00:01:00', risk: '', description: 'Test' }],
      })
    ).toThrow()
  })

  it('accepts empty update', () => {
    const result = VideoUpdateSchema.parse({})
    expect(result).toEqual({})
  })

  it('rejects id in update (immutable field)', () => {
    // VideoUpdateSchema excludes id, so it should be stripped
    const input = { id: 'new-id', status: 'draft' }
    const result = VideoUpdateSchema.parse(input)
    expect(result).not.toHaveProperty('id')
  })

  it('rejects podcastId in update (immutable field)', () => {
    const input = { podcastId: 'new-podcast', status: 'draft' }
    const result = VideoUpdateSchema.parse(input)
    expect(result).not.toHaveProperty('podcastId')
  })
})

describe('VideoSummarySchema', () => {
  const validSummary = {
    id: 'abc123',
    title: 'Test Video',
    thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
    duration: 600,
    status: 'new',
    videoType: 'cut',
  }

  it('accepts valid video summary', () => {
    const result = VideoSummarySchema.parse(validSummary)
    expect(result.id).toBe('abc123')
    expect(result.title).toBe('Test Video')
  })

  it('accepts summary without thumbnails (optional)', () => {
    const withoutThumbnails = { ...validSummary }
    delete (withoutThumbnails as Record<string, unknown>).thumbnails
    const result = VideoSummarySchema.parse(withoutThumbnails)
    expect(result.thumbnails).toBeUndefined()
  })

  it('rejects summary with missing required fields', () => {
    const { title: _title, ...withoutTitle } = validSummary
    expect(() => VideoSummarySchema.parse(withoutTitle)).toThrow()
  })
})

describe('GuestSchema (legacy compatible)', () => {
  const validGuest = {
    name: 'João Silva',
    role: 'CEO',
    company: 'TechCorp',
    linkedin: 'https://linkedin.com/in/joaosilva',
  }

  it('accepts valid guest with all fields', () => {
    const result = GuestSchema.parse(validGuest)
    expect(result.name).toBe('João Silva')
    expect(result.role).toBe('CEO')
    expect(result.company).toBe('TechCorp')
    expect(result.linkedin).toBe('https://linkedin.com/in/joaosilva')
  })

  it('accepts guest with optional photo field', () => {
    const guestWithPhoto = { ...validGuest, photo: 'joao-silva.jpg' }
    const result = GuestSchema.parse(guestWithPhoto)
    expect(result.photo).toBe('joao-silva.jpg')
  })

  it('rejects guest with empty name', () => {
    expect(() => GuestSchema.parse({ ...validGuest, name: '' })).toThrow()
  })

  it('rejects guest with empty role', () => {
    expect(() => GuestSchema.parse({ ...validGuest, role: '' })).toThrow()
  })

  it('accepts guest with empty company (optional field)', () => {
    // company is optional, so empty string is valid
    const result = GuestSchema.parse({ ...validGuest, company: '' })
    expect(result.company).toBe('')
  })

  it('accepts guest without company field', () => {
    const { company: _company, ...guestWithoutCompany } = validGuest
    const result = GuestSchema.parse(guestWithoutCompany)
    expect(result.company).toBeUndefined()
  })

  it('rejects guest with invalid URL', () => {
    expect(() => GuestSchema.parse({ ...validGuest, linkedin: 'not-a-url' })).toThrow()
  })

  it('accepts guest with any valid URL (not just LinkedIn)', () => {
    const result = GuestSchema.parse({ ...validGuest, linkedin: 'https://example.com/profile' })
    expect(result.linkedin).toBe('https://example.com/profile')
  })
})

describe('EpisodeContextFormSchema (UI form validation)', () => {
  const validGuest = {
    name: 'Guest Name',
    role: 'CTO',
    company: 'StartupX',
    linkedin: 'https://linkedin.com/in/guest',
  }

  const validCoHost = {
    name: 'Co-Host Name',
    role: 'Host',
    company: 'Podcast Inc',
    linkedin: 'https://linkedin.com/in/cohost',
  }

  it('accepts form context with theme and one guest', () => {
    const result = EpisodeContextFormSchema.parse({
      theme: 'Inovação em Tecnologia',
      hasCoHost: false,
      guests: [validGuest],
    })
    expect(result.theme).toBe('Inovação em Tecnologia')
    expect(result.guests).toHaveLength(1)
    expect(result.hasCoHost).toBe(false)
  })

  it('accepts form context with theme, co-host and guests', () => {
    const result = EpisodeContextFormSchema.parse({
      theme: 'Empreendedorismo',
      hasCoHost: true,
      coHost: validCoHost,
      guests: [validGuest],
    })
    expect(result.coHost?.name).toBe('Co-Host Name')
    expect(result.guests).toHaveLength(1)
    expect(result.hasCoHost).toBe(true)
  })

  it('accepts form context with up to 3 guests', () => {
    const guests = [
      { ...validGuest, name: 'Guest 1' },
      { ...validGuest, name: 'Guest 2' },
      { ...validGuest, name: 'Guest 3' },
    ]
    const result = EpisodeContextFormSchema.parse({
      theme: 'Panel Discussion',
      hasCoHost: false,
      guests,
    })
    expect(result.guests).toHaveLength(3)
  })

  it('rejects form context with more than 3 guests', () => {
    const guests = [
      { ...validGuest, name: 'Guest 1' },
      { ...validGuest, name: 'Guest 2' },
      { ...validGuest, name: 'Guest 3' },
      { ...validGuest, name: 'Guest 4' },
    ]
    expect(() =>
      EpisodeContextFormSchema.parse({
        theme: 'Too many guests',
        hasCoHost: false,
        guests,
      })
    ).toThrow()
  })

  it('rejects form context with no guests', () => {
    expect(() =>
      EpisodeContextFormSchema.parse({
        theme: 'No guests',
        hasCoHost: false,
        guests: [],
      })
    ).toThrow()
  })

  it('rejects form context with empty theme', () => {
    expect(() =>
      EpisodeContextFormSchema.parse({
        theme: '',
        hasCoHost: false,
        guests: [validGuest],
      })
    ).toThrow()
  })

  it('rejects form context without theme', () => {
    expect(() =>
      EpisodeContextFormSchema.parse({
        hasCoHost: false,
        guests: [validGuest],
      })
    ).toThrow()
  })
})
