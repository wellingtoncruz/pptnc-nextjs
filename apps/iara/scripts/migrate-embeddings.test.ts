// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock firebase-admin/app
vi.mock('firebase-admin/app', () => ({
  applicationDefault: vi.fn(),
  getApps: vi.fn().mockReturnValue([{ name: 'test' }]),
  initializeApp: vi.fn(),
}))

// Mock firebase-admin/firestore
const mockGet = vi.fn().mockResolvedValue({ size: 0, docs: [] })
const mockWhere = vi.fn().mockReturnValue({ get: mockGet })

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn().mockReturnValue({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: mockWhere,
        }),
      }),
    }),
  }),
  FieldValue: {
    vector: (values: number[]) => ({ __type: 'vector', values }),
    serverTimestamp: () => 'SERVER_TIMESTAMP',
  },
}))

// Mock @google/genai
const mockEmbedContent = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { embedContent: mockEmbedContent }
  },
}))

import { GoogleGenAI } from '@google/genai'
import { migrateEmbeddings, generateEmbedding } from './migrate-embeddings'
import { getFirestore } from 'firebase-admin/firestore'

function createMockDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    data: () => data,
    ref: { update: vi.fn().mockResolvedValue(undefined) },
  }
}

function mockEmbeddingResponse(values: number[]) {
  return { embeddings: [{ values }] }
}

