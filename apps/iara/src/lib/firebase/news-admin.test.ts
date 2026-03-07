import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockOrderBy = vi.fn()
const mockStartAfter = vi.fn()
const mockLimit = vi.fn()
const mockCountGet = vi.fn()
const mockWhere = vi.fn()
const mockListByDateGet = vi.fn()
const mockNewsDocGet = vi.fn()
const mockNewsDocUpdate = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: vi.fn((date: Date) => ({
      toDate: () => date,
      toMillis: () => date.getTime(),
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
    })),
  },
  FieldValue: {
    vector: vi.fn((v: number[]) => ({ _vector: v })),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  },
}))

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          orderBy: mockOrderBy,
          where: mockWhere,
          count: vi.fn(() => ({ get: mockCountGet })),
          doc: vi.fn(() => ({ get: mockNewsDocGet, update: mockNewsDocUpdate })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { listNews, listNewsByDate, searchNews, getNewsEmbedding, updateNewsEmbedding, updateNewsRelatedVideos, getNewsById, updateNewsFields, updateNewsImageFields } from './news-admin'

function createTimestamp(date: Date) {
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  }
}

function createMockDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    data: () => data,
  }
}

describe('listNews', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default chain: orderBy -> limit -> get (listNews)
    mockLimit.mockReturnValue({ get: mockGet })
    mockOrderBy.mockReturnValue({ limit: mockLimit })
    mockStartAfter.mockReturnValue({ limit: mockLimit })
    // Default count mock
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) })

    // Setup chain: where -> where -> orderBy -> get (listNewsByDate — 48h range on importedAt)
    const mockWhereOrderBy = vi.fn().mockReturnValue({ get: mockListByDateGet })
    mockWhere.mockReturnValue({ where: mockWhere, orderBy: mockWhereOrderBy })
  })

  it('returns empty list when no documents', async () => {
    mockGet.mockResolvedValue({ docs: [] })

    const result = await listNews('test-podcast')

    expect(result.items).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
  })

  it('returns validated news items', async () => {
    const ts = createTimestamp(new Date('2026-02-09T18:55:00Z'))
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('news-1', {
          titulo: 'Test News',
          descricao: 'Test description',
          resumo: 'Test summary',
          comentarios: 'Test comments',
          data: '2026-02-09',
          fonte: { nome: 'Source', url: 'https://example.com' },
          importedAt: ts,
          source_email_id: 'email-1',
        }),
      ],
    })

    const result = await listNews('test-podcast')

    expect(result.items).toHaveLength(1)
    expect(result.items[0].titulo).toBe('Test News')
    expect(result.items[0].id).toBe('news-1')
  })

  it('applies defaults for missing optional fields', async () => {
    const ts = createTimestamp(new Date('2026-02-09T18:55:00Z'))
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('news-partial', {
          // Only required fields: importedAt (id comes from doc.id)
          importedAt: ts,
        }),
      ],
    })

    const result = await listNews('test-podcast')

    expect(result.items).toHaveLength(1)
    expect(result.items[0].titulo).toBe('Sem título')
    expect(result.items[0].descricao).toBe('')
    expect(result.items[0].resumo).toBe('')
    expect(result.items[0].comentarios).toBe('')
    expect(result.items[0].fonte).toEqual({ nome: '', url: '' })
  })

  it('skips documents without importedAt', async () => {
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('news-invalid', {
          titulo: 'Valid title',
          // No importedAt — only strictly required field missing
        }),
      ],
    })

    const result = await listNews('test-podcast')

    expect(result.items).toHaveLength(0)
  })

  it('uses default limit of 16', async () => {
    mockGet.mockResolvedValue({ docs: [] })

    await listNews('test-podcast')

    expect(mockLimit).toHaveBeenCalledWith(16)
  })

  it('respects custom limit', async () => {
    mockGet.mockResolvedValue({ docs: [] })

    await listNews('test-podcast', { limit: 10 })

    expect(mockLimit).toHaveBeenCalledWith(10)
  })

  it('caps limit at 50', async () => {
    mockGet.mockResolvedValue({ docs: [] })

    await listNews('test-podcast', { limit: 100 })

    expect(mockLimit).toHaveBeenCalledWith(50)
  })

  it('uses startAfter when cursor is provided', async () => {
    mockOrderBy.mockReturnValue({ startAfter: mockStartAfter })
    mockGet.mockResolvedValue({ docs: [] })

    await listNews('test-podcast', { cursor: '2026-02-09T00:00:00.000Z' })

    expect(mockStartAfter).toHaveBeenCalled()
  })

  it('returns nextCursor when items fill the page', async () => {
    const ts = createTimestamp(new Date('2026-02-09T18:55:00Z'))
    const docs = Array.from({ length: 3 }, (_, i) =>
      createMockDoc(`news-${i}`, {
        titulo: `News ${i}`,
        descricao: 'Desc',
        resumo: 'Summary',
        comentarios: 'Comments',
        data: '2026-02-09',
        fonte: { nome: 'Source', url: 'https://example.com' },
        importedAt: ts,
      })
    )
    mockGet.mockResolvedValue({ docs })

    const result = await listNews('test-podcast', { limit: 3 })

    expect(result.nextCursor).toBe('2026-02-09T18:55:00.000Z')
  })

  it('returns totalCount from count aggregation', async () => {
    mockGet.mockResolvedValue({ docs: [] })
    mockCountGet.mockResolvedValue({ data: () => ({ count: 42 }) })

    const result = await listNews('test-podcast')

    expect(result.totalCount).toBe(42)
  })

  it('returns null nextCursor when items are less than limit', async () => {
    const ts = createTimestamp(new Date('2026-02-09T18:55:00Z'))
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('news-1', {
          titulo: 'News 1',
          descricao: 'Desc',
          resumo: 'Summary',
          comentarios: 'Comments',
          data: '2026-02-09',
          fonte: { nome: 'Source', url: 'https://example.com' },
          importedAt: ts,
        }),
      ],
    })

    const result = await listNews('test-podcast', { limit: 16 })

    expect(result.nextCursor).toBeNull()
  })
})

