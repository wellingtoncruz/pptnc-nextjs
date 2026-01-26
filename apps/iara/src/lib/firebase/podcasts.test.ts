import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

// Mock firebase/firestore (client SDK)
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'CLIENT_SERVER_TIMESTAMP'),
}))

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => 'ADMIN_SERVER_TIMESTAMP'),
  },
}))

// Mock the client module
vi.mock('./client', () => ({
  getDb: vi.fn(),
}))

// Mock the admin module
vi.mock('./admin', () => ({
  getAdminDb: vi.fn(),
}))

// Mock the logger
vi.mock('../logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { FieldValue } from 'firebase-admin/firestore'

import { getDb } from './client'
import { getAdminDb } from './admin'
import { getPodcast, updatePodcast } from './podcasts'
import { getPodcastAdmin, createPodcastAdmin, updatePodcastAdmin } from './podcasts-admin'
import { log } from '../logger'
import { DEFAULT_VIDEO_TYPES, DEFAULT_PROMPTS, DEFAULT_PERSONAS } from '@/lib/schemas'

// Valid podcast fixture
const validPodcastData = {
  name: 'Test Podcast',
  channelId: 'UC123456',
  ownerId: 'user123',
  prompts: DEFAULT_PROMPTS,
  personas: DEFAULT_PERSONAS,
  videoTypes: DEFAULT_VIDEO_TYPES,
}

// Mock timestamp for Firestore
const mockTimestamp = {
  toDate: () => new Date(),
  seconds: 1234567890,
  nanoseconds: 0,
}

describe('podcasts.ts (Client SDK)', () => {
  let mockDb: object
  let mockDocRef: object

  beforeEach(() => {
    vi.clearAllMocks()

    mockDocRef = {}
    mockDb = {}

    vi.mocked(getDb).mockReturnValue(mockDb as ReturnType<typeof getDb>)
    vi.mocked(doc).mockReturnValue(mockDocRef as ReturnType<typeof doc>)
  })

  describe('getPodcast', () => {
    it('returns validated podcast when document exists', async () => {
      const docData = {
        ...validPodcastData,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      }

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        id: 'test-podcast',
        data: () => docData,
      } as unknown as Awaited<ReturnType<typeof getDoc>>)

      const result = await getPodcast('test-podcast')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('test-podcast')
      expect(result?.name).toBe('Test Podcast')
      expect(doc).toHaveBeenCalledWith(mockDb, 'podcasts', 'test-podcast')
    })

    it('returns null when document does not exist', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false,
        id: 'nonexistent',
        data: () => undefined,
      } as unknown as Awaited<ReturnType<typeof getDoc>>)

      const result = await getPodcast('nonexistent')

      expect(result).toBeNull()
      expect(log).toHaveBeenCalledWith('INFO', 'Podcast not found', { podcastId: 'nonexistent' })
    })

    it('throws ZodError for invalid document data', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        id: 'invalid-podcast',
        data: () => ({ name: '' }), // Invalid: empty name
      } as unknown as Awaited<ReturnType<typeof getDoc>>)

      await expect(getPodcast('invalid-podcast')).rejects.toThrow(ZodError)
      expect(log).toHaveBeenCalledWith(
        'ERROR',
        'Podcast data validation failed',
        expect.objectContaining({ podcastId: 'invalid-podcast', issues: expect.any(Array) })
      )
    })

    it('logs and rethrows errors', async () => {
      const error = new Error('Firestore error')
      vi.mocked(getDoc).mockRejectedValue(error)

      await expect(getPodcast('test-podcast')).rejects.toThrow('Firestore error')
      expect(log).toHaveBeenCalledWith('ERROR', 'Failed to get podcast', {
        podcastId: 'test-podcast',
        error,
      })
    })
  })

  describe('updatePodcast', () => {
    it('updates document with validated data and serverTimestamp', async () => {
      vi.mocked(updateDoc).mockResolvedValue(undefined)

      await updatePodcast('test-podcast', { name: 'Updated Name' })

      expect(updateDoc).toHaveBeenCalledWith(mockDocRef, {
        name: 'Updated Name',
        updatedAt: 'CLIENT_SERVER_TIMESTAMP',
      })
      expect(serverTimestamp).toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith('INFO', 'Podcast updated', {
        podcastId: 'test-podcast',
        fields: ['name'],
      })
    })

    it('throws ZodError for invalid update data', async () => {
      // Passing invalid nested data
      const invalidData = {
        prompts: { episode: 123 }, // Should be string
      }

      await expect(
        updatePodcast('test-podcast', invalidData as unknown as Parameters<typeof updatePodcast>[1])
      ).rejects.toThrow(ZodError)
      expect(updateDoc).not.toHaveBeenCalled()
    })

    it('strips id, createdAt, updatedAt from input', async () => {
      vi.mocked(updateDoc).mockResolvedValue(undefined)

      // These fields should be stripped by PodcastUpdateSchema
      await updatePodcast('test-podcast', {
        name: 'Updated Name',
      } as unknown as Parameters<typeof updatePodcast>[1])

      const updateCall = vi.mocked(updateDoc).mock.calls[0][1] as Record<string, unknown>
      expect(updateCall).not.toHaveProperty('id')
      expect(updateCall).not.toHaveProperty('createdAt')
      // updatedAt is added by the function with serverTimestamp
      expect(updateCall.updatedAt).toBe('CLIENT_SERVER_TIMESTAMP')
    })

    it('logs and rethrows errors', async () => {
      const error = new Error('Update failed')
      vi.mocked(updateDoc).mockRejectedValue(error)

      await expect(updatePodcast('test-podcast', { name: 'Test' })).rejects.toThrow('Update failed')
      expect(log).toHaveBeenCalledWith('ERROR', 'Failed to update podcast', {
        podcastId: 'test-podcast',
        error,
      })
    })
  })
})

