import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return {
        async getAccessToken() {
          return { token: 'mock-token' }
        },
      }
    }
  },
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { createPublishTask, cancelPublishTask } from './scheduler'

describe('Cloud Tasks Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    vi.stubEnv('CLOUD_TASKS_ENABLED', 'true')
    vi.stubEnv('NEXTAUTH_URL', 'https://iara.test')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('createPublishTask', () => {
    it('returns dev task name when CLOUD_TASKS_ENABLED=false', async () => {
      vi.stubEnv('CLOUD_TASKS_ENABLED', 'false')

      const taskName = await createPublishTask('post-123', '2026-04-01T14:30:00Z')

      expect(taskName).toBe('dev-task-post-123')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('creates task via REST API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: 'projects/pptnc-stage/locations/us-east1/queues/social-publish/tasks/abc123' }),
      })

      const taskName = await createPublishTask('post-123', '2026-04-01T14:30:00Z')

      expect(taskName).toContain('abc123')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('cloudtasks.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        })
      )
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { message: 'Permission denied' } }),
      })

      await expect(createPublishTask('post-123', '2026-04-01T14:30:00Z')).rejects.toThrow('403')
    })
  })

  describe('cancelPublishTask', () => {
    it('skips cancellation for dev tasks', async () => {
      vi.stubEnv('CLOUD_TASKS_ENABLED', 'false')

      await cancelPublishTask('dev-task-post-123')

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('deletes task via REST API', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 })

      await cancelPublishTask('projects/pptnc-stage/locations/us-east1/queues/social-publish/tasks/abc123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('abc123'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    it('ignores 404 (task already executed)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 })

      await cancelPublishTask('projects/pptnc-stage/locations/us-east1/queues/social-publish/tasks/gone')
      // Should not throw
    })
  })
})