// ==========================================================================
// Story 20.3 — searchNews
// ==========================================================================

describe('searchNews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLimit.mockReturnValue({ get: mockGet })
    mockOrderBy.mockReturnValue({ limit: mockLimit })
    mockStartAfter.mockReturnValue({ limit: mockLimit })
  })

  it('returns items matching titulo (case-insensitive)', async () => {
    const ts = createTimestamp(new Date('2026-03-01T10:00:00Z'))
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('n1', {
          titulo: 'Inteligência Artificial avança',
          descricao: 'Descrição qualquer',
          importedAt: ts,
        }),
        createMockDoc('n2', {
          titulo: 'Mercado financeiro em alta',
          descricao: 'Outra descrição',
          importedAt: ts,
        }),
      ],
    })

    const result = await searchNews('pptnc', 'inteligência')

    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('n1')
  })

  it('returns items matching descricao', async () => {
    const ts = createTimestamp(new Date('2026-03-01T10:00:00Z'))
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('n1', {
          titulo: 'Título genérico',
          descricao: 'Discussão sobre blockchain e criptomoedas',
          importedAt: ts,
        }),
      ],
    })

    const result = await searchNews('pptnc', 'blockchain')

    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('n1')
  })

  it('returns empty when no match', async () => {
    const ts = createTimestamp(new Date('2026-03-01T10:00:00Z'))
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('n1', {
          titulo: 'Título qualquer',
          descricao: 'Descrição qualquer',
          importedAt: ts,
        }),
      ],
    })

    const result = await searchNews('pptnc', 'xyznonexistent')

    expect(result.items).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })

  it('respects limit on matched results', async () => {
    const ts = createTimestamp(new Date('2026-03-01T10:00:00Z'))
    const docs = Array.from({ length: 5 }, (_, i) =>
      createMockDoc(`n${i}`, {
        titulo: `IA notícia ${i}`,
        descricao: 'Sobre inteligência artificial',
        importedAt: ts,
      })
    )
    mockGet.mockResolvedValue({ docs })

    const result = await searchNews('pptnc', 'IA', { limit: 2 })

    expect(result.items).toHaveLength(2)
  })

  it('uses batch size of 200', async () => {
    mockGet.mockResolvedValue({ docs: [] })

    await searchNews('pptnc', 'test')

    expect(mockLimit).toHaveBeenCalledWith(200)
  })
})

