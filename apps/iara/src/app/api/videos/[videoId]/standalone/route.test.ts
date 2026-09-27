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

vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: vi.fn(),
}))

vi.mock('@/lib/api/avulso-purge', () => ({
  runAvulsoPurge: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { runAvulsoPurge } from '@/lib/api/avulso-purge'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockUpdateVideoAdmin = vi.mocked(updateVideoAdmin)
const mockGetPodcast = vi.mocked(getPodcastAdmin)
const mockPurge = vi.mocked(runAvulsoPurge)

// Régua do tenant: episódio ≥ 1200s, corte 180–1199s, reel < 180s.
const VIDEO_TYPES = {
  episode: { minDuration: 1200, maxDuration: null },
  cut: { minDuration: 180, maxDuration: 1199 },
  reel: { minDuration: 0, maxDuration: 179 },
}

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

  // Adendo do Epic 25: desmarcar devolve o tipo da DURAÇÃO e espurga o wizard.
  it('disabling purges the wizard and returns the type to the duration one', async () => {
    mockAuth.mockResolvedValue(authedSession)
    // Avulso de 10 min reclassificado como episódio: pela duração é corte.
    const video = { id: 'v1', videoType: 'episode', standalone: true, duration: 600 }
    mockGetVideoAdmin.mockResolvedValue(video as never)
    mockGetPodcast.mockResolvedValue({ videoTypes: VIDEO_TYPES } as never)
    mockPurge.mockResolvedValue({ ok: true, imagesPurged: true })

    const res = await PUT(createMockRequest({ standalone: false }), createContext('v1'))

    expect(res.status).toBe(200)
    expect(mockPurge).toHaveBeenCalledWith({
      podcastId: 'test-podcast-id',
      userId: 'user-1',
      video,
      patch: { standalone: false, videoType: 'cut' },
    })
    expect((await res.json()).data).toEqual({ standalone: false, videoType: 'cut', imagesPurged: true })
    // A escrita é a do espurgo (atômica com o patch), nunca um update solto.
    expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
  })

  it('disabling works whatever the current type is (reclassified episode)', async () => {
    mockAuth.mockResolvedValue(authedSession)
    mockGetVideoAdmin.mockResolvedValue({ id: 'v1', videoType: 'episode', standalone: true, duration: 90 } as never)
    mockGetPodcast.mockResolvedValue({ videoTypes: VIDEO_TYPES } as never)
    mockPurge.mockResolvedValue({ ok: true, imagesPurged: true })

    const res = await PUT(createMockRequest({ standalone: false }), createContext('v1'))

    expect(res.status).toBe(200)
    expect(mockPurge.mock.calls[0][0].patch).toEqual({ standalone: false, videoType: 'reel' })
  })

  it('a refused purge is returned as-is and nothing else is written', async () => {
    mockAuth.mockResolvedValue(authedSession)
    mockGetVideoAdmin.mockResolvedValue({ id: 'v1', videoType: 'cut', standalone: true, duration: 600 } as never)
    mockGetPodcast.mockResolvedValue({ videoTypes: VIDEO_TYPES } as never)
    const { NextResponse } = await import('next/server')
    mockPurge.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: 'YOUTUBE_NOT_VISIBLE' } }, { status: 403 }),
    })

    const res = await PUT(createMockRequest({ standalone: false }), createContext('v1'))

    expect(res.status).toBe(403)
    expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
  })

  it('disabling a video that is not standalone is a no-op (no purge)', async () => {
    mockAuth.mockResolvedValue(authedSession)
    mockGetVideoAdmin.mockResolvedValue({ id: 'v1', videoType: 'cut', standalone: false } as never)

    const res = await PUT(createMockRequest({ standalone: false }), createContext('v1'))

    expect(res.status).toBe(200)
    expect(mockPurge).not.toHaveBeenCalled()
    expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
  })
})
