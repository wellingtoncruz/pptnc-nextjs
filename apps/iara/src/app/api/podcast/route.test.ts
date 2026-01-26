import { NextRequest } from 'next/server'
import type { Session } from 'next-auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies before importing the route
const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

vi.mock('@/lib/firebase/podcasts-admin', () => ({
  updatePodcastAdmin: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { PATCH } from './route'
import { updatePodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { log } from '@/lib/logger'

const mockUpdatePodcast = vi.mocked(updatePodcastAdmin)
const mockLog = vi.mocked(log)

function createMockRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/podcast', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/podcast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const request = createMockRequest({ name: 'New Name' })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('updates podcast name successfully', async () => {
    mockAuthFn.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
      expires: '2026-12-31',
    } as Session)
    mockUpdatePodcast.mockResolvedValue(undefined)

    const request = createMockRequest({ name: 'New Podcast Name' })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.success).toBe(true)
    expect(mockUpdatePodcast).toHaveBeenCalledWith('test-podcast', { name: 'New Podcast Name' })
    expect(mockLog).toHaveBeenCalledWith('INFO', 'Podcast updated via API', expect.objectContaining({
      userId: 'user123',
      podcastId: 'test-podcast',
      fields: ['name'],
    }))
  })

  it('updates channelId successfully', async () => {
    mockAuthFn.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
      expires: '2026-12-31',
    } as Session)
    mockUpdatePodcast.mockResolvedValue(undefined)

    const request = createMockRequest({ channelId: 'UC123456' })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.success).toBe(true)
    expect(mockUpdatePodcast).toHaveBeenCalledWith('test-podcast', { channelId: 'UC123456' })
  })

  it('returns 400 for invalid data (Zod validation)', async () => {
    mockAuthFn.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
      expires: '2026-12-31',
    } as Session)

    // Empty name should fail validation
    const request = createMockRequest({ name: '' })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 500 on Firestore error', async () => {
    mockAuthFn.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
      expires: '2026-12-31',
    } as Session)
    mockUpdatePodcast.mockRejectedValue(new Error('Firestore connection failed'))

    const request = createMockRequest({ name: 'New Name' })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
    expect(mockLog).toHaveBeenCalledWith('ERROR', 'Failed to update podcast via API', expect.objectContaining({
      error: 'Firestore connection failed',
    }))
  })

  it('logs successful updates with field names', async () => {
    mockAuthFn.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
      expires: '2026-12-31',
    } as Session)
    mockUpdatePodcast.mockResolvedValue(undefined)

    const request = createMockRequest({ name: 'Name', channelId: 'UC123' })
    await PATCH(request)

    expect(mockLog).toHaveBeenCalledWith('INFO', 'Podcast updated via API', expect.objectContaining({
      fields: expect.arrayContaining(['name', 'channelId']),
    }))
  })

  it('updates prompts successfully', async () => {
    mockAuthFn.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
      expires: '2026-12-31',
    } as Session)
    mockUpdatePodcast.mockResolvedValue(undefined)

    // New prompt structure with PromptField objects
    const prompts = {
      episode: {
        critique: { description: 'Critique prompt', expectedOutput: 'Critique output' },
        editing: { description: 'Editing prompt', expectedOutput: 'Editing output' },
        compliance: { description: 'Compliance prompt', expectedOutput: 'Compliance output' },
        titles: { description: 'Titles prompt', expectedOutput: 'Titles output' },
        description: { description: 'Description prompt', expectedOutput: 'Description output' },
        tags: { description: 'Tags prompt', expectedOutput: 'Tags output' },
      },
      cut: {
        titles: { description: 'Cut titles', expectedOutput: 'Cut titles output' },
        thumbs: { description: 'Thumbs prompt', expectedOutput: 'Thumbs output' },
        description: { description: 'Cut description', expectedOutput: 'Cut desc output' },
        tags: { description: 'Cut tags', expectedOutput: 'Cut tags output' },
      },
      reel: {
        titles: { description: 'Reel titles', expectedOutput: 'Reel titles output' },
        description: { description: 'Reel description', expectedOutput: 'Reel desc output' },
        tags: { description: 'Reel tags', expectedOutput: 'Reel tags output' },
      },
    }
    const request = createMockRequest({ prompts })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.success).toBe(true)
    expect(mockUpdatePodcast).toHaveBeenCalledWith('test-podcast', { prompts })
  })

  it('updates videoTypes successfully', async () => {
    mockAuthFn.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
      expires: '2026-12-31',
    } as Session)
    mockUpdatePodcast.mockResolvedValue(undefined)

    const videoTypes = {
      episode: { minDuration: 1500, maxDuration: null },
      cut: { minDuration: 180, maxDuration: 1140 },
      reel: { minDuration: 0, maxDuration: 120 },
    }
    const request = createMockRequest({ videoTypes })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.success).toBe(true)
    expect(mockUpdatePodcast).toHaveBeenCalledWith('test-podcast', { videoTypes })
  })

  it('returns 400 for prompt exceeding max length', async () => {
    mockAuthFn.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com' },
      expires: '2026-12-31',
    } as Session)

    const prompts = {
      episode: 'a'.repeat(10001), // Exceeds MAX_PROMPT_LENGTH
      cut: 'Cut prompt',
      reel: 'Reel prompt',
    }
    const request = createMockRequest({ prompts })
    const response = await PATCH(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })
})
