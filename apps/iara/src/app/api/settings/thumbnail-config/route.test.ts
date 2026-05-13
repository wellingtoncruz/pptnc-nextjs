import type { Session } from 'next-auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mocks ---

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockUploadThumbnailConfigImage = vi.fn()
const mockDownloadThumbnailConfigImage = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  uploadThumbnailConfigImage: (...args: unknown[]) => mockUploadThumbnailConfigImage(...args),
  downloadThumbnailConfigImage: (...args: unknown[]) => mockDownloadThumbnailConfigImage(...args),
  CloudStorageError: class CloudStorageError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'CloudStorageError'
      this.code = code
    }
  },
}))

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { CloudStorageError } from '@/lib/firebase/cloud-storage'

import { GET, POST } from './route'

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

/** Helper: build a multipart Request with the given form fields. */
function buildMultipartRequest(fields: Record<string, string | File>): Request {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value)
  }
  return new Request('http://localhost/api/settings/thumbnail-config', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/settings/thumbnail-config (Epic 22, Story 22.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
  })

  it('returns 401 when no session', async () => {
    mockAuthFn.mockResolvedValue(null)
    const response = await POST(buildMultipartRequest({}))
    expect(response.status).toBe(401)
  })

  it('returns 400 when videoType is missing or invalid', async () => {
    const response = await POST(
      buildMultipartRequest({
        videoType: 'reel',
        role: 'base',
        file: new File(['x'], 'a.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/videoType inválido/)
  })

  it('returns 400 when role is missing or invalid', async () => {
    const response = await POST(
      buildMultipartRequest({
        videoType: 'episode',
        role: 'guest',
        file: new File(['x'], 'a.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/role inválido/)
  })

  it('returns 400 when file is missing', async () => {
    const response = await POST(
      buildMultipartRequest({ videoType: 'episode', role: 'base' })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/Arquivo não enviado/)
  })

  it('returns 400 for unsupported MIME types', async () => {
    const response = await POST(
      buildMultipartRequest({
        videoType: 'episode',
        role: 'base',
        file: new File(['x'], 'a.gif', { type: 'image/gif' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/Formato inválido/)
  })

  it('returns 400 for empty files', async () => {
    const response = await POST(
      buildMultipartRequest({
        videoType: 'episode',
        role: 'base',
        file: new File([], 'empty.png', { type: 'image/png' }),
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/Arquivo vazio/)
  })

  it('returns 400 for files exceeding 5 MB', async () => {
    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    const response = await POST(
      buildMultipartRequest({
        videoType: 'episode',
        role: 'base',
        file: oversized,
      })
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toMatch(/muito grande/)
  })

  it('uploads the file and returns proxy URL on success', async () => {
    mockUploadThumbnailConfigImage.mockResolvedValueOnce({
      filePath: 'thumbnail-config/pptnc/cut/base-123.png',
      mimeType: 'image/png',
    })

    const file = new File(['fake-binary'], 'thumb.png', { type: 'image/png' })
    const response = await POST(
      buildMultipartRequest({
        videoType: 'cut',
        role: 'base',
        file,
      })
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.url).toBe(
      '/api/settings/thumbnail-config?path=' +
        encodeURIComponent('thumbnail-config/pptnc/cut/base-123.png')
    )
    expect(body.mimeType).toBe('image/png')
    expect(mockUploadThumbnailConfigImage).toHaveBeenCalledWith(
      'cut',
      'base',
      expect.any(Buffer),
      'image/png'
    )
  })

  it('propagates CloudStorageError as 500 with message', async () => {
    mockUploadThumbnailConfigImage.mockRejectedValueOnce(
      new CloudStorageError('Bucket unavailable', 'UPLOAD_FAILED')
    )
    const file = new File(['fake'], 'thumb.png', { type: 'image/png' })
    const response = await POST(
      buildMultipartRequest({
        videoType: 'episode',
        role: 'reference',
        file,
      })
    )
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error.message).toBe('Bucket unavailable')
  })
})

describe('GET /api/settings/thumbnail-config (Epic 22, Story 22.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
  })

  it('returns 401 when no session', async () => {
    mockAuthFn.mockResolvedValue(null)
    const response = await GET(
      new Request('http://localhost/api/settings/thumbnail-config?path=thumbnail-config/pptnc/cut/base-1.png')
    )
    expect(response.status).toBe(401)
  })

  it('returns 400 when path is missing', async () => {
    const response = await GET(new Request('http://localhost/api/settings/thumbnail-config'))
    expect(response.status).toBe(400)
  })

  it('serves the image bytes with correct content type', async () => {
    // PNG magic bytes: 0x89 0x50 0x4E 0x47
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    mockDownloadThumbnailConfigImage.mockResolvedValueOnce(pngBuffer)

    const response = await GET(
      new Request(
        'http://localhost/api/settings/thumbnail-config?path=' +
          encodeURIComponent('thumbnail-config/pptnc/cut/base-1.png')
      )
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
  })

  it('detects JPEG content type from magic bytes', async () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    mockDownloadThumbnailConfigImage.mockResolvedValueOnce(jpegBuffer)

    const response = await GET(
      new Request(
        'http://localhost/api/settings/thumbnail-config?path=' +
          encodeURIComponent('thumbnail-config/pptnc/cut/base-1.jpg')
      )
    )

    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('returns 404 when CloudStorage download fails', async () => {
    mockDownloadThumbnailConfigImage.mockRejectedValueOnce(
      new CloudStorageError('Not found', 'DOWNLOAD_FAILED')
    )
    const response = await GET(
      new Request(
        'http://localhost/api/settings/thumbnail-config?path=' +
          encodeURIComponent('thumbnail-config/pptnc/cut/missing.png')
      )
    )
    expect(response.status).toBe(404)
  })
})
