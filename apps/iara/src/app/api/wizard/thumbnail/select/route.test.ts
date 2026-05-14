import type { Session } from 'next-auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockCopyThumbnailStagingToFinal = vi.fn()
const mockDownloadThumbnailFinalImage = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  copyThumbnailStagingToFinal: (...args: unknown[]) => mockCopyThumbnailStagingToFinal(...args),
  downloadThumbnailFinalImage: (...args: unknown[]) => mockDownloadThumbnailFinalImage(...args),
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
const mockUpdateVideoAdmin = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: (...args: unknown[]) => mockGetVideoAdmin(...args),
  updateVideoAdmin: (...args: unknown[]) => mockUpdateVideoAdmin(...args),
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

function buildJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/wizard/thumbnail/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/wizard/thumbnail/select (Epic 22, Story 22.3g)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validVideo)
    mockCopyThumbnailStagingToFinal.mockResolvedValue({
      filePath: 'thumbnails/pptnc/vid-1/final.png',
    })
    mockUpdateVideoAdmin.mockResolvedValue(undefined)
  })

  it('returns 401 when no session', async () => {
    mockAuthFn.mockResolvedValue(null)
    const response = await POST(buildJsonRequest({}))
    expect(response.status).toBe(401)
  })

  it('returns 400 when videoId is missing or invalid', async () => {
    const resp = await POST(
      buildJsonRequest({
        videoId: 'bad/id',
        selectedThumbnailUrl: '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fa.png',
      })
    )
    expect(resp.status).toBe(400)
  })

  it('returns 400 when selectedThumbnailUrl is missing', async () => {
    const resp = await POST(buildJsonRequest({ videoId: 'vid-1' }))
    expect(resp.status).toBe(400)
  })

  it('returns 404 when video does not exist', async () => {
    mockGetVideoAdmin.mockResolvedValue(null)
    const resp = await POST(
      buildJsonRequest({
        videoId: 'vid-1',
        selectedThumbnailUrl: '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fa.png',
      })
    )
    expect(resp.status).toBe(404)
  })

  it('returns 400 for reel videos', async () => {
    mockGetVideoAdmin.mockResolvedValue({ ...validVideo, videoType: 'reel' })
    const resp = await POST(
      buildJsonRequest({
        videoId: 'vid-1',
        selectedThumbnailUrl: '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fa.png',
      })
    )
    expect(resp.status).toBe(400)
  })

  it('returns 400 when the URL does not match an internal proxy path', async () => {
    const resp = await POST(
      buildJsonRequest({
        videoId: 'vid-1',
        selectedThumbnailUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      })
    )
    expect(resp.status).toBe(400)
    const body = await resp.json()
    expect(body.error.message).toMatch(/Geração e upload no wizard são pré-requisitos/)
  })

  it('copies staging → final, updates Firestore and returns the final proxy URL', async () => {
    const resp = await POST(
      buildJsonRequest({
        videoId: 'vid-1',
        selectedThumbnailUrl: '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fpptnc%2Fvid-1%2Fupload-123.png',
      })
    )
    expect(resp.status).toBe(200)
    expect(mockCopyThumbnailStagingToFinal).toHaveBeenCalledWith(
      'thumbnail-staging/pptnc/vid-1/upload-123.png',
      'vid-1'
    )
    expect(mockUpdateVideoAdmin).toHaveBeenCalledWith('pptnc', 'vid-1', {
      storageThumbnailUrl:
        '/api/wizard/thumbnail/select?path=thumbnails%2Fpptnc%2Fvid-1%2Ffinal.png',
    })
    const body = await resp.json()
    expect(body.thumbnailUrl).toBe(
      '/api/wizard/thumbnail/select?path=thumbnails%2Fpptnc%2Fvid-1%2Ffinal.png'
    )
  })

  it('is idempotent when the URL already points to the final path (no copy, still updates Firestore)', async () => {
    // copyThumbnailStagingToFinal devolve o próprio path quando já é final.
    mockCopyThumbnailStagingToFinal.mockResolvedValue({
      filePath: 'thumbnails/pptnc/vid-1/final.png',
    })
    const resp = await POST(
      buildJsonRequest({
        videoId: 'vid-1',
        selectedThumbnailUrl: '/api/wizard/thumbnail/select?path=thumbnails%2Fpptnc%2Fvid-1%2Ffinal.png',
      })
    )
    expect(resp.status).toBe(200)
    expect(mockCopyThumbnailStagingToFinal).toHaveBeenCalledWith(
      'thumbnails/pptnc/vid-1/final.png',
      'vid-1'
    )
    expect(mockUpdateVideoAdmin).toHaveBeenCalled()
  })

  it('returns 500 when the cloud-storage helper throws', async () => {
    mockCopyThumbnailStagingToFinal.mockRejectedValue(
      new CloudStorageError('Boom', 'UPLOAD_FAILED')
    )
    const resp = await POST(
      buildJsonRequest({
        videoId: 'vid-1',
        selectedThumbnailUrl: '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fa.png',
      })
    )
    expect(resp.status).toBe(500)
    const body = await resp.json()
    expect(body.error.message).toMatch(/Boom/)
    expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
  })
})

describe('GET /api/wizard/thumbnail/select (final proxy)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
  })

  it('returns 401 when no session', async () => {
    mockAuthFn.mockResolvedValue(null)
    const resp = await GET(new Request('http://localhost/api/wizard/thumbnail/select?path=x'))
    expect(resp.status).toBe(401)
  })

  it('returns 400 when path is missing', async () => {
    const resp = await GET(new Request('http://localhost/api/wizard/thumbnail/select'))
    expect(resp.status).toBe(400)
  })

  it('serves the bytes with the right content type', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    mockDownloadThumbnailFinalImage.mockResolvedValue(pngBuffer)
    const resp = await GET(
      new Request('http://localhost/api/wizard/thumbnail/select?path=thumbnails%2Fpptnc%2Fvid-1%2Ffinal.png')
    )
    expect(resp.status).toBe(200)
    expect(resp.headers.get('content-type')).toBe('image/png')
  })

  it('returns 404 when the helper throws DOWNLOAD_FAILED', async () => {
    mockDownloadThumbnailFinalImage.mockRejectedValue(
      new CloudStorageError('Missing', 'DOWNLOAD_FAILED')
    )
    const resp = await GET(
      new Request('http://localhost/api/wizard/thumbnail/select?path=thumbnails%2Fpptnc%2Fvid-1%2Fmissing.png')
    )
    expect(resp.status).toBe(404)
  })
})
