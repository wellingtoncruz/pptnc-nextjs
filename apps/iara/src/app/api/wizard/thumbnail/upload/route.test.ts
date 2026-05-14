import type { Session } from 'next-auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockUploadThumbnailStagingImage = vi.fn()
const mockDownloadThumbnailStagingImage = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  uploadThumbnailStagingImage: (...args: unknown[]) => mockUploadThumbnailStagingImage(...args),
  downloadThumbnailStagingImage: (...args: unknown[]) => mockDownloadThumbnailStagingImage(...args),
  CloudStorageError: class CloudStorageError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'CloudStorageError'
      this.code = code
    }
  },
}))

const mockGetVideoAdmin = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: (...args: unknown[]) => mockGetVideoAdmin(...args),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { CloudStorageError } from '@/lib/firebase/cloud-storage'

import { GET, POST } from './route'

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

const validVideo = { id: 'vid-1', videoType: 'episode', title: 'Episódio teste' }

function buildMultipartRequest(fields: Record<string, string | File>): Request {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value)
  }
  return new Request('http://localhost/api/wizard/thumbnail/upload', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/wizard/thumbnail/upload (Epic 22, Story 22.3e)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validVideo)
    mockUploadThumbnailStagingImage.mockResolvedValue({
      filePath: 'thumbnail-staging/pptnc/vid-1/upload-123.png',
      mimeType: 'image/png',
    })
  })

  it('returns 401 when no session', async () => {
    mockAuthFn.mockResolvedValue(null)
    const response = await POST(buildMultipartRequest({}))
    expect(response.status).toBe(401)
  })

  it('returns 400 when videoId is missing or has invalid characters', async () => {
    const resp1 = await POST(
      buildMultipartRequest({ file: new File(['x'], 'a.png', { type: 'image/png' }) })
    )
    expect(resp1.status).toBe(400)

    const resp2 = await POST(
      buildMultipartRequest({
        videoId: 'bad/id',
        file: new File(['x'], 'a.png', { type: 'image/png' }),
      })
    )
    expect(resp2.status).toBe(400)
    const body2 = await resp2.json()
    expect(body2.error.message).toMatch(/videoId inválido/)
  })

  it('returns 400 when file is missing', async () => {
    const response = await POST(buildMultipartRequest({ videoId: 'vid-1' }))
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/Arquivo não enviado/)
  })

  it('returns 400 for unsupported MIME types', async () => {
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        file: new File(['x'], 'a.gif', { type: 'image/gif' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/PNG, JPEG ou WebP/)
  })

  it('returns 400 for empty files', async () => {
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        file: new File([], 'a.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/Arquivo vazio/)
  })

  it('returns 400 when file is larger than 2 MB', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        file: new File([big], 'a.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/Máximo 2 MB/)
  })

  it('returns 404 when video does not exist', async () => {
    mockGetVideoAdmin.mockResolvedValue(null)
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        file: new File(['x'], 'a.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(404)
  })

  it('returns 400 when video type is not episode/cut', async () => {
    mockGetVideoAdmin.mockResolvedValue({ ...validVideo, videoType: 'reel' })
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        file: new File(['x'], 'a.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/episódios e cortes/)
  })

  it('uploads to staging and returns the proxy URL', async () => {
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        file: new File(['imagebytes'], 'a.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.thumbnailUrl).toBe(
      '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fpptnc%2Fvid-1%2Fupload-123.png'
    )
    expect(body.mimeType).toBe('image/png')
    expect(mockUploadThumbnailStagingImage).toHaveBeenCalledWith(
      'vid-1',
      'upload',
      expect.any(Buffer),
      'image/png'
    )
  })

  it('accepts role=guest for cut videos and uploads with source=guest', async () => {
    mockGetVideoAdmin.mockResolvedValue({ ...validVideo, videoType: 'cut' })
    mockUploadThumbnailStagingImage.mockResolvedValue({
      filePath: 'thumbnail-staging/pptnc/vid-1/guest-456.png',
      mimeType: 'image/png',
    })
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        role: 'guest',
        file: new File(['x'], 'guest.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(200)
    expect(mockUploadThumbnailStagingImage).toHaveBeenCalledWith(
      'vid-1',
      'guest',
      expect.any(Buffer),
      'image/png'
    )
    const body = await response.json()
    expect(body.thumbnailUrl).toContain('thumbnail-staging%2Fpptnc%2Fvid-1%2Fguest-456.png')
  })

  it('rejects role=guest for episode videos (only cuts have guest photos)', async () => {
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        role: 'guest',
        file: new File(['x'], 'guest.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/cortes/)
  })

  it('allows up to 5 MB for role=guest (vs 2 MB for role=upload)', async () => {
    mockGetVideoAdmin.mockResolvedValue({ ...validVideo, videoType: 'cut' })
    const big = new Uint8Array(3 * 1024 * 1024) // 3 MB — would fail for upload, ok for guest
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        role: 'guest',
        file: new File([big], 'guest.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(200)
  })

  it('rejects > 5 MB even for role=guest', async () => {
    mockGetVideoAdmin.mockResolvedValue({ ...validVideo, videoType: 'cut' })
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        role: 'guest',
        file: new File([big], 'guest.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/Máximo 5 MB/)
  })

  it('returns 500 when the cloud-storage helper throws', async () => {
    mockUploadThumbnailStagingImage.mockRejectedValue(
      new CloudStorageError('Boom', 'UPLOAD_FAILED')
    )
    const response = await POST(
      buildMultipartRequest({
        videoId: 'vid-1',
        file: new File(['x'], 'a.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error.message).toMatch(/Boom/)
  })
})

describe('GET /api/wizard/thumbnail/upload (proxy)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
  })

  it('returns 401 when no session', async () => {
    mockAuthFn.mockResolvedValue(null)
    const response = await GET(new Request('http://localhost/api/wizard/thumbnail/upload?path=x'))
    expect(response.status).toBe(401)
  })

  it('returns 400 when path is missing', async () => {
    const response = await GET(new Request('http://localhost/api/wizard/thumbnail/upload'))
    expect(response.status).toBe(400)
  })

  it('serves the bytes with the right content type (sniffed from magic bytes)', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    mockDownloadThumbnailStagingImage.mockResolvedValue(pngBuffer)

    const response = await GET(
      new Request('http://localhost/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fa.png')
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
  })

  it('returns 404 when the helper throws DOWNLOAD_FAILED', async () => {
    mockDownloadThumbnailStagingImage.mockRejectedValue(
      new CloudStorageError('Missing', 'DOWNLOAD_FAILED')
    )
    const response = await GET(
      new Request('http://localhost/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fmissing.png')
    )
    expect(response.status).toBe(404)
  })
})