describe('podcasts-admin.ts (Admin SDK)', () => {
  let mockDocRef: {
    get: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let mockCollection: ReturnType<typeof vi.fn>
  let mockDb: { collection: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()

    mockDocRef = {
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
    }

    mockCollection = vi.fn(() => ({
      doc: vi.fn(() => mockDocRef),
    }))

    mockDb = {
      collection: mockCollection,
    }

    vi.mocked(getAdminDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getAdminDb>)
  })

  describe('getPodcastAdmin', () => {
    it('returns validated podcast when document exists', async () => {
      const docData = {
        ...validPodcastData,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      }

      mockDocRef.get.mockResolvedValue({
        exists: true,
        id: 'test-podcast',
        data: () => docData,
      })

      const result = await getPodcastAdmin('test-podcast')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('test-podcast')
      expect(mockCollection).toHaveBeenCalledWith('podcasts')
    })

    it('returns null when document does not exist', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: false,
        data: () => undefined,
      })

      const result = await getPodcastAdmin('nonexistent')

      expect(result).toBeNull()
      expect(log).toHaveBeenCalledWith('INFO', 'Podcast not found (admin)', {
        podcastId: 'nonexistent',
      })
    })
  })

  describe('createPodcastAdmin', () => {
    it('creates document with validated data and timestamps', async () => {
      const docData = {
        ...validPodcastData,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      }

      mockDocRef.set.mockResolvedValue(undefined)
      // First get: check existence (not exists), second get: fetch created doc
      mockDocRef.get
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({
          exists: true,
          id: 'new-podcast',
          data: () => docData,
        })

      const result = await createPodcastAdmin('new-podcast', validPodcastData)

      expect(mockDocRef.set).toHaveBeenCalledWith({
        ...validPodcastData,
        createdAt: 'ADMIN_SERVER_TIMESTAMP',
        updatedAt: 'ADMIN_SERVER_TIMESTAMP',
      })
      expect(result.id).toBe('new-podcast')
      expect(log).toHaveBeenCalledWith('INFO', 'Podcast created (admin)', { podcastId: 'new-podcast' })
    })

    it('throws ZodError for invalid create data', async () => {
      const invalidData = {
        name: '', // Invalid: empty name
        channelId: 'UC123',
        ownerId: 'user123',
        prompts: validPodcastData.prompts,
        videoTypes: validPodcastData.videoTypes,
      }

      await expect(createPodcastAdmin('new-podcast', invalidData)).rejects.toThrow(ZodError)
      expect(mockDocRef.set).not.toHaveBeenCalled()
    })

    it('throws error if podcast already exists', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        id: 'existing-podcast',
        data: () => ({}),
      })

      await expect(createPodcastAdmin('existing-podcast', validPodcastData)).rejects.toThrow(
        'Podcast already exists: existing-podcast'
      )
      expect(mockDocRef.set).not.toHaveBeenCalled()
    })

    it('uses FieldValue.serverTimestamp() for timestamps', async () => {
      const docData = {
        ...validPodcastData,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      }

      mockDocRef.set.mockResolvedValue(undefined)
      // First get: check existence (not exists), second get: fetch created doc
      mockDocRef.get
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({
          exists: true,
          id: 'new-podcast',
          data: () => docData,
        })

      await createPodcastAdmin('new-podcast', validPodcastData)

      expect(FieldValue.serverTimestamp).toHaveBeenCalled()
      const setCall = mockDocRef.set.mock.calls[0][0] as Record<string, unknown>
      expect(setCall.createdAt).toBe('ADMIN_SERVER_TIMESTAMP')
      expect(setCall.updatedAt).toBe('ADMIN_SERVER_TIMESTAMP')
    })
  })

  describe('updatePodcastAdmin', () => {
    it('updates document with validated data and serverTimestamp', async () => {
      mockDocRef.update.mockResolvedValue(undefined)

      await updatePodcastAdmin('test-podcast', { name: 'Updated Name' })

      expect(mockDocRef.update).toHaveBeenCalledWith({
        name: 'Updated Name',
        updatedAt: 'ADMIN_SERVER_TIMESTAMP',
      })
      expect(log).toHaveBeenCalledWith('INFO', 'Podcast updated (admin)', {
        podcastId: 'test-podcast',
        fields: ['name'],
      })
    })

    it('uses update() not set() (enforcement rule #4)', async () => {
      mockDocRef.update.mockResolvedValue(undefined)

      await updatePodcastAdmin('test-podcast', { name: 'Test' })

      expect(mockDocRef.update).toHaveBeenCalled()
      expect(mockDocRef.set).not.toHaveBeenCalled()
    })

    it('throws ZodError for invalid update data', async () => {
      const invalidData = {
        prompts: { episode: 123 }, // Should be string
      }

      await expect(
        updatePodcastAdmin('test-podcast', invalidData as unknown as Parameters<typeof updatePodcastAdmin>[1])
      ).rejects.toThrow(ZodError)
      expect(mockDocRef.update).not.toHaveBeenCalled()
    })
  })
})
