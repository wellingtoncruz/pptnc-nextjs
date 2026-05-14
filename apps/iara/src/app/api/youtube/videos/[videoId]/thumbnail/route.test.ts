import type { Session } from 'next-auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockGetVideoAdmin = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: (...args: unknown[]) => mockGetVideoAdmin(...args),
}))

const mockGetUserTokensWithExpiry = vi.fn()
const mockRefreshUserToken = vi.fn()
vi.mock('@/lib/firebase/tokens', () => ({
  getUserTokensWithExpiry: (...args: unknown[]) => mockGetUserTokensWithExpiry(...args),
  refreshUserToken: (...args: unknown[]) => mockRefreshUserToken(...args),
  TokenRefreshError: class TokenRefreshError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

const mockDownloadFinal = vi.fn()
const mockDownloadStaging = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  downloadThumbnailFinalImage: (...args: unknown[]) => mockDownloadFinal(...args),
  downloadThumbnailStagingImage: (...args: unknown[]) => mockDownloadStaging(...args),
  CloudStorageError: class CloudStorageError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'CloudStorageError'
      this.code = code
    }
  },
}))

vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'pptnc' }))

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

const mockUploadThumbnail = vi.fn()
vi.mock('@/lib/youtube', () => ({
  YouTubeClient: class {
    constructor(public accessToken: string) {}
    uploadThumbnail = (...args: unknown[]) => mockUploadThumbnail(...args)
  },
  YouTubeAPIError: class YouTubeAPIError extends Error {
    code: string
    status: number | undefined
    constructor(code: string, message: string, status?: number) {
      super(message)
      this.code = code
      this.status = status
    }
  },
}))

import { POST } from './route'

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

function makeContext(videoId: string) {
  return { params: Promise.resolve({ videoId }) }
}

function makeRequest(): never {
  return undefined as never // POST handler doesn't read the request body
}

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0])

describe('POST /api/youtube/videos/[videoId]/thumbnail (Epic 22, Story 22.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
    mockGetUserTokensWithExpiry.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      needsRefresh: false,
    })
  })

  it('returns 401 when no session', async () => {
    mockAuthFn.mockResolvedValue(null)
    const response = await POST(makeRequest(), makeContext('vid-1'))
    expect(response.status).toBe(401)
  })

  it('returns 404 when video does not exist', async () => {
    mockGetVideoAdmin.mockResolvedValue(null)
    const response = await POST(makeRequest(), makeContext('vid-1'))
    expect(response.status).toBe(404)
  })

  it('skips (uploaded:false) when storageThumbnailUrl is missing', async () => {
    mockGetVideoAdmin.mockResolvedValue({ id: 'vid-1', videoType: 'episode' })
    const response = await POST(makeRequest(), makeContext('vid-1'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.uploaded).toBe(false)
    expect(body.data.reason).toBe('NO_CLOUD_STORAGE_URL')
    expect(mockUploadThumbnail).not.toHaveBeenCalled()
  })

  it('skips (uploaded:false) when storageThumbnailUrl is a base64 data URL (TD-5 legacy)', async () => {
    mockGetVideoAdmin.mockResolvedValue({
      id: 'vid-1',
      videoType: 'episode',
      storageThumbnailUrl: 'data:image/jpeg;base64,SOMEVERYLONGBASE64STRING',
    })
    const response = await POST(makeRequest(), makeContext('vid-1'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.uploaded).toBe(false)
    expect(mockUploadThumbnail).not.toHaveBeenCalled()
  })

  it('downloads from final path and uploads to YouTube (PNG)', async () => {
    mockGetVideoAdmin.mockResolvedValue({
      id: 'vid-1',
      videoType: 'episode',
      storageThumbnailUrl:
        '/api/wizard/thumbnail/select?path=thumbnails%2Fpptnc%2Fvid-1%2Ffinal.png',
    })
    mockDownloadFinal.mockResolvedValue(PNG_HEADER)
    mockUploadThumbnail.mockResolvedValue(undefined)

    const response = await POST(makeRequest(), makeContext('vid-1'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.uploaded).toBe(true)

    expect(mockDownloadFinal).toHaveBeenCalledWith('thumbnails/pptnc/vid-1/final.png')
    expect(mockUploadThumbnail).toHaveBeenCalledWith('vid-1', PNG_HEADER, 'image/png')
  })

  it('downloads from staging when storageThumbnailUrl points to /upload (fallback)', async () => {
    mockGetVideoAdmin.mockResolvedValue({
      id: 'vid-1',
      videoType: 'episode',
      storageThumbnailUrl:
        '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fpptnc%2Fvid-1%2Fupload-1.jpg',
    })
    mockDownloadStaging.mockResolvedValue(JPEG_HEADER)
    mockUploadThumbnail.mockResolvedValue(undefined)

    const response = await POST(makeRequest(), makeContext('vid-1'))
    expect(response.status).toBe(200)
    expect(mockDownloadStaging).toHaveBeenCalledWith('thumbnail-staging/pptnc/vid-1/upload-1.jpg')
    expect(mockUploadThumbnail).toHaveBeenCalledWith('vid-1', JPEG_HEADER, 'image/jpeg')
  })

  it('returns 400 when sniffed MIME is not PNG/JPEG (WebP rejected)', async () => {
    mockGetVideoAdmin.mockResolvedValue({
      id: 'vid-1',
      videoType: 'episode',
      storageThumbnailUrl:
        '/api/wizard/thumbnail/select?path=thumbnails%2Fpptnc%2Fvid-1%2Ffinal.webp',
    })
    // WebP magic bytes (RIFF…WEBP)
    mockDownloadFinal.mockResolvedValue(Buffer.from([0x52, 0x49, 0x46, 0x46]))

    const response = await POST(makeRequest(), makeContext('vid-1'))
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('UNSUPPORTED_MIME')
    expect(mockUploadThumbnail).not.toHaveBeenCalled()
  })

  it('propagates YouTube API errors (4xx/5xx)', async () => {
    mockGetVideoAdmin.mockResolvedValue({
      id: 'vid-1',
      videoType: 'episode',
      storageThumbnailUrl:
        '/api/wizard/thumbnail/select?path=thumbnails%2Fpptnc%2Fvid-1%2Ffinal.png',
    })
    mockDownloadFinal.mockResolvedValue(PNG_HEADER)
    const { YouTubeAPIError } = await import('@/lib/youtube')
    mockUploadThumbnail.mockRejectedValue(
      new YouTubeAPIError('YOUTUBE_FORBIDDEN', 'forbidden', 403)
    )

    const response = await POST(makeRequest(), makeContext('vid-1'))
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error.code).toBe('YOUTUBE_FORBIDDEN')
  })

  it('returns 401 when user has no OAuth tokens', async () => {
    mockGetVideoAdmin.mockResolvedValue({
      id: 'vid-1',
      videoType: 'episode',
      storageThumbnailUrl:
        '/api/wizard/thumbnail/select?path=thumbnails%2Fpptnc%2Fvid-1%2Ffinal.png',
    })
    mockDownloadFinal.mockResolvedValue(PNG_HEADER)
    mockGetUserTokensWithExpiry.mockResolvedValue(null)

    const response = await POST(makeRequest(), makeContext('vid-1'))
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe('NO_TOKENS')
  })
})
