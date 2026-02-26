import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast-id',
}))

vi.mock('@/lib/firebase/llm-log-admin', () => ({
  getLlmLogs: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getLlmLogs } from '@/lib/firebase/llm-log-admin'

const mockAuth = vi.mocked(auth)
const mockRequireAdmin = vi.mocked(requireAdmin)
const mockGetLlmLogs = vi.mocked(getLlmLogs)

const mockAdminSession = {
  user: { id: 'user-1', name: 'Admin', email: 'admin@test.com', role: 'admin' },
} as never

function createRequest(url = 'http://localhost/api/llm-logs') {
  return new NextRequest(url)
}

describe('GET /api/llm-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(mockAdminSession)
    mockRequireAdmin.mockReturnValue({ authorized: true, session: mockAdminSession })
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await GET(createRequest())

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 403 when user is not admin', async () => {
      const { NextResponse } = await import('next/server')
      mockRequireAdmin.mockReturnValue({
        authorized: false,
        response: NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
          { status: 403 }
        ),
      })

      const response = await GET(createRequest())

      expect(response.status).toBe(403)
      const json = await response.json()
      expect(json.error.code).toBe('FORBIDDEN')
    })
  })

  describe('Success cases', () => {
    it('returns logs with default limit', async () => {
      mockGetLlmLogs.mockResolvedValue({
        logs: [{ id: 'log-1', component: 'test' }],
        lastDoc: null,
      })

      const response = await GET(createRequest())

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.logs).toHaveLength(1)
      expect(mockGetLlmLogs).toHaveBeenCalledWith('test-podcast-id', { limit: 100 })
    })

    it('respects custom limit parameter', async () => {
      mockGetLlmLogs.mockResolvedValue({ logs: [], lastDoc: null })

      await GET(createRequest('http://localhost/api/llm-logs?limit=50'))

      expect(mockGetLlmLogs).toHaveBeenCalledWith('test-podcast-id', { limit: 50 })
    })

    it('caps limit at 200', async () => {
      mockGetLlmLogs.mockResolvedValue({ logs: [], lastDoc: null })

      await GET(createRequest('http://localhost/api/llm-logs?limit=999'))

      expect(mockGetLlmLogs).toHaveBeenCalledWith('test-podcast-id', { limit: 200 })
    })

    it('uses default limit for invalid param', async () => {
      mockGetLlmLogs.mockResolvedValue({ logs: [], lastDoc: null })

      await GET(createRequest('http://localhost/api/llm-logs?limit=abc'))

      expect(mockGetLlmLogs).toHaveBeenCalledWith('test-podcast-id', { limit: 100 })
    })

    it('returns empty array when no logs', async () => {
      mockGetLlmLogs.mockResolvedValue({ logs: [], lastDoc: null })

      const response = await GET(createRequest())

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.logs).toEqual([])
    })
  })

  describe('Error handling', () => {
    it('returns 500 when getLlmLogs throws', async () => {
      mockGetLlmLogs.mockRejectedValue(new Error('Firestore connection failed'))

      const response = await GET(createRequest())

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
