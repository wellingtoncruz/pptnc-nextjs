/**
 * Unit tests for POST /api/guests/scrape route handler.
 *
 * Tests LinkedIn guest profile scraping flow including:
 * auth, validation, scrape, upsert, avatar upload to Cloud Storage, video update.
 *
 * Story 24.2 — Avatar now goes to Cloud Storage, not filesystem.
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

vi.mock('@/lib/firebase/cloud-storage', () => ({
  uploadGuestAvatar: vi.fn(),
  CloudStorageError: class CloudStorageError extends Error {
    constructor(message: string, public readonly code: string) {
      super(message)
    }
  },
}))

// vi.hoisted ensures the shared class survives the hoisting of vi.mock.
const { FakeBrightDataConfigError } = vi.hoisted(() => {
  class FakeBrightDataConfigError extends Error {
    public readonly code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'BrightDataConfigError'
      this.code = code
    }
  }
  return { FakeBrightDataConfigError }
})

vi.mock('@/lib/brightdata', () => ({
  scrapeLinkedInProfile: vi.fn(),
  BrightDataConfigError: FakeBrightDataConfigError,
}))

vi.mock('@/lib/brightdata/client', () => ({
  scrapeLinkedInProfile: vi.fn(),
  BrightDataConfigError: FakeBrightDataConfigError,
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { POST } from './route'
import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { upsertGuest } from '@/lib/firebase/guests-admin'
import { uploadGuestAvatar } from '@/lib/firebase/cloud-storage'
import { scrapeLinkedInProfile } from '@/lib/brightdata'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockUpdateVideoAdmin = vi.mocked(updateVideoAdmin)
const mockUpsertGuest = vi.mocked(upsertGuest)
const mockUploadGuestAvatar = vi.mocked(uploadGuestAvatar)
const mockScrapeLinkedInProfile = vi.mocked(scrapeLinkedInProfile)

// Helper to create a mock POST request
function createRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/guests/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Builds a buffer that detectAvatarMime will classify as image/jpeg. */
function jpegBuffer(size: number): ArrayBuffer {
  const buf = new Uint8Array(size)
  buf[0] = 0xff
  buf[1] = 0xd8
  return buf.buffer
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
  linkedin_num_id: '12345678',
}

