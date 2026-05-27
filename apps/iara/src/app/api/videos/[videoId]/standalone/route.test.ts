import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { PUT } from './route'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: vi.fn(),
  updateVideoAdmin: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast-id',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockUpdateVideoAdmin = vi.mocked(updateVideoAdmin)

function createMockRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/videos/test-video/standalone', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createContext(videoId: string) {
  return { params: Promise.resolve({ videoId }) }
}

const authedSession = { user: { id: 'user-1' }, error: undefined } as never

describe('PUT /api/videos/[videoId]/standalone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(createMockRequest({ standalone: true }), createContext('v1'))
    expect(res.status).toBe(401)
    expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
  })

  it('returns 400 when body is invalid (missing standalone)', async () => {
    mockAuth.mockResolvedValue(authedSession)
    const res = await PUT(createMockRequest({}), createContext('v1'))
    expect(res.status).toBe(400)
    expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
  })

  it('returns 404 when the video does not exist', async () => {
    mockAuth.mockResolvedValue(authedSession)
    mockGetVideoAdmin.mockResolvedValue(null as never)
    const res = await PUT(createMockRequest({ standalone: true }), createContext('v1'))
    expect(res.status).toBe(404)
    expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
  })

  it('rejects episodes (only cut/reel can be standalone)', async () => {
    mockAuth.mockResolvedValue(authedSession)
    mockGetVideoAdmin.mockResolvedValue({ id: 'v1', videoType: 'episode' } as never)
    const res = await PUT(createMockRequest({ standalone: true }), createContext('v1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
    expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
  })

  it('enabling clears the parent link + inherited guests/theme', async () => {
    mockAuth.mockResolvedValue(authedSession)
    mockGetVideoAdmin.mockResolvedValue({
      id: 'v1',
      videoType: 'cut',
      parentEpisodeId: 'ep-1',
      guests: [{ name: 'Alice' }],
      theme: 'tema do episódio',
    } as never)
    mockUpdateVideoAdmin.mockResolvedValue(undefined as never)

    const res = await PUT(createMockRequest({ standalone: true }), createContext('v1'))

    expect(res.status).toBe(200)
    expect(mockUpdateVideoAdmin).toHaveBeenCalledWith('test-podcast-id', 'v1', {
      standalone: true,
      parentEpisodeId: '',
      guests: [],
      theme: '',
    })
    const json = await res.json()
    expect(json.data.standalone).toBe(true)
    expect(json.data.parentEpisodeId).toBe('')
    expect(json.data.guests).toEqual([])
  })

  it('disabling only flips the flag (keeps other fields)', async () => {
    mockAuth.mockResolvedValue(authedSession)
    mockGetVideoAdmin.mockResolvedValue({
      id: 'v1',
      videoType: 'reel',
      standalone: true,
    } as never)
    mockUpdateVideoAdmin.mockResolvedValue(undefined as never)

    const res = await PUT(createMockRequest({ standalone: false }), createContext('v1'))

    expect(res.status).toBe(200)
    expect(mockUpdateVideoAdmin).toHaveBeenCalledWith('test-podcast-id', 'v1', {
      standalone: false,
    })
  })
})