describe('listNewsByDate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockWhereOrderBy = vi.fn().mockReturnValue({ get: mockListByDateGet })
    mockWhere.mockReturnValue({ where: mockWhere, orderBy: mockWhereOrderBy })
  })

  it('returns news items within the range', async () => {
    const ts = createTimestamp(new Date('2026-02-25T14:00:00Z'))
    mockListByDateGet.mockResolvedValue({
      docs: [
        createMockDoc('news-1', {
          titulo: 'Notícia do dia',
          descricao: 'Descrição',
          resumo: 'Resumo',
          comentarios: '',
          data: '2026-02-25',
          fonte: { nome: 'TechCrunch', url: 'https://techcrunch.com' },
          importedAt: ts,
        }),
      ],
    })

    const rangeStart = new Date('2026-02-24T14:00:00Z')
    const rangeEnd = new Date('2026-02-26T14:00:00Z')
    const result = await listNewsByDate('pptnc', rangeStart, rangeEnd)

    expect(result).toHaveLength(1)
    expect(result[0].titulo).toBe('Notícia do dia')
    expect(result[0].id).toBe('news-1')
  })

  it('returns empty array when no news in range', async () => {
    mockListByDateGet.mockResolvedValue({ docs: [] })

    const rangeStart = new Date('2026-02-24T00:00:00Z')
    const rangeEnd = new Date('2026-02-26T00:00:00Z')
    const result = await listNewsByDate('pptnc', rangeStart, rangeEnd)

    expect(result).toHaveLength(0)
  })

  it('queries importedAt with range boundaries', async () => {
    const { Timestamp } = await import('firebase-admin/firestore')
    mockListByDateGet.mockResolvedValue({ docs: [] })

    const rangeStart = new Date('2026-02-24T14:00:00Z')
    const rangeEnd = new Date('2026-02-26T14:00:00Z')
    await listNewsByDate('pptnc', rangeStart, rangeEnd)

    expect(mockWhere).toHaveBeenCalledWith('importedAt', '>=', expect.anything())
    expect(mockWhere).toHaveBeenCalledWith('importedAt', '<=', expect.anything())
    expect(Timestamp.fromDate).toHaveBeenCalledWith(rangeStart)
    expect(Timestamp.fromDate).toHaveBeenCalledWith(rangeEnd)
  })

  it('skips invalid documents', async () => {
    mockListByDateGet.mockResolvedValue({
      docs: [
        createMockDoc('news-invalid', {
          titulo: 'Valid title',
          // No importedAt — required field
        }),
      ],
    })

    const rangeStart = new Date('2026-02-24T00:00:00Z')
    const rangeEnd = new Date('2026-02-26T00:00:00Z')
    const result = await listNewsByDate('pptnc', rangeStart, rangeEnd)

    expect(result).toHaveLength(0)
  })

  it('logs range start and end', async () => {
    const { log } = await import('@/lib/logger')
    mockListByDateGet.mockResolvedValue({ docs: [] })

    const rangeStart = new Date('2026-02-24T14:00:00Z')
    const rangeEnd = new Date('2026-02-26T14:00:00Z')
    await listNewsByDate('pptnc', rangeStart, rangeEnd)

    expect(log).toHaveBeenCalledWith(
      'INFO',
      'News listed by date',
      expect.objectContaining({
        podcastId: 'pptnc',
        rangeStart: '2026-02-24T14:00:00.000Z',
        rangeEnd: '2026-02-26T14:00:00.000Z',
        count: 0,
      })
    )
  })
})

// ==========================================================================
// Story 18.3 — News embedding and related_videos functions
// ==========================================================================

describe('getNewsEmbedding (Story 18.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns embedding array when it exists', async () => {
    const mockVector = [0.1, 0.2, 0.3]
    mockNewsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ embedding: { toArray: () => mockVector } }),
    })

    const result = await getNewsEmbedding('pptnc', 'news-1')

    expect(result).toEqual(mockVector)
  })

  it('returns null when document does not exist', async () => {
    mockNewsDocGet.mockResolvedValueOnce({ exists: false })

    const result = await getNewsEmbedding('pptnc', 'nonexistent')

    expect(result).toBeNull()
  })

  it('returns null when embedding field is missing', async () => {
    mockNewsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ titulo: 'Test' }),
    })

    const result = await getNewsEmbedding('pptnc', 'news-no-embed')

    expect(result).toBeNull()
  })
})

