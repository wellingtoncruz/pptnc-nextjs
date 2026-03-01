import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockOrderBy = vi.fn()
const mockStartAfter = vi.fn()
const mockLimit = vi.fn()
const mockCountGet = vi.fn()
const mockWhere = vi.fn()
const mockListByDateGet = vi.fn()
const mockWhereOrderBy = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: vi.fn((date: Date) => ({
      toDate: () => date,
      toMillis: () => date.getTime(),
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
    })),
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
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { listNews, listNewsByDate } from './news-admin'

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

    // Setup chain: where -> where -> orderBy -> get (listNewsByDate)
    mockWhereOrderBy.mockReturnValue({ get: mockListByDateGet })
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

describe('listNewsByDate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWhereOrderBy.mockReturnValue({ get: mockListByDateGet })
    mockWhere.mockReturnValue({ where: mockWhere, orderBy: mockWhereOrderBy })
  })

  it('returns news items for the target date', async () => {
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

    const result = await listNewsByDate('pptnc', new Date('2026-02-25'))

    expect(result).toHaveLength(1)
    expect(result[0].titulo).toBe('Notícia do dia')
    expect(result[0].id).toBe('news-1')
  })

  it('returns empty array when no news for the date', async () => {
    mockListByDateGet.mockResolvedValue({ docs: [] })

    const result = await listNewsByDate('pptnc', new Date('2026-02-25'))

    expect(result).toHaveLength(0)
  })

  it('calls where with UTC day boundaries', async () => {
    const { Timestamp } = await import('firebase-admin/firestore')
    mockListByDateGet.mockResolvedValue({ docs: [] })

    await listNewsByDate('pptnc', new Date('2026-02-25T10:30:00Z'))

    expect(mockWhere).toHaveBeenCalledWith('importedAt', '>=', expect.anything())
    expect(mockWhere).toHaveBeenCalledWith('importedAt', '<=', expect.anything())
    expect(mockWhere).toHaveBeenCalledTimes(2)

    // Verify UTC boundaries: Feb 25 00:00 to Feb 25 23:59:59.999
    const startCall = (Timestamp.fromDate as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: Date[]) => c[0].toISOString() === '2026-02-25T00:00:00.000Z'
    )
    const endCall = (Timestamp.fromDate as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: Date[]) => c[0].toISOString() === '2026-02-25T23:59:59.999Z'
    )
    expect(startCall).toBeDefined()
    expect(endCall).toBeDefined()
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

    const result = await listNewsByDate('pptnc', new Date('2026-02-25'))

    expect(result).toHaveLength(0)
  })

  it('logs correct info', async () => {
    const { log } = await import('@/lib/logger')
    mockListByDateGet.mockResolvedValue({ docs: [] })

    await listNewsByDate('pptnc', new Date('2026-02-25'))

    expect(log).toHaveBeenCalledWith(
      'INFO',
      'News listed by date',
      expect.objectContaining({ podcastId: 'pptnc', count: 0 })
    )
  })
})
