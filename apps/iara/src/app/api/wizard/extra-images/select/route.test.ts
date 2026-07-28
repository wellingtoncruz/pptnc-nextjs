/**
 * Tests da persistência das imagens extras — Epic 28 / Story 28.4.
 */
import type { Session } from 'next-auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }))

const mockCopyToFinal = vi.fn()
const mockDownloadFinal = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  copyExtraImageStagingToFinal: (...a: unknown[]) => mockCopyToFinal(...a),
  downloadExtraImageFinal: (...a: unknown[]) => mockDownloadFinal(...a),
  CloudStorageError: class CloudStorageError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'CloudStorageError'
      this.code = code
    }
  },
}))

const mockGetVideo = vi.fn()
const mockUpdateVideo = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: (...a: unknown[]) => mockGetVideo(...a),
  updateVideoAdmin: (...a: unknown[]) => mockUpdateVideo(...a),
}))

vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'pptnc' }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { GET, POST } from './route'

const validSession = {
  user: { id: 'u1', name: 'T', email: 't@t.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

const STAGING_URL =
  '/api/wizard/thumbnail/upload?path=' + encodeURIComponent('thumbnail-staging/pptnc/vid1/gen-1.png')

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/wizard/extra-images/select', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/wizard/extra-images/select', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideo.mockResolvedValue({ id: 'vid1', videoType: 'episode' })
    mockCopyToFinal.mockResolvedValue({ filePath: 'extra-images/pptnc/vid1/story-999.png' })
    mockUpdateVideo.mockResolvedValue(undefined)
  })

  it('returns 401 without session', async () => {
    mockAuthFn.mockResolvedValue(null)
    const res = await POST(postRequest({ videoId: 'vid1', kind: 'story', selectedImageUrl: STAGING_URL }))
    expect(res.status).toBe(401)
  })

  it('rejects an unknown kind', async () => {
    const res = await POST(
      postRequest({ videoId: 'vid1', kind: 'carrossel', selectedImageUrl: STAGING_URL })
    )
    expect(res.status).toBe(400)
  })

  it('rejects non-episode videos', async () => {
    mockGetVideo.mockResolvedValue({ id: 'vid1', videoType: 'cut' })
    const res = await POST(postRequest({ videoId: 'vid1', kind: 'story', selectedImageUrl: STAGING_URL }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toMatch(/apenas para episódios/)
  })

  it('rejects a URL that is not a staging/final proxy', async () => {
    const res = await POST(
      postRequest({ videoId: 'vid1', kind: 'story', selectedImageUrl: 'data:image/png;base64,AAA' })
    )
    expect(res.status).toBe(400)
    expect(mockCopyToFinal).not.toHaveBeenCalled()
  })

  it('copies to final and persists the proxy URL', async () => {
    const res = await POST(postRequest({ videoId: 'vid1', kind: 'story', selectedImageUrl: STAGING_URL }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imageUrl).toBe(
      '/api/wizard/extra-images/select?path=' +
        encodeURIComponent('extra-images/pptnc/vid1/story-999.png')
    )
    expect(mockCopyToFinal).toHaveBeenCalledWith(
      'thumbnail-staging/pptnc/vid1/gen-1.png',
      'vid1',
      'story'
    )
  })

  /**
   * O bug que este teste existe para impedir: salvar Story apagando Vitrine e
   * Feed. O merge parte do documento lido no próprio request, nunca do cliente.
   */
  it('preserves the other two images when persisting one', async () => {
    mockGetVideo.mockResolvedValue({
      id: 'vid1',
      videoType: 'episode',
      extraImages: { vitrine: '/api/vitrine.png', feed: '/api/feed.png' },
    })

    await POST(postRequest({ videoId: 'vid1', kind: 'story', selectedImageUrl: STAGING_URL }))

    expect(mockUpdateVideo).toHaveBeenCalledWith('pptnc', 'vid1', {
      extraImages: {
        vitrine: '/api/vitrine.png',
        feed: '/api/feed.png',
        story:
          '/api/wizard/extra-images/select?path=' +
          encodeURIComponent('extra-images/pptnc/vid1/story-999.png'),
      },
    })
  })

  it('overwrites only the same kind when re-selecting', async () => {
    mockGetVideo.mockResolvedValue({
      id: 'vid1',
      videoType: 'episode',
      extraImages: { story: '/api/old-story.png', feed: '/api/feed.png' },
    })

    await POST(postRequest({ videoId: 'vid1', kind: 'story', selectedImageUrl: STAGING_URL }))

    const persisted = mockUpdateVideo.mock.calls[0][2].extraImages
    expect(persisted.story).not.toBe('/api/old-story.png')
    expect(persisted.feed).toBe('/api/feed.png')
  })

  it('starts a fresh map when the video has no extraImages yet', async () => {
    await POST(postRequest({ videoId: 'vid1', kind: 'feed', selectedImageUrl: STAGING_URL }))
    expect(Object.keys(mockUpdateVideo.mock.calls[0][2].extraImages)).toEqual(['feed'])
  })

  it('returns 404 for a missing video', async () => {
    mockGetVideo.mockResolvedValue(null)
    const res = await POST(postRequest({ videoId: 'vid1', kind: 'story', selectedImageUrl: STAGING_URL }))
    expect(res.status).toBe(404)
  })
})

describe('GET /api/wizard/extra-images/select (proxy)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
  })

  it('returns 401 without session', async () => {
    mockAuthFn.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/wizard/extra-images/select?path=x'))
    expect(res.status).toBe(401)
  })

  it('returns 400 without the path param', async () => {
    const res = await GET(new Request('http://localhost/api/wizard/extra-images/select'))
    expect(res.status).toBe(400)
  })

  it('serves the bytes with a detected content type', async () => {
    mockDownloadFinal.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const res = await GET(
      new Request('http://localhost/api/wizard/extra-images/select?path=extra-images/pptnc/v/story-1.png')
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('detects JPEG from magic bytes', async () => {
    mockDownloadFinal.mockResolvedValue(Buffer.from([0xff, 0xd8, 0x00, 0x00]))
    const res = await GET(
      new Request('http://localhost/api/wizard/extra-images/select?path=extra-images/pptnc/v/story-1.jpg')
    )
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
  })
})
