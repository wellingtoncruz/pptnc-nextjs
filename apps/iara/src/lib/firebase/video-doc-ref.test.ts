import { describe, expect, it, vi } from 'vitest'

const mockVideoDoc = vi.fn()
const mockVideosCollection = vi.fn(() => ({ doc: mockVideoDoc }))
const mockPodcastDoc = vi.fn(() => ({ collection: mockVideosCollection }))
const mockCollection = vi.fn(() => ({ doc: mockPodcastDoc }))

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => ({
    collection: mockCollection,
  })),
}))

vi.mock('./config', () => ({
  PODCAST_ID: 'test-podcast',
}))

import { getVideoDocRef } from './video-doc-ref'

describe('getVideoDocRef', () => {
  it('returns video document reference at correct Firestore path', () => {
    getVideoDocRef('video-123')

    expect(mockCollection).toHaveBeenCalledWith('podcasts')
    expect(mockPodcastDoc).toHaveBeenCalledWith('test-podcast')
    expect(mockVideosCollection).toHaveBeenCalledWith('videos')
    expect(mockVideoDoc).toHaveBeenCalledWith('video-123')
  })
})
