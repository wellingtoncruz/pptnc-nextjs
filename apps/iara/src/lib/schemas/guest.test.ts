import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'

import {
  LinkedInGuestSchema,
  GuestDocSchema,
  GuestDocCreateSchema,
  GuestScrapeRequestSchema,
} from './guest'

describe('LinkedInGuestSchema', () => {
  it('validates a complete LinkedIn profile', () => {
    const profile = {
      name: 'Richard Branson',
      url: 'https://www.linkedin.com/in/richardbranson',
      avatar: 'https://media.licdn.com/avatar.jpg',
      position: 'Founder at Virgin Group',
      current_company_name: 'Virgin Group',
      about: 'Entrepreneur',
      city: 'London',
      country_code: 'GB',
      linkedin_id: 'richardbranson',
    }

    expect(LinkedInGuestSchema.parse(profile)).toEqual(profile)
  })

  it('validates a minimal profile with only some fields', () => {
    const profile = {
      name: 'John Doe',
    }

    const result = LinkedInGuestSchema.parse(profile)
    expect(result.name).toBe('John Doe')
    expect(result.url).toBeUndefined()
  })

  it('validates an empty object (all fields optional)', () => {
    expect(() => LinkedInGuestSchema.parse({})).not.toThrow()
  })

  it('rejects invalid URL', () => {
    const profile = {
      url: 'not-a-url',
    }

    expect(() => LinkedInGuestSchema.parse(profile)).toThrow()
  })

  it('rejects invalid avatar URL', () => {
    const profile = {
      avatar: 'not-a-url',
    }

    expect(() => LinkedInGuestSchema.parse(profile)).toThrow()
  })
})

describe('GuestDocSchema', () => {
  const now = Timestamp.now()

  it('validates a complete guest document', () => {
    const doc = {
      url: 'https://www.linkedin.com/in/richardbranson',
      name: 'Richard Branson',
      avatar: 'https://media.licdn.com/avatar.jpg',
      position: 'Founder',
      currentCompanyName: 'Virgin Group',
      about: 'Entrepreneur',
      city: 'London',
      countryCode: 'GB',
      linkedinId: 'richardbranson',
      photoPath: '/guests/abc123.jpg',
      raw: { full: 'data' },
      scrapedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    expect(() => GuestDocSchema.parse(doc)).not.toThrow()
  })

  it('requires url field', () => {
    const doc = {
      raw: {},
      scrapedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    expect(() => GuestDocSchema.parse(doc)).toThrow()
  })

  it('requires timestamps', () => {
    const doc = {
      url: 'https://www.linkedin.com/in/test',
      raw: {},
    }

    expect(() => GuestDocSchema.parse(doc)).toThrow()
  })
})

describe('GuestDocCreateSchema', () => {
  it('validates create input without timestamps', () => {
    const input = {
      url: 'https://www.linkedin.com/in/test',
      name: 'Test',
      raw: { data: true },
    }

    expect(() => GuestDocCreateSchema.parse(input)).not.toThrow()
  })

  it('requires url and raw fields', () => {
    expect(() => GuestDocCreateSchema.parse({})).toThrow()
    expect(() => GuestDocCreateSchema.parse({ url: 'https://example.com' })).toThrow()
  })
})

describe('GuestScrapeRequestSchema', () => {
  it('validates a valid request body', () => {
    expect(GuestScrapeRequestSchema.parse({ videoId: 'abc123' })).toEqual({
      videoId: 'abc123',
    })
  })

  it('rejects empty videoId', () => {
    expect(() => GuestScrapeRequestSchema.parse({ videoId: '' })).toThrow()
  })

  it('rejects missing videoId', () => {
    expect(() => GuestScrapeRequestSchema.parse({})).toThrow()
  })
})
