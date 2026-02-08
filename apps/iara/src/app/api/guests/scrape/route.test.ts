/**
 * Unit tests for POST /api/guests/scrape route handler.
 *
 * Tests LinkedIn guest profile scraping flow including:
 * auth, validation, scrape, upsert, avatar download, video update.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: vi.fn(),
  updateVideoAdmin: vi.fn(),
}))

vi.mock('@/lib/firebase/guests-admin', () => ({
  upsertGuest: vi.fn(),
}))

vi.mock('@/lib/brightdata', () => ({
  scrapeLinkedInProfile: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Mock fs/promises for avatar download
vi.mock(import('fs/promises'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual, writeFile: vi.fn(), mkdir: vi.fn() },
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  }
})

// Mock crypto for MD5 hash
vi.mock(import('crypto'), async (importOriginal) => {
  const actual = await importOriginal()
  const mockCreateHash = vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => 'abc123hash'),
    })),
  }))
  return {
    ...actual,
    default: { ...actual, createHash: mockCreateHash },
    createHash: mockCreateHash,
  }
})

import { POST } from './route'
import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { upsertGuest } from '@/lib/firebase/guests-admin'
import { scrapeLinkedInProfile } from '@/lib/brightdata'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockUpdateVideoAdmin = vi.mocked(updateVideoAdmin)
const mockUpsertGuest = vi.mocked(upsertGuest)
const mockScrapeLinkedInProfile = vi.mocked(scrapeLinkedInProfile)

// Helper to create a mock POST request
function createRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/guests/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Mock video with guests
const mockEpisodeVideo = {
  id: 'video-123',
  videoType: 'episode',
  guests: [
    {
      name: 'Richard Branson',
      role: 'CEO',
      company: 'Virgin',
      linkedin: 'https://www.linkedin.com/in/richardbranson',
    },
    {
      name: 'Jane Doe',
      role: 'CTO',
      company: 'TechCo',
      linkedin: 'https://www.linkedin.com/in/janedoe',
    },
  ],
}

const mockBrightDataProfile = {
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

describe('POST /api/guests/scrape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: authenticated session
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)

    // Mock global fetch for avatar download
    vi.stubGlobal('fetch', vi.fn())
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })
  })

  describe('Validation', () => {
    it('returns 400 when videoId is missing', async () => {
      const response = await POST(createRequest({}))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when videoId is empty', async () => {
      const response = await POST(createRequest({ videoId: '' }))

      expect(response.status).toBe(400)
    })

    it('returns 404 when video does not exist', async () => {
      mockGetVideoAdmin.mockResolvedValue(null)

      const response = await POST(createRequest({ videoId: 'non-existent' }))

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json.error.code).toBe('NOT_FOUND')
    })
  })

  describe('Video type filtering (AC5)', () => {
    it('skips scraping for cut videos', async () => {
      mockGetVideoAdmin.mockResolvedValue({ id: 'v1', videoType: 'cut' } as never)

      const response = await POST(createRequest({ videoId: 'v1' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(0)
      expect(mockScrapeLinkedInProfile).not.toHaveBeenCalled()
    })

    it('skips scraping for reel videos', async () => {
      mockGetVideoAdmin.mockResolvedValue({ id: 'v1', videoType: 'reel' } as never)

      const response = await POST(createRequest({ videoId: 'v1' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(0)
    })

  })

  describe('Guests without LinkedIn', () => {
    it('returns scrapedCount 0 when no guests', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'v1',
        videoType: 'episode',
        guests: [],
      } as never)

      const response = await POST(createRequest({ videoId: 'v1' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(0)
    })

    it('returns scrapedCount 0 when guests have no LinkedIn URL', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'v1',
        videoType: 'episode',
        guests: [{ name: 'John', role: 'Dev', company: 'X' }],
      } as never)

      const response = await POST(createRequest({ videoId: 'v1' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(0)
    })

    it('returns scrapedCount 0 when guests array is undefined', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'v1',
        videoType: 'episode',
      } as never)

      const response = await POST(createRequest({ videoId: 'v1' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(0)
    })
  })

  describe('Successful scraping', () => {
    it('scrapes and upserts guest profile', async () => {
      mockGetVideoAdmin.mockResolvedValue(mockEpisodeVideo as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      // Mock avatar fetch: return small buffer (below threshold, no photo saved)
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(500)),
      } as any)

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(2)
      expect(json.data.errorCount).toBe(0)
      expect(mockScrapeLinkedInProfile).toHaveBeenCalledTimes(2)
      expect(mockUpsertGuest).toHaveBeenCalledTimes(2)
    })

    it('upserts guest with correct mapped fields', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as any)

      await POST(createRequest({ videoId: 'video-123' }))

      expect(mockUpsertGuest).toHaveBeenCalledWith(
        'test-podcast',
        expect.objectContaining({
          url: 'https://www.linkedin.com/in/richardbranson',
          name: 'Richard Branson',
          position: 'Founder at Virgin Group',
          currentCompanyName: 'Virgin Group',
          about: 'Entrepreneur',
          city: 'London',
          countryCode: 'GB',
          linkedinId: 'richardbranson',
        })
      )
    })

    it('updates video guests array with photo path when avatar downloaded', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      mockUpdateVideoAdmin.mockResolvedValue(undefined)

      // Mock avatar fetch: return large enough buffer
      const largeBuffer = new ArrayBuffer(5000)
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(largeBuffer),
      } as any)

      await POST(createRequest({ videoId: 'video-123' }))

      // Verify video guests array updated with photo
      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith(
        'test-podcast',
        'video-123',
        expect.objectContaining({
          guests: expect.arrayContaining([
            expect.objectContaining({
              photo: '/guests/abc123hash.jpg',
            }),
          ]),
        })
      )

      // Verify guest subcollection also receives photoPath
      expect(mockUpsertGuest).toHaveBeenCalledWith(
        'test-podcast',
        expect.objectContaining({
          photoPath: '/guests/abc123hash.jpg',
        })
      )
    })

    it('does not update video when no avatars were downloaded', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      // Profile without avatar
      mockScrapeLinkedInProfile.mockResolvedValue({
        ...mockBrightDataProfile,
        avatar: undefined,
      })
      mockUpsertGuest.mockResolvedValue('guest-doc-id')

      await POST(createRequest({ videoId: 'video-123' }))

      // updateVideoAdmin should NOT be called since no photos were added
      expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('counts errors when scrape fails for some guests', async () => {
      mockGetVideoAdmin.mockResolvedValue(mockEpisodeVideo as never)
      // First guest: success, second guest: failure
      mockScrapeLinkedInProfile
        .mockResolvedValueOnce(mockBrightDataProfile)
        .mockResolvedValueOnce(null)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as any)

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(1)
      expect(json.data.errorCount).toBe(1)
    })

    it('returns 500 on unexpected error', async () => {
      mockGetVideoAdmin.mockRejectedValue(new Error('Firestore error'))

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })

    it('still upserts guest without photoPath when avatar download fails', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')

      // Avatar download fails
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as any)

      await POST(createRequest({ videoId: 'video-123' }))

      // upsertGuest called without photoPath
      expect(mockUpsertGuest).toHaveBeenCalledWith(
        'test-podcast',
        expect.not.objectContaining({ photoPath: expect.anything() })
      )
    })

    it('handles avatar download timeout gracefully', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')

      // Avatar download throws AbortError (timeout)
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      vi.mocked(fetch).mockRejectedValue(abortError)

      const response = await POST(createRequest({ videoId: 'video-123' }))

      // Should succeed overall — avatar timeout doesn't block scrape
      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(1)
      expect(mockUpsertGuest).toHaveBeenCalled()
      expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
    })

    it('does not overwrite existing guest name/role/company on video', async () => {
      const videoWithExistingData = {
        id: 'video-123',
        videoType: 'episode',
        guests: [
          {
            name: 'Custom Name',
            role: 'Custom Role',
            company: 'Custom Company',
            linkedin: 'https://www.linkedin.com/in/richardbranson',
          },
        ],
      }
      mockGetVideoAdmin.mockResolvedValue(videoWithExistingData as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      mockUpdateVideoAdmin.mockResolvedValue(undefined)

      const largeBuffer = new ArrayBuffer(5000)
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(largeBuffer),
      } as any)

      await POST(createRequest({ videoId: 'video-123' }))

      // Verify that name, role, company are preserved
      const updateCall = mockUpdateVideoAdmin.mock.calls[0]
      const updatedGuests = updateCall[2].guests
      expect(updatedGuests[0].name).toBe('Custom Name')
      expect(updatedGuests[0].role).toBe('Custom Role')
      expect(updatedGuests[0].company).toBe('Custom Company')
      // Only photo should be added
      expect(updatedGuests[0].photo).toBe('/guests/abc123hash.jpg')
    })
  })
})
