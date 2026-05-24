/**
 * Unit tests for POST /api/guests/avatar/upload (Epic 24, Story 24.7 polish).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'test-podcast' }))
vi.mock('@/lib/firebase/cloud-storage', () => ({
  uploadGuestAvatar: vi.fn(),
  CloudStorageError: class CloudStorageError extends Error {
    constructor(message: string, public readonly code: string) {
      super(message)
    }
  },
}))
vi.mock('@/lib/firebase/guests-admin', () => ({
  getGuestByLinkedInUrl: vi.fn(),
  upsertGuest: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { POST } from './route'
import { auth } from '@/lib/auth'
import { uploadGuestAvatar } from '@/lib/firebase/cloud-storage'
import { getGuestByLinkedInUrl, upsertGuest } from '@/lib/firebase/guests-admin'

const mockAuth = vi.mocked(auth)
const mockUpload = vi.mocked(uploadGuestAvatar)
const mockGetGuest = vi.mocked(getGuestByLinkedInUrl)
const mockUpsert = vi.mocked(upsertGuest)

function jpegBytes(size: number): Uint8Array {
  const buf = new Uint8Array(size)
  buf[0] = 0xff
  buf[1] = 0xd8
  return buf
}

function buildRequest(linkedinUrl: string | null, file: Blob | null): Request {
  const fd = new FormData()
  if (linkedinUrl !== null) fd.append('linkedinUrl', linkedinUrl)
  if (file !== null) fd.append('file', file, 'avatar.jpg')
  return new Request('http://localhost/api/guests/avatar/upload', {
    method: 'POST',
    body: fd,
  })
}

describe('POST /api/guests/avatar/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    mockGetGuest.mockResolvedValue(null)
    mockUpsert.mockResolvedValue('guest-doc')
    mockUpload.mockResolvedValue({
      filePath: 'guest-avatars/test-podcast/abc-1.jpg',
      mimeType: 'image/jpeg',
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const file = new Blob([jpegBytes(2000)], { type: 'image/jpeg' })
    const response = await POST(buildRequest('https://www.linkedin.com/in/foo', file))
    expect(response.status).toBe(401)
  })

  it('returns 400 when linkedinUrl is missing', async () => {
    const file = new Blob([jpegBytes(2000)], { type: 'image/jpeg' })
    const response = await POST(buildRequest(null, file))
    expect(response.status).toBe(400)
  })

  it('returns 400 when linkedinUrl does not start with https://', async () => {
    const file = new Blob([jpegBytes(2000)], { type: 'image/jpeg' })
    const response = await POST(buildRequest('linkedin.com/in/foo', file))
    expect(response.status).toBe(400)
  })

  it('returns 400 when file is missing', async () => {
    const response = await POST(buildRequest('https://www.linkedin.com/in/foo', null))
    expect(response.status).toBe(400)
  })

  it('returns 400 when file is empty', async () => {
    const file = new Blob([], { type: 'image/jpeg' })
    const response = await POST(buildRequest('https://www.linkedin.com/in/foo', file))
    expect(response.status).toBe(400)
  })

  it('returns 400 when file exceeds 2 MB', async () => {
    const file = new Blob([jpegBytes(3 * 1024 * 1024)], { type: 'image/jpeg' })
    const response = await POST(buildRequest('https://www.linkedin.com/in/foo', file))
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error.message).toMatch(/2 MB/i)
  })

  it('uploads, upserts, and returns proxy URL on success', async () => {
    const file = new Blob([jpegBytes(2000)], { type: 'image/jpeg' })
    const response = await POST(buildRequest('https://www.linkedin.com/in/foo', file))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.data.proxyUrl).toMatch(/^\/api\/guests\/[a-z0-9]+\/avatar$/)
    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      'image/jpeg'
    )
    expect(mockUpsert).toHaveBeenCalledWith(
      'test-podcast',
      expect.objectContaining({
        url: 'https://www.linkedin.com/in/foo',
        avatarGcsPath: 'guest-avatars/test-podcast/abc-1.jpg',
      })
    )
  })

  it('reuses linkedinNumId from existing guest doc as guestKey', async () => {
    mockGetGuest.mockResolvedValueOnce({
      id: 'g-1',
      url: 'https://www.linkedin.com/in/foo',
      linkedinNumId: '12345678',
      raw: {},
    } as never)
    const file = new Blob([jpegBytes(2000)], { type: 'image/jpeg' })

    const response = await POST(buildRequest('https://www.linkedin.com/in/foo', file))
    const json = await response.json()
    expect(json.data.proxyUrl).toBe('/api/guests/12345678/avatar')
  })
})