describe('migrate-embeddings', () => {
  const mockAI = new GoogleGenAI({ apiKey: 'test' })
  const mockDb = getFirestore() as ReturnType<typeof getFirestore>

  beforeEach(() => {
    vi.clearAllMocks()
    mockEmbedContent.mockResolvedValue(mockEmbeddingResponse(new Array(768).fill(0.1)))
  })

  describe('generateEmbedding', () => {
    it('returns embedding values from Vertex AI response', async () => {
      const values = new Array(768).fill(0.5)
      mockEmbedContent.mockResolvedValue(mockEmbeddingResponse(values))

      const result = await generateEmbedding(mockAI, 'test text')

      expect(result).toEqual(values)
      expect(mockEmbedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'text-embedding-004',
          contents: 'test text',
          config: expect.objectContaining({
            taskType: 'RETRIEVAL_DOCUMENT',
            outputDimensionality: 768,
          }),
        })
      )
    })

    it('throws on empty embeddings response', async () => {
      mockEmbedContent.mockResolvedValue({ embeddings: [] })

      await expect(generateEmbedding(mockAI, 'test'))
        .rejects.toThrow('Empty embeddings response')
    })

    it('throws on missing embeddings property', async () => {
      mockEmbedContent.mockResolvedValue({})

      await expect(generateEmbedding(mockAI, 'test'))
        .rejects.toThrow('Empty embeddings response')
    })

    it('throws on empty values in embedding response', async () => {
      mockEmbedContent.mockResolvedValue({ embeddings: [{ values: [] }] })

      await expect(generateEmbedding(mockAI, 'test'))
        .rejects.toThrow('Empty values in embedding response')
    })
  })

  describe('migrateEmbeddings', () => {
    it('queries episodes with correct filter', async () => {
      mockGet.mockResolvedValue({ size: 0, docs: [] })

      await migrateEmbeddings(mockDb, mockAI)

      expect(mockWhere).toHaveBeenCalledWith('videoType', '==', 'episode')
    })

    it('processes batch of episodes successfully', async () => {
      const doc1 = createMockDoc('video-1', { title: 'Title 1', description: 'Desc 1' })
      const doc2 = createMockDoc('video-2', { title: 'Title 2', description: 'Desc 2' })

      mockGet.mockResolvedValue({ size: 2, docs: [doc1, doc2] })

      const report = await migrateEmbeddings(mockDb, mockAI)

      expect(report.totalEpisodes).toBe(2)
      expect(report.succeeded).toBe(2)
      expect(report.failed).toBe(0)
      expect(report.errors).toHaveLength(0)

      // Verify updates were called with vector + hasEmbedding
      const expectedVector = { __type: 'vector', values: new Array(768).fill(0.1) }
      expect(doc1.ref.update).toHaveBeenCalledWith({
        summaryVector: expectedVector,
        hasEmbedding: true,
        updatedAt: 'SERVER_TIMESTAMP',
      })
      expect(doc2.ref.update).toHaveBeenCalledWith({
        summaryVector: expectedVector,
        hasEmbedding: true,
        updatedAt: 'SERVER_TIMESTAMP',
      })
    })

    it('skips failed video and continues processing', async () => {
      const doc1 = createMockDoc('video-ok', { title: 'OK', description: 'Desc' })
      const doc2 = createMockDoc('video-fail', { title: 'Fail', description: 'Desc' })
      const doc3 = createMockDoc('video-ok-2', { title: 'OK 2', description: 'Desc' })

      mockGet.mockResolvedValue({ size: 3, docs: [doc1, doc2, doc3] })

      // Second call fails
      mockEmbedContent
        .mockResolvedValueOnce(mockEmbeddingResponse(new Array(768).fill(0.1)))
        .mockRejectedValueOnce(new Error('Vertex AI quota exceeded'))
        .mockResolvedValueOnce(mockEmbeddingResponse(new Array(768).fill(0.3)))

      const report = await migrateEmbeddings(mockDb, mockAI)

      expect(report.succeeded).toBe(2)
      expect(report.failed).toBe(1)
      expect(report.errors).toEqual([
        { videoId: 'video-fail', error: 'Vertex AI quota exceeded' },
      ])

      // First and third docs should be updated
      expect(doc1.ref.update).toHaveBeenCalled()
      expect(doc2.ref.update).not.toHaveBeenCalled()
      expect(doc3.ref.update).toHaveBeenCalled()
    })

    it('reports correct final counts', async () => {
      const docs = Array.from({ length: 5 }, (_, i) =>
        createMockDoc(`video-${i}`, { title: `Title ${i}`, description: `Desc ${i}` })
      )

      mockGet.mockResolvedValue({ size: 5, docs })

      // 3 succeed, 2 fail
      mockEmbedContent
        .mockResolvedValueOnce(mockEmbeddingResponse(new Array(768).fill(0.1)))
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockResolvedValueOnce(mockEmbeddingResponse(new Array(768).fill(0.1)))
        .mockResolvedValueOnce(mockEmbeddingResponse(new Array(768).fill(0.1)))
        .mockRejectedValueOnce(new Error('Error 2'))

      const report = await migrateEmbeddings(mockDb, mockAI)

      expect(report.totalEpisodes).toBe(5)
      expect(report.succeeded).toBe(3)
      expect(report.failed).toBe(2)
      expect(report.errors).toHaveLength(2)
      expect(report.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('uses fallback text for video without title and description', async () => {
      const doc = createMockDoc('video-empty', { title: '', description: '' })

      mockGet.mockResolvedValue({ size: 1, docs: [doc] })

      await migrateEmbeddings(mockDb, mockAI)

      // Should call embedContent with fallback text
      expect(mockEmbedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'Vídeo sem título e descrição',
        })
      )
    })

    it('records failure when doc.ref.update() throws', async () => {
      const doc = createMockDoc('video-update-fail', { title: 'Title', description: 'Desc' })
      doc.ref.update = vi.fn().mockRejectedValue(new Error('Firestore write failed'))

      mockGet.mockResolvedValue({ size: 1, docs: [doc] })

      const report = await migrateEmbeddings(mockDb, mockAI)

      expect(report.succeeded).toBe(0)
      expect(report.failed).toBe(1)
      expect(report.errors).toEqual([
        { videoId: 'video-update-fail', error: 'Firestore write failed' },
      ])
    })

    it('handles empty snapshot (no episodes)', async () => {
      mockGet.mockResolvedValue({ size: 0, docs: [] })

      const report = await migrateEmbeddings(mockDb, mockAI)

      expect(report.totalEpisodes).toBe(0)
      expect(report.succeeded).toBe(0)
      expect(report.failed).toBe(0)
      expect(mockEmbedContent).not.toHaveBeenCalled()
    })
  })
})
