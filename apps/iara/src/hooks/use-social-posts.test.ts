import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, renderHook, waitFor } from '@/test-utils'

import type { SocialPost } from '@/types/social'

import { useSocialPosts } from './use-social-posts'
import type { EnabledNetworkInfo } from './use-social-posts'

const mockFetch = vi.fn()
global.fetch = mockFetch

const enabledNetworks: EnabledNetworkInfo[] = [
  { id: 'instagram', name: 'Instagram', icon: '📸' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
]

const mockPost = (networkId: string): SocialPost => ({
  networkId,
  cta: `CTA for ${networkId}`,
  body: `Body for ${networkId}`,
  hashtags: ['#test'],
  updatedAt: '2026-02-24T00:00:00Z',
  processedBy: 'llm',
})

describe('useSocialPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches posts on videoId change', async () => {
    const existingPosts = [mockPost('instagram')]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingPosts }),
    })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.posts).toContainEqual(existingPosts[0])
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/social-posts',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('returns empty posts when videoId is null', () => {
    const { result } = renderHook(() =>
      useSocialPosts(null, enabledNetworks, true)
    )

    expect(result.current.posts).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('auto-generates missing posts sequentially', async () => {
    // Only instagram has a post, linkedin is missing
    const existingPosts = [mockPost('instagram')]
    const generatedPost = mockPost('linkedin')

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: existingPosts }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: generatedPost }),
      })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    await waitFor(() => {
      expect(result.current.posts).toHaveLength(2)
    })

    expect(result.current.isGenerating).toBe(false)
    expect(result.current.generatingNetworkId).toBeNull()
    // Verify POST was called for linkedin
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/social-posts/linkedin/generate',
      expect.objectContaining({ method: 'POST' })
    )
    // Verify GET was called first
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('skips generation when hasPrerequisites is false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, false)
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Only GET was called, no POST
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.current.posts).toEqual([])
    expect(result.current.isGenerating).toBe(false)
  })

  it('cancels in-flight requests when videoId changes', async () => {
    // First render: slow fetch that won't resolve before re-render
    let resolveFirst: (value: unknown) => void
    mockFetch.mockImplementationOnce(() =>
      new Promise(resolve => { resolveFirst = resolve })
    )

    const { result, rerender } = renderHook(
      ({ videoId }) => useSocialPosts(videoId, enabledNetworks, true),
      { initialProps: { videoId: 'video-1' as string | null } }
    )

    expect(result.current.isLoading).toBe(true)

    // Change videoId — should abort the first request
    // Return both posts so no auto-generation triggers
    const video2Posts = [mockPost('instagram'), mockPost('linkedin')]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: video2Posts }),
    })

    rerender({ videoId: 'video-2' })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Verify GET was called for video-2
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-2/social-posts',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )

    // Resolve the first fetch after abort (should be ignored)
    resolveFirst!({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    // Posts should be from video-2's fetch, not video-1's
    expect(result.current.posts).toEqual(video2Posts)
  })

  it('handles error per network and allows retry', async () => {
    // GET returns no posts
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })
      // instagram generate fails
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Rate limit' } }),
      })
      // linkedin generate succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPost('linkedin') }),
      })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    // Wait for linkedin post to appear (confirms sequential processing completed)
    await waitFor(() => {
      expect(result.current.posts).toContainEqual(mockPost('linkedin'))
    })

    // Instagram has error, linkedin succeeded
    expect(result.current.errors.get('instagram')).toBe('Rate limit')
    expect(result.current.isGenerating).toBe(false)

    // Retry instagram
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockPost('instagram') }),
    })

    await act(async () => {
      result.current.retryNetwork('instagram')
    })

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false)
    })

    expect(result.current.errors.has('instagram')).toBe(false)
    expect(result.current.posts).toContainEqual(mockPost('instagram'))
  })

  it('updates posts after successful generation', async () => {
    const generatedInstagram = mockPost('instagram')
    const generatedLinkedin = mockPost('linkedin')

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: generatedInstagram }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: generatedLinkedin }),
      })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false)
      expect(result.current.posts).toHaveLength(2)
    })

    expect(result.current.posts).toContainEqual(generatedInstagram)
    expect(result.current.posts).toContainEqual(generatedLinkedin)
    expect(result.current.generatingNetworkId).toBeNull()
  })

  it('handles initial fetch error gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // No posts loaded, no generation triggered
    expect(result.current.posts).toEqual([])
    expect(result.current.isGenerating).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('reprocesses a specific network with additionalContext', async () => {
    const existingPosts = [mockPost('instagram'), mockPost('linkedin')]
    const reprocessedPost = { ...mockPost('instagram'), cta: 'Reprocessed CTA', processedBy: 'llm' as const }

    // Initial fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingPosts }),
    })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Reprocess instagram
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: reprocessedPost }),
    })

    await act(async () => {
      await result.current.reprocessNetwork('instagram', 'Foque no convidado')
    })

    expect(result.current.reprocessingNetworkId).toBeNull()
    expect(result.current.posts.find(p => p.networkId === 'instagram')?.cta).toBe('Reprocessed CTA')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-1/social-posts/instagram/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ additionalContext: 'Foque no convidado' }),
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('updates post after successful reprocess', async () => {
    const existingPosts = [mockPost('instagram')]
    const reprocessedPost = { ...mockPost('instagram'), body: 'New body' }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingPosts }),
    })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    await waitFor(() => {
      expect(result.current.posts).toHaveLength(1)
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: reprocessedPost }),
    })

    await act(async () => {
      await result.current.reprocessNetwork('instagram')
    })

    // Post should be replaced in-place
    expect(result.current.posts).toHaveLength(1)
    expect(result.current.posts[0].body).toBe('New body')
  })

  it('re-throws reprocess error for caller handling', async () => {
    const existingPosts = [mockPost('instagram')]

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingPosts }),
    })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'Parse error' } }),
    })

    await act(async () => {
      await expect(result.current.reprocessNetwork('instagram')).rejects.toThrow('Parse error')
    })

    expect(result.current.reprocessingNetworkId).toBeNull()
    // Error NOT stored in errors map — caller (SocialPostColumn) handles display
    expect(result.current.errors.has('instagram')).toBe(false)
    // Original post should still be there
    expect(result.current.posts).toContainEqual(existingPosts[0])
  })

  it('updates post in local state via updatePost', async () => {
    const existingPosts = [mockPost('instagram'), mockPost('linkedin')]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingPosts }),
    })

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    await waitFor(() => {
      expect(result.current.posts).toHaveLength(2)
    })

    const updatedPost = { ...mockPost('instagram'), cta: 'Edited CTA', processedBy: 'manual' as const }
    act(() => {
      result.current.updatePost('instagram', updatedPost)
    })

    expect(result.current.posts.find(p => p.networkId === 'instagram')?.cta).toBe('Edited CTA')
    expect(result.current.posts.find(p => p.networkId === 'linkedin')?.cta).toBe('CTA for linkedin')
  })
})
