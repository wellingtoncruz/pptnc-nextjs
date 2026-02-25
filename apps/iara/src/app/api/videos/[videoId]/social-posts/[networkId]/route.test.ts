import type { Session } from 'next-auth'
import { NextRequest } from 'next/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockUpsertSocialPost = vi.fn()
vi.mock('@/lib/firebase/social-admin', () => ({
  upsertSocialPost: (...args: unknown[]) => mockUpsertSocialPost(...args),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { PUT } from './route'

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

function createContext(videoId: string, networkId: string) {
  return { params: Promise.resolve({ videoId, networkId }) }
}

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/videos/v1/social-posts/instagram', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('PUT /api/videos/[videoId]/social-posts/[networkId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsertSocialPost.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await PUT(
      createRequest({ cta: 'Test', body: 'Body', hashtags: [] }),
      createContext('video-1', 'instagram')
    )
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('updates social post on valid request', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const response = await PUT(
      createRequest({ cta: 'Confira!', body: 'Novo episódio', hashtags: ['#podcast'] }),
      createContext('video-1', 'instagram')
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.networkId).toBe('instagram')
    expect(mockUpsertSocialPost).toHaveBeenCalledWith(
      'video-1',
      'instagram',
      { cta: 'Confira!', body: 'Novo episódio', hashtags: ['#podcast'] }
    )
  })

  it('returns 400 on invalid body', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockUpsertSocialPost.mockImplementation(() => {
      const { ZodError } = require('zod')
      throw new ZodError([{ code: 'invalid_type', expected: 'array', received: 'string', path: ['hashtags'], message: 'Expected array' }])
    })

    const response = await PUT(
      createRequest({ cta: 'Test', body: 'Body', hashtags: 'not-array' }),
      createContext('video-1', 'instagram')
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 on malformed JSON body', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const malformed = new NextRequest('http://localhost/api/videos/v1/social-posts/instagram', {
      method: 'PUT',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await PUT(malformed, createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockUpsertSocialPost.mockRejectedValue(new Error('Firestore error'))

    const response = await PUT(
      createRequest({ cta: 'Test', body: 'Body', hashtags: [] }),
      createContext('video-1', 'instagram')
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
    expect(json.error.message).toBe('Erro ao salvar post social')
  })
})
