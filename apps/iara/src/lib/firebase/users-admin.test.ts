/**
 * Unit tests for users-admin.ts
 *
 * Tests podcast-scoped user management functions.
 *
 * @see docs/stories/8-1-modelo-roles-permissoes.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => ({ _seconds: 1234567890, _nanoseconds: 0 })),
  },
}))

// Create mock functions
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockUpdate = vi.fn()
const mockWhere = vi.fn()
const mockCollectionGet = vi.fn()

// Create a proper nested mock structure for Firestore
const createMockDb = () => {
  const mockUserDocRef = {
    get: mockGet,
    set: mockSet,
    update: mockUpdate,
  }

  const mockUsersCollectionRef = {
    doc: vi.fn(() => mockUserDocRef),
    where: mockWhere,
    get: mockCollectionGet,
  }

  const mockPodcastDocRef = {
    collection: vi.fn(() => mockUsersCollectionRef),
  }

  const mockPodcastsCollectionRef = {
    doc: vi.fn(() => mockPodcastDocRef),
  }

  const mockTransaction = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  }

  return {
    collection: vi.fn(() => mockPodcastsCollectionRef),
    runTransaction: vi.fn((callback) => callback(mockTransaction)),
    _transaction: mockTransaction,
    _userDocRef: mockUserDocRef,
    _usersCollectionRef: mockUsersCollectionRef,
  }
}

let mockDb: ReturnType<typeof createMockDb>

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => mockDb),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks are set up
import {
  getPodcastUser,
  createOrUpdateUserOnLogin,
  isAdmin,
  getUserRole,
  updateUserRole,
  softDeleteUser,
  listPodcastUsers,
  countAdmins,
} from './users-admin'

describe('users-admin', () => {
  const podcastId = 'test-podcast'
  const oderId = 'google-user-123'

  const mockUser = {
    id: oderId,
    email: 'test@example.com',
    name: 'Test User',
    picture: 'https://example.com/photo.jpg',
    role: 'user' as const,
    lastAccessAt: { toDate: () => new Date() },
    createdAt: { toDate: () => new Date() },
    updatedAt: { toDate: () => new Date() },
    deleted: false,
  }

  const mockAdminUser = {
    ...mockUser,
    role: 'admin' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
  })

  describe('getPodcastUser', () => {
    it('returns user when found and not deleted', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockUser,
      })

      const result = await getPodcastUser(podcastId, oderId)

      expect(result).toBeDefined()
      expect(result?.email).toBe(mockUser.email)
      expect(mockDb.collection).toHaveBeenCalledWith('podcasts')
    })

    it('returns null when user not found', async () => {
      mockGet.mockResolvedValueOnce({
        exists: false,
      })

      const result = await getPodcastUser(podcastId, oderId)

      expect(result).toBeNull()
    })

    it('returns null when user is soft-deleted', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockUser, deleted: true }),
      })

      const result = await getPodcastUser(podcastId, oderId)

      expect(result).toBeNull()
    })
  })

  describe('createOrUpdateUserOnLogin', () => {
    const userData = {
      oderId,
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    }

    it('creates new user with role=user when not exists', async () => {
      mockDb._transaction.get.mockResolvedValueOnce({ exists: false })
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockUser,
      })

      const result = await createOrUpdateUserOnLogin(podcastId, userData)

      expect(mockDb._transaction.set).toHaveBeenCalled()
      expect(result.role).toBe('user')
    })

    it('updates lastAccessAt when user exists', async () => {
      mockDb._transaction.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockUser,
      })
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockUser,
      })

      await createOrUpdateUserOnLogin(podcastId, userData)

      expect(mockDb._transaction.update).toHaveBeenCalled()
    })

    it('reactivates soft-deleted user on login', async () => {
      mockDb._transaction.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockUser, deleted: true }),
      })
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockUser, deleted: false }),
      })

      await createOrUpdateUserOnLogin(podcastId, userData)

      // Should call update with deleted: false
      expect(mockDb._transaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ deleted: false })
      )
    })
  })

  describe('isAdmin', () => {
    it('returns true for admin user', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockAdminUser,
      })

      const result = await isAdmin(podcastId, oderId)

      expect(result).toBe(true)
    })

    it('returns false for regular user', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockUser,
      })

      const result = await isAdmin(podcastId, oderId)

      expect(result).toBe(false)
    })

    it('returns false when user not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false })

      const result = await isAdmin(podcastId, oderId)

      expect(result).toBe(false)
    })
  })

  describe('getUserRole', () => {
    it('returns user role when found', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => mockAdminUser,
      })

      const result = await getUserRole(podcastId, oderId)

      expect(result).toBe('admin')
    })

    it('returns null when user not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false })

      const result = await getUserRole(podcastId, oderId)

      expect(result).toBeNull()
    })
  })

  describe('updateUserRole', () => {
    it('updates user role', async () => {
      await updateUserRole(podcastId, oderId, 'admin')

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' })
      )
    })
  })

  describe('softDeleteUser', () => {
    it('sets deleted flag to true', async () => {
      await softDeleteUser(podcastId, oderId)

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: true })
      )
    })
  })

  describe('listPodcastUsers', () => {
    it('returns non-deleted users', async () => {
      const mockSnapshot = {
        docs: [
          { data: () => mockUser, id: 'user-1' },
          { data: () => mockAdminUser, id: 'user-2' },
        ],
      }

      mockCollectionGet.mockResolvedValueOnce(mockSnapshot)

      const result = await listPodcastUsers(podcastId)

      expect(result).toHaveLength(2)
    })

    it('skips soft-deleted users and invalid documents', async () => {
      const deletedUser = { ...mockUser, deleted: true }
      const mockSnapshot = {
        docs: [
          { data: () => mockUser, id: 'valid' },
          { data: () => deletedUser, id: 'deleted' },
          { data: () => ({ invalid: 'data' }), id: 'invalid' },
        ],
      }

      mockCollectionGet.mockResolvedValueOnce(mockSnapshot)

      const result = await listPodcastUsers(podcastId)

      // Should only return valid, non-deleted users
      expect(result).toHaveLength(1)
    })
  })

  describe('countAdmins', () => {
    it('counts admin users', async () => {
      const mockSnapshot = {
        docs: [
          { data: () => ({ ...mockAdminUser, deleted: false }) },
          { data: () => ({ ...mockAdminUser, deleted: false }) },
        ],
      }

      mockWhere.mockReturnValueOnce({
        get: vi.fn().mockResolvedValueOnce(mockSnapshot),
      })

      const result = await countAdmins(podcastId)

      expect(result).toBe(2)
      expect(mockWhere).toHaveBeenCalledWith('role', '==', 'admin')
    })
  })
})
