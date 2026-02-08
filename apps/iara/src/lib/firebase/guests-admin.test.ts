/**
 * Unit tests for guests-admin.ts
 *
 * Tests podcast-scoped guest management functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => ({ _seconds: 1234567890, _nanoseconds: 0 })),
  },
  Timestamp: {
    now: vi.fn(() => ({ _seconds: 1234567890, _nanoseconds: 0 })),
  },
}))

// Create mock functions
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockUpdate = vi.fn()
const mockWhere = vi.fn()

// Create a proper nested mock structure for Firestore
const createMockDb = () => {
  const mockGuestDocRef = {
    id: 'auto-generated-id',
    get: mockGet,
    set: mockSet,
    update: mockUpdate,
  }

  const mockGuestsCollectionRef = {
    doc: vi.fn(() => mockGuestDocRef),
    where: mockWhere,
    get: vi.fn(),
  }

  const mockPodcastDocRef = {
    collection: vi.fn(() => mockGuestsCollectionRef),
  }

  const mockPodcastsCollectionRef = {
    doc: vi.fn(() => mockPodcastDocRef),
  }

  return {
    collection: vi.fn(() => mockPodcastsCollectionRef),
    _guestDocRef: mockGuestDocRef,
    _guestsCollectionRef: mockGuestsCollectionRef,
  }
}

let mockDb: ReturnType<typeof createMockDb>

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => mockDb),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks are set up
import {
  getGuestByLinkedInUrl,
  upsertGuest,
  getGuestsByPodcast,
} from './guests-admin'

describe('guests-admin', () => {
  const podcastId = 'pptnc'
  const linkedinUrl = 'https://www.linkedin.com/in/richardbranson'

  const mockGuestData = {
    url: linkedinUrl,
    name: 'Richard Branson',
    avatar: 'https://media.licdn.com/avatar.jpg',
    position: 'Founder at Virgin Group',
    currentCompanyName: 'Virgin Group',
    about: 'Entrepreneur',
    city: 'London',
    countryCode: 'GB',
    linkedinId: 'richardbranson',
    raw: { full: 'data' },
    scrapedAt: { toDate: () => new Date() },
    createdAt: { toDate: () => new Date() },
    updatedAt: { toDate: () => new Date() },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
  })

  describe('getGuestByLinkedInUrl', () => {
    it('returns guest when found by LinkedIn URL', async () => {
      const mockSnapshot = {
        empty: false,
        docs: [{ id: 'guest-123', data: () => mockGuestData }],
      }

      mockWhere.mockReturnValueOnce({
        limit: vi.fn().mockReturnValueOnce({
          get: vi.fn().mockResolvedValueOnce(mockSnapshot),
        }),
      })

      const result = await getGuestByLinkedInUrl(podcastId, linkedinUrl)

      expect(result).toBeDefined()
      expect(result?.id).toBe('guest-123')
      expect(result?.name).toBe('Richard Branson')
      expect(mockWhere).toHaveBeenCalledWith('url', '==', linkedinUrl)
    })

    it('returns null when guest not found', async () => {
      const mockSnapshot = {
        empty: true,
        docs: [],
      }

      mockWhere.mockReturnValueOnce({
        limit: vi.fn().mockReturnValueOnce({
          get: vi.fn().mockResolvedValueOnce(mockSnapshot),
        }),
      })

      const result = await getGuestByLinkedInUrl(podcastId, linkedinUrl)

      expect(result).toBeNull()
    })

    it('throws on Firestore error', async () => {
      mockWhere.mockReturnValueOnce({
        limit: vi.fn().mockReturnValueOnce({
          get: vi.fn().mockRejectedValueOnce(new Error('Firestore error')),
        }),
      })

      await expect(getGuestByLinkedInUrl(podcastId, linkedinUrl)).rejects.toThrow('Firestore error')
    })
  })

  describe('upsertGuest', () => {
    const createInput = {
      url: linkedinUrl,
      name: 'Richard Branson',
      avatar: 'https://media.licdn.com/avatar.jpg',
      position: 'Founder at Virgin Group',
      currentCompanyName: 'Virgin Group',
      about: 'Entrepreneur',
      city: 'London',
      countryCode: 'GB',
      linkedinId: 'richardbranson',
      raw: { full: 'data' },
    }

    it('creates new guest when not found', async () => {
      // getGuestByLinkedInUrl returns null (not found)
      mockWhere.mockReturnValueOnce({
        limit: vi.fn().mockReturnValueOnce({
          get: vi.fn().mockResolvedValueOnce({ empty: true, docs: [] }),
        }),
      })

      const result = await upsertGuest(podcastId, createInput)

      expect(result).toBe('auto-generated-id')
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          url: linkedinUrl,
          name: 'Richard Branson',
        })
      )
    })

    it('updates existing guest when found', async () => {
      // getGuestByLinkedInUrl returns existing guest
      mockWhere.mockReturnValueOnce({
        limit: vi.fn().mockReturnValueOnce({
          get: vi.fn().mockResolvedValueOnce({
            empty: false,
            docs: [{ id: 'existing-guest', data: () => mockGuestData }],
          }),
        }),
      })

      const result = await upsertGuest(podcastId, createInput)

      expect(result).toBe('existing-guest')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          url: linkedinUrl,
          name: 'Richard Branson',
        })
      )
    })

    it('rejects invalid data (missing url)', async () => {
      const invalidInput = { raw: { data: true } } as any

      await expect(upsertGuest(podcastId, invalidInput)).rejects.toThrow()
    })

    it('rejects invalid data (missing raw)', async () => {
      const invalidInput = { url: 'https://linkedin.com/in/test' } as any

      await expect(upsertGuest(podcastId, invalidInput)).rejects.toThrow()
    })

    it('rejects invalid URL format', async () => {
      const invalidInput = {
        url: 'not-a-url',
        raw: { data: true },
      } as any

      await expect(upsertGuest(podcastId, invalidInput)).rejects.toThrow()
    })
  })

  describe('getGuestsByPodcast', () => {
    it('returns all guests for podcast', async () => {
      const mockSnapshot = {
        empty: false,
        docs: [
          { id: 'guest-1', data: () => ({ ...mockGuestData, name: 'Guest 1' }) },
          { id: 'guest-2', data: () => ({ ...mockGuestData, name: 'Guest 2' }) },
        ],
      }

      mockDb._guestsCollectionRef.get.mockResolvedValueOnce(mockSnapshot)

      const result = await getGuestsByPodcast(podcastId)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('guest-1')
      expect(result[1].id).toBe('guest-2')
    })

    it('returns empty array when no guests', async () => {
      mockDb._guestsCollectionRef.get.mockResolvedValueOnce({
        empty: true,
        docs: [],
      })

      const result = await getGuestsByPodcast(podcastId)

      expect(result).toEqual([])
    })

    it('throws on Firestore error', async () => {
      mockDb._guestsCollectionRef.get.mockRejectedValueOnce(new Error('Firestore error'))

      await expect(getGuestsByPodcast(podcastId)).rejects.toThrow('Firestore error')
    })
  })
})
