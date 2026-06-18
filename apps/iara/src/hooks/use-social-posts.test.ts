import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, renderHook, waitFor } from '@/test-utils'

import type { SocialPost } from '@/types/social'

import { useSocialPosts } from './use-social-posts'
import type { EnabledNetworkInfo } from './use-social-posts'

// Epic 27: generate/retry/reprocess agora usam runAsyncJob (job + polling). O GET
// de listagem continua em fetch. runAsyncJob retorna o post diretamente (mesmo
// payload do caminho síncrono).
vi.mock('@/lib/jobs/run-async-job', () => ({ runAsyncJob: vi.fn() }))

import { runAsyncJob } from '@/lib/jobs/run-async-job'

const mockFetch = vi.fn()
global.fetch = mockFetch
const mockRunAsyncJob = vi.mocked(runAsyncJob)

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
    const existingPosts = [mockPost('instagram'), mockPost('linkedin')]
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

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: existingPosts }),
    })
    mockRunAsyncJob.mockResolvedValueOnce(generatedPost)

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    await waitFor(() => {
      expect(result.current.posts).toHaveLength(2)
    })

    expect(result.current.isGenerating).toBe(false)
    expect(result.current.generatingNetworkId).toBeNull()
    // Job disparado para o linkedin (faltante)
    expect(mockRunAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/videos/video-1/social-posts/linkedin/generate' })
    )
    expect(mockRunAsyncJob).toHaveBeenCalledTimes(1)
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

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockRunAsyncJob).not.toHaveBeenCalled()
    expect(result.current.posts).toEqual([])
    expect(result.current.isGenerating).toBe(false)
  })

  it('cancels in-flight requests when videoId changes', async () => {
    let resolveFirst: (value: unknown) => void
    mockFetch.mockImplementationOnce(() =>
      new Promise(resolve => { resolveFirst = resolve })
    )

    const { result, rerender } = renderHook(
      ({ videoId }) => useSocialPosts(videoId, enabledNetworks, true),
      { initialProps: { videoId: 'video-1' as string | null } }
    )

    expect(result.current.isLoading).toBe(true)

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

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/video-2/social-posts',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )

    resolveFirst!({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    expect(result.current.posts).toEqual(video2Posts)
  })

  it('handles error per network and allows retry', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })
    // instagram generate fails, linkedin succeeds (ordem dos enabledNetworks)
    mockRunAsyncJob
      .mockRejectedValueOnce(new Error('Rate limit'))
      .mockResolvedValueOnce(mockPost('linkedin'))

    const { result } = renderHook(() =>
      useSocialPosts('video-1', enabledNetworks, true)
    )

    await waitFor(() => {
      expect(result.current.posts).toContainEqual(mockPost('linkedin'))
    })

    expect(result.current.errors.get('instagram')).toBe('Rate limit')
    expect(result.current.isGenerating).toBe(false)

    // Retry instagram
    mockRunAsyncJob.mockResolvedValueOnce(mockPost('instagram'))

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

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })
    mockRunAsyncJob
      .mockResolvedValueOnce(generatedInstagram)
      .mockResolvedValueOnce(generatedLinkedin)

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

    expect(result.current.posts).toEqual([])
    expect(result.current.isGenerating).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockRunAsyncJob).not.toHaveBeenCalled()
  })

  it('reprocesses a specific network with additionalContext', async () => {
    const existingPosts = [mockPost('instagram'), mockPost('linkedin')]
    const reprocessedPost = { ...mockPost('instagram'), cta: 'Reprocessed CTA', processedBy: 'llm' as const }

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

    mockRunAsyncJob.mockResolvedValueOnce(reprocessedPost)

    await act(async () => {
      await result.current.reprocessNetwork('instagram', 'Foque no convidado')
    })

    expect(result.current.reprocessingNetworkId).toBeNull()
    expect(result.current.posts.find(p => p.networkId === 'instagram')?.cta).toBe('Reprocessed CTA')
    expect(mockRunAsyncJob).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/videos/video-1/social-posts/instagram/generate',
        body: { additionalContext: 'Foque no convidado' },
      })
    )
  })

  it('updates post after successful reprocess', async () => {
    // Ambas as redes já existem → nenhuma auto-geração interfere.
    const existingPosts = [mockPost('instagram'), mockPost('linkedin')]
    const reprocessedPost = { ...mockPost('instagram'), body: 'New body' }

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

    mockRunAsyncJob.mockResolvedValueOnce(reprocessedPost)

    await act(async () => {
      await result.current.reprocessNetwork('instagram')
    })

    expect(result.current.posts).toHaveLength(2)
    expect(result.current.posts.find(p => p.networkId === 'instagram')?.body).toBe('New body')
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

    mockRunAsyncJob.mockRejectedValueOnce(new Error('Parse error'))

    await act(async () => {
      await expect(result.current.reprocessNetwork('instagram')).rejects.toThrow('Parse error')
    })

    expect(result.current.reprocessingNetworkId).toBeNull()
    expect(result.current.errors.has('instagram')).toBe(false)
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