describe('POST /api/guests/scrape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)

    vi.stubGlobal('fetch', vi.fn())

    // Default: GCS upload returns a predictable path
    mockUploadGuestAvatar.mockResolvedValue({
      filePath: 'guest-avatars/test-podcast/12345678-1716000000000.jpg',
      mimeType: 'image/jpeg',
    })
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
    it('scrapes and upserts guest profile (small avatar buffer below threshold)', async () => {
      mockGetVideoAdmin.mockResolvedValue(mockEpisodeVideo as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(jpegBuffer(500)),
      } as never)

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(2)
      expect(json.data.errorCount).toBe(0)
      expect(mockScrapeLinkedInProfile).toHaveBeenCalledTimes(2)
      expect(mockUpsertGuest).toHaveBeenCalledTimes(2)
      // Below threshold means no GCS upload
      expect(mockUploadGuestAvatar).not.toHaveBeenCalled()
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
      } as never)

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

    it('uploads avatar to Cloud Storage and updates video with proxy URL', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      mockUpdateVideoAdmin.mockResolvedValue(undefined)
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(jpegBuffer(5000)),
      } as never)

      await POST(createRequest({ videoId: 'video-123' }))

      expect(mockUploadGuestAvatar).toHaveBeenCalledWith(
        '12345678',
        expect.any(Buffer),
        'image/jpeg'
      )

      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith(
        'test-podcast',
        'video-123',
        expect.objectContaining({
          guests: expect.arrayContaining([
            expect.objectContaining({
              photo: '/api/guests/12345678/avatar',
            }),
          ]),
        })
      )

      expect(mockUpsertGuest).toHaveBeenCalledWith(
        'test-podcast',
        expect.objectContaining({
          avatarGcsPath: 'guest-avatars/test-podcast/12345678-1716000000000.jpg',
        })
      )
    })

    it('does not update video.guests when no avatars were uploaded (but ledger appends)', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue({
        ...mockBrightDataProfile,
        avatar: undefined,
      })
      mockUpsertGuest.mockResolvedValue('guest-doc-id')

      await POST(createRequest({ videoId: 'video-123' }))

      expect(mockUploadGuestAvatar).not.toHaveBeenCalled()
      // updateVideoAdmin still called — to append to guestsScrapedAt ledger (Story 24.3).
      expect(mockUpdateVideoAdmin).toHaveBeenCalledTimes(1)
      const payload = mockUpdateVideoAdmin.mock.calls[0][2]
      expect(payload).not.toHaveProperty('guests')
      expect(payload.guestsScrapedAt).toHaveLength(1)
    })
  })

  describe('Error handling', () => {
    it('counts errors when scrape fails for some guests', async () => {
      mockGetVideoAdmin.mockResolvedValue(mockEpisodeVideo as never)
      mockScrapeLinkedInProfile
        .mockResolvedValueOnce(mockBrightDataProfile)
        .mockResolvedValueOnce(null)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as never)

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(1)
      expect(json.data.errorCount).toBe(1)
      expect(json.data.failedUrls).toContain('https://www.linkedin.com/in/janedoe')
    })

    it('returns 500 on unexpected error', async () => {
      mockGetVideoAdmin.mockRejectedValue(new Error('Firestore error'))

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })

    it('still upserts guest without avatarGcsPath when avatar download fails', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as never)

      await POST(createRequest({ videoId: 'video-123' }))

      expect(mockUpsertGuest).toHaveBeenCalledWith(
        'test-podcast',
        expect.not.objectContaining({ avatarGcsPath: expect.anything() })
      )
    })

    it('handles avatar download timeout gracefully', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')

      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      vi.mocked(fetch).mockRejectedValue(abortError)

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(1)
      expect(mockUpsertGuest).toHaveBeenCalled()
      // Ledger append still happens (Story 24.3); only guests array is absent.
      const payload = mockUpdateVideoAdmin.mock.calls[0]?.[2]
      expect(payload).not.toHaveProperty('guests')
      expect(payload?.guestsScrapedAt).toHaveLength(1)
    })

    it('returns HTTP 503 with CONFIG_ERROR when scrape throws BrightDataConfigError (Story 24.4)', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
      } as never)
      mockScrapeLinkedInProfile.mockRejectedValue(
        new FakeBrightDataConfigError('chave ausente', 'MISSING_API_KEY')
      )

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(503)
      const json = await response.json()
      expect(json.error.code).toBe('CONFIG_ERROR')
      expect(json.error.providerCode).toBe('MISSING_API_KEY')
      // The Firestore write must NOT happen — nothing was actually persisted.
      expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
    })

    it('returns HTTP 200 + errorCount when failures are operational, not config (Story 24.4)', async () => {
      mockGetVideoAdmin.mockResolvedValue(mockEpisodeVideo as never)
      mockScrapeLinkedInProfile
        .mockResolvedValueOnce(mockBrightDataProfile)
        .mockResolvedValueOnce(null) // operational failure
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as never)

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.scrapedCount).toBe(1)
      expect(json.data.errorCount).toBe(1)
    })

    it('skips URLs already present in guestsScrapedAt (Story 24.3 dedup hit)', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guestsScrapedAt: [
          { url: 'https://www.linkedin.com/in/richardbranson', scrapedAt: new Date() },
        ],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as never)

      const response = await POST(createRequest({ videoId: 'video-123' }))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.skippedCount).toBe(1)
      expect(json.data.skippedUrls).toContain('https://www.linkedin.com/in/richardbranson')
      // Only the OTHER guest should hit BrightData
      expect(mockScrapeLinkedInProfile).toHaveBeenCalledTimes(1)
      expect(mockScrapeLinkedInProfile).toHaveBeenCalledWith(
        'https://www.linkedin.com/in/janedoe'
      )
    })

    it('appends new URL to guestsScrapedAt ledger after successful scrape', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
        guestsScrapedAt: [],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      mockUpdateVideoAdmin.mockResolvedValue(undefined)
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as never)

      await POST(createRequest({ videoId: 'video-123' }))

      const updatePayload = mockUpdateVideoAdmin.mock.calls[0][2]
      expect(updatePayload.guestsScrapedAt).toHaveLength(1)
      expect(updatePayload.guestsScrapedAt[0].url).toBe(
        'https://www.linkedin.com/in/richardbranson'
      )
    })

    it('does not skip dedup across videos — same URL in different videos rescrapes', async () => {
      // Video has no entry for the URL — must rescrape even if it was scraped elsewhere
      mockGetVideoAdmin.mockResolvedValue({
        ...mockEpisodeVideo,
        guests: [mockEpisodeVideo.guests[0]],
        guestsScrapedAt: [
          { url: 'https://www.linkedin.com/in/someoneelse', scrapedAt: new Date() },
        ],
      } as never)
      mockScrapeLinkedInProfile.mockResolvedValue(mockBrightDataProfile)
      mockUpsertGuest.mockResolvedValue('guest-doc-id')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as never)

      const response = await POST(createRequest({ videoId: 'video-123' }))
      const json = await response.json()

      expect(json.data.scrapedCount).toBe(1)
      expect(json.data.skippedCount).toBe(0)
      expect(mockScrapeLinkedInProfile).toHaveBeenCalled()
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

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(jpegBuffer(5000)),
      } as never)

      await POST(createRequest({ videoId: 'video-123' }))

      const updateCall = mockUpdateVideoAdmin.mock.calls[0]
      const updatedGuests = updateCall[2].guests
      expect(updatedGuests[0].name).toBe('Custom Name')
      expect(updatedGuests[0].role).toBe('Custom Role')
      expect(updatedGuests[0].company).toBe('Custom Company')
      expect(updatedGuests[0].photo).toBe('/api/guests/12345678/avatar')
    })
  })
})
