import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Firestore Admin SDK with subcollection and transaction support
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockUpdate = vi.fn()
const mockRunTransaction = vi.fn()

// Transaction mock
const mockTransaction = {
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
}

// User document ref (innermost)
const mockUserDocRef = {
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
}

// Users collection (inside podcast doc)
const mockUsersCollection = {
  doc: vi.fn(() => mockUserDocRef),
}

// Podcast document ref (contains users subcollection)
const mockPodcastDocRef = {
  collection: vi.fn(() => mockUsersCollection),
}

// Podcasts collection (root)
const mockPodcastsCollection = {
  doc: vi.fn(() => mockPodcastDocRef),
}

vi.mock('./admin', () => ({
  getAdminDb: () => ({
    collection: vi.fn(() => mockPodcastsCollection),
    runTransaction: mockRunTransaction,
  }),
}))

vi.mock('./config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('../logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { saveOrUpdateUser, getUser } from './users'

describe('users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock implementations
    mockGet.mockReset()
    mockSet.mockReset()
    mockUpdate.mockReset()
    mockRunTransaction.mockReset()
    // Default: execute transaction callback immediately
    mockRunTransaction.mockImplementation(async (callback: (t: typeof mockTransaction) => Promise<void>) => {
      await callback(mockTransaction)
    })
  })

  describe('saveOrUpdateUser', () => {
    const userId = 'user-123'
    const userInput = {
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/avatar.jpg',
    }

    it('creates a new user document when user does not exist', async () => {
      mockGet.mockResolvedValueOnce({ exists: false })

      await saveOrUpdateUser(userId, userInput)

      expect(mockUsersCollection.doc).toHaveBeenCalledWith(userId)
      // transaction.set is called with (ref, data) - ref is first arg
      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(), // ref
        expect.objectContaining({
          id: userId,
          email: userInput.email,
          name: userInput.name,
          picture: userInput.picture,
          role: 'user',
        })
      )
    })

    it('updates existing user document with name and picture', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: userId,
          email: 'test@example.com',
          name: 'Old Name',
          picture: 'https://example.com/old-avatar.jpg',
          role: 'admin',
        }),
      })

      await saveOrUpdateUser(userId, {
        ...userInput,
        name: 'New Name',
        picture: 'https://example.com/new-avatar.jpg',
      })

      // transaction.update is called with (ref, data) - ref is first arg
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(), // ref
        expect.objectContaining({
          name: 'New Name',
          picture: 'https://example.com/new-avatar.jpg',
        })
      )
      // Should NOT update email or role - check the second argument (data)
      const updateData = mockUpdate.mock.calls[0][1]
      expect(updateData.email).toBeUndefined()
      expect(updateData.role).toBeUndefined()
    })

    it('handles null name and picture from Google', async () => {
      mockGet.mockResolvedValueOnce({ exists: false })

      await saveOrUpdateUser(userId, {
        email: 'test@example.com',
        name: null,
        picture: null,
      })

      // transaction.set is called with (ref, data) - ref is first arg
      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(), // ref
        expect.objectContaining({
          name: null,
          picture: null,
        })
      )
    })

    it('validates input with Zod before persisting', async () => {
      mockGet.mockResolvedValueOnce({ exists: false })

      await expect(
        saveOrUpdateUser(userId, {
          email: 'invalid-email',
          name: 'Test',
          picture: null,
        })
      ).rejects.toThrow()
    })

    it('does not overwrite existing role on update', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          id: userId,
          email: 'test@example.com',
          name: 'Test',
          picture: null,
          role: 'admin', // existing admin role
        }),
      })

      await saveOrUpdateUser(userId, userInput)

      // transaction.update is called with (ref, data) - data is second arg
      // Update should NOT include role
      const updateData = mockUpdate.mock.calls[0][1]
      expect(updateData.role).toBeUndefined()
    })

    it('uses transaction for atomic upsert', async () => {
      mockGet.mockResolvedValueOnce({ exists: false })

      await saveOrUpdateUser(userId, userInput)

      expect(mockRunTransaction).toHaveBeenCalledTimes(1)
    })

    it('propagates transaction errors', async () => {
      mockRunTransaction.mockRejectedValueOnce(new Error('Transaction failed'))

      await expect(saveOrUpdateUser(userId, userInput)).rejects.toThrow('Transaction failed')
    })

    it('propagates Firestore write errors within transaction', async () => {
      mockGet.mockResolvedValueOnce({ exists: false })
      mockRunTransaction.mockImplementationOnce(async (callback: (t: typeof mockTransaction) => Promise<void>) => {
        // Simulate transaction.set throwing an error
        const failingTransaction = {
          ...mockTransaction,
          set: vi.fn(() => { throw new Error('Write failed') }),
        }
        await callback(failingTransaction)
      })

      await expect(saveOrUpdateUser(userId, userInput)).rejects.toThrow('Write failed')
    })
  })

  describe('getUser', () => {
    const userId = 'user-123'

    it('returns user document when it exists', async () => {
      const userData = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
        role: 'admin',
        createdAt: { toDate: () => new Date() },
        updatedAt: { toDate: () => new Date() },
      }
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => userData,
      })

      const result = await getUser(userId)

      expect(result).toMatchObject({
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
      })
    })

    it('returns null when user does not exist', async () => {
      mockGet.mockResolvedValueOnce({ exists: false })

      const result = await getUser(userId)

      expect(result).toBeNull()
    })
  })
})
