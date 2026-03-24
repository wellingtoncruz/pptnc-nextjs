import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetProviderTokensWithExpiry = vi.fn()
const mockSaveProviderTokens = vi.fn()
const mockPublish = vi.fn()
const mockComment = vi.fn()
const mockRefreshLinkedInToken = vi.fn()

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

vi.mock('@/lib/firebase/tokens', () => ({
  getProviderTokensWithExpiry: (...args: unknown[]) => mockGetProviderTokensWithExpiry(...args),
  saveProviderTokens: (...args: unknown[]) => mockSaveProviderTokens(...args),
}))

vi.mock('@/lib/linkedin/auth', () => ({
  refreshLinkedInToken: (...args: unknown[]) => mockRefreshLinkedInToken(...args),
}))

vi.mock('./linkedin-publisher', () => {
  return {
    LinkedInPublisher: class {
      publish = mockPublish
      comment = mockComment
    },
  }
})

import { publishWithComment } from './publish-orchestrator'

const defaultParams = {
  content: 'Test post',
  firstComment: 'Links here',
  networkConfig: { targetId: '12345', targetType: 'page' as const },
}

describe('publishWithComment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetProviderTokensWithExpiry.mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'rt',
      expiresAt: 9999999999,
      needsRefresh: false,
    })
  })

  it('publishes post + comment successfully', async () => {
    mockPublish.mockResolvedValue({ success: true, postId: 'post-123' })
    mockComment.mockResolvedValue({ success: true, commentId: 'comment-456' })

    const result = await publishWithComment('user-1', 'linkedin', defaultParams)

    expect(result.status).toBe('published')
    expect(result.postId).toBe('post-123')
    expect(result.commentId).toBe('comment-456')
  })

  it('returns published when no firstComment', async () => {
    mockPublish.mockResolvedValue({ success: true, postId: 'post-123' })

    const { firstComment: _, ...paramsNoComment } = defaultParams
    const result = await publishWithComment('user-1', 'linkedin', paramsNoComment)

    expect(result.status).toBe('published')
    expect(result.postId).toBe('post-123')
    expect(mockComment).not.toHaveBeenCalled()
  })

  it('returns failed when post fails', async () => {
    mockPublish.mockResolvedValue({ success: false, error: 'Rate limit' })

    const result = await publishWithComment('user-1', 'linkedin', defaultParams)

    expect(result.status).toBe('failed')
    expect(result.error).toBe('Rate limit')
    expect(mockComment).not.toHaveBeenCalled()
  })

  it('returns partially_published when post OK but comment fails', async () => {
    mockPublish.mockResolvedValue({ success: true, postId: 'post-123' })
    mockComment.mockResolvedValue({ success: false, error: 'Comment throttled' })

    const result = await publishWithComment('user-1', 'linkedin', defaultParams)

    expect(result.status).toBe('partially_published')
    expect(result.postId).toBe('post-123')
    expect(result.error).toBe('Comment throttled')
  })

  it('refreshes token when needed', async () => {
    mockGetProviderTokensWithExpiry.mockResolvedValue({
      accessToken: 'expired-token',
      refreshToken: 'rt',
      expiresAt: 0,
      needsRefresh: true,
    })
    mockRefreshLinkedInToken.mockResolvedValue({
      accessToken: 'new-token',
      refreshToken: 'new-rt',
      expiresIn: 5184000,
    })
    mockPublish.mockResolvedValue({ success: true, postId: 'post-123' })

    const { firstComment: _, ...paramsNoComment } = defaultParams
    const result = await publishWithComment('user-1', 'linkedin', paramsNoComment)

    expect(result.status).toBe('published')
    expect(mockRefreshLinkedInToken).toHaveBeenCalledWith('rt')
    expect(mockSaveProviderTokens).toHaveBeenCalled()
  })

  it('fails when no tokens found', async () => {
    mockGetProviderTokensWithExpiry.mockResolvedValue(null)

    const result = await publishWithComment('user-1', 'linkedin', defaultParams)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('No linkedin tokens')
  })

  it('fails for unsupported network', async () => {
    mockGetProviderTokensWithExpiry.mockResolvedValue({
      accessToken: 'token',
      needsRefresh: false,
    })

    const result = await publishWithComment('user-1', 'twitter', defaultParams)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('Unsupported network')
  })
})
