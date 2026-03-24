import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { LinkedInPublisher } from './linkedin-publisher'

describe('LinkedInPublisher', () => {
  let publisher: LinkedInPublisher

  beforeEach(() => {
    vi.clearAllMocks()
    publisher = new LinkedInPublisher('test-access-token')
  })

  describe('publish', () => {
    it('publishes a text-only post', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Map([['x-restli-id', 'urn:li:share:123456']]),
      })

      const result = await publisher.publish({
        content: 'Test post content',
        networkConfig: { targetId: '12345', targetType: 'page' },
      })

      expect(result.success).toBe(true)
      expect(result.postId).toBe('urn:li:share:123456')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.linkedin.com/rest/posts',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"commentary":"Test post content"'),
        })
      )
    })

    it('publishes a post with image', async () => {
      // Mock image init
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: {
            uploadUrl: 'https://upload.linkedin.com/upload',
            image: 'urn:li:image:789',
          },
        }),
      })
      // Mock image download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      })
      // Mock image upload
      mockFetch.mockResolvedValueOnce({ ok: true })
      // Mock post
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['x-restli-id', 'urn:li:share:999']]),
      })

      const result = await publisher.publish({
        content: 'Post with image',
        imageUrl: 'https://storage.googleapis.com/test.png',
        networkConfig: { targetId: '12345', targetType: 'page' },
      })

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })

    it('returns error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ message: 'Rate limit' }),
      })

      const result = await publisher.publish({
        content: 'Test',
        networkConfig: { targetId: '12345', targetType: 'page' },
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('rate limit')
    })

    it('handles 401 with token expired message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      })

      const result = await publisher.publish({
        content: 'Test',
        networkConfig: { targetId: '12345', targetType: 'page' },
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('expired')
    })
  })

  describe('comment', () => {
    it('posts a comment successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Map([['x-restli-id', 'comment-456']]),
        json: () => Promise.resolve({ id: 'comment-456' }),
      })

      const result = await publisher.comment('urn:li:share:123', 'First comment with links')

      expect(result.success).toBe(true)
      expect(result.commentId).toBe('comment-456')
    })

    it('returns error on comment failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({}),
      })

      const result = await publisher.comment('urn:li:share:123', 'Comment')

      expect(result.success).toBe(false)
      expect(result.error).toContain('permission')
    })
  })
})