describe('updateNewsEmbedding (Story 18.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNewsDocUpdate.mockResolvedValue(undefined)
  })

  it('persists vector with FieldValue.vector()', async () => {
    const vector = [0.1, 0.2, 0.3]

    await updateNewsEmbedding('pptnc', 'news-1', vector)

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      embedding: { _vector: vector },
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })
})

describe('updateNewsRelatedVideos (Story 18.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNewsDocUpdate.mockResolvedValue(undefined)
  })

  it('persists related_videos array', async () => {
    await updateNewsRelatedVideos('pptnc', 'news-1', ['vid-1', 'vid-2', 'vid-3'])

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      related_videos: ['vid-1', 'vid-2', 'vid-3'],
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })
})

describe('getNewsById (Story 18.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed news when document exists', async () => {
    const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }
    mockNewsDocGet.mockResolvedValueOnce({
      exists: true,
      id: 'news-1',
      data: () => ({
        titulo: 'Test News',
        descricao: 'Desc',
        resumo: 'Summary',
        comentarios: 'Comments',
        data: '2024-01-01',
        fonte: { nome: 'Source', url: 'https://source.com' },
        importedAt: mockTimestamp,
      }),
    })

    const result = await getNewsById('pptnc', 'news-1')

    expect(result).toBeDefined()
    expect(result?.titulo).toBe('Test News')
  })

  it('returns null when document does not exist', async () => {
    mockNewsDocGet.mockResolvedValueOnce({ exists: false })

    const result = await getNewsById('pptnc', 'nonexistent')

    expect(result).toBeNull()
  })
})

// ==========================================================================
// Story 18.4 — updateNewsFields with invalidation
// ==========================================================================

describe('updateNewsFields (Story 18.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNewsDocUpdate.mockResolvedValue(undefined)
  })

  it('updates selected_video and invalidates social when value changed', async () => {
    mockNewsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ selected_video: 'old-video', social: 'Texto existente' }),
    })

    await updateNewsFields('pptnc', 'news-1', { selected_video: 'new-video' })

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      selected_video: 'new-video',
      social: null,
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('does NOT invalidate social when selected_video is same value (AC 3)', async () => {
    mockNewsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ selected_video: 'same-video', social: 'Texto existente' }),
    })

    await updateNewsFields('pptnc', 'news-1', { selected_video: 'same-video' })

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      selected_video: 'same-video',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('updates social without invalidation (auto-save)', async () => {
    await updateNewsFields('pptnc', 'news-1', { social: 'Novo texto editado' })

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      social: 'Novo texto editado',
      updatedAt: 'SERVER_TIMESTAMP',
    })
    expect(mockNewsDocGet).not.toHaveBeenCalled()
  })

  it('handles selected_video change when no previous value exists', async () => {
    mockNewsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({}),
    })

    await updateNewsFields('pptnc', 'news-1', { selected_video: 'first-video' })

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      selected_video: 'first-video',
      social: null,
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('allows social update when selected_video is unchanged', async () => {
    mockNewsDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ selected_video: 'same-video' }),
    })

    await updateNewsFields('pptnc', 'news-1', { selected_video: 'same-video', social: 'Updated text' })

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      selected_video: 'same-video',
      social: 'Updated text',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })
})

// ==========================================================================
// Story 18.8 — updateNewsImageFields
// ==========================================================================

describe('updateNewsImageFields (Story 18.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNewsDocUpdate.mockResolvedValue(undefined)
  })

  it('persists imageUrl and imagePrompt with dot-notation update', async () => {
    await updateNewsImageFields('pptnc', 'news-1', {
      imageUrl: 'news-images/pptnc/news-1/123.png',
      imagePrompt: 'A prompt for image generation',
    })

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      imageUrl: 'news-images/pptnc/news-1/123.png',
      imagePrompt: 'A prompt for image generation',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('persists only imageUrl when imagePrompt is not provided', async () => {
    await updateNewsImageFields('pptnc', 'news-1', {
      imageUrl: 'news-images/pptnc/news-1/456.png',
    })

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      imageUrl: 'news-images/pptnc/news-1/456.png',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('persists null imageUrl (image cleared)', async () => {
    await updateNewsImageFields('pptnc', 'news-1', {
      imageUrl: null,
      imagePrompt: null,
    })

    expect(mockNewsDocUpdate).toHaveBeenCalledWith({
      imageUrl: null,
      imagePrompt: null,
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })
})
