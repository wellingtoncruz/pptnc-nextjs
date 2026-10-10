import { beforeEach, describe, expect, it, vi } from 'vitest'

const { stored, mockWhere, mockSelect, mockUpdate, mockCommit } = vi.hoisted(() => ({
  stored: new Map<string, Record<string, unknown>>(),
  mockWhere: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockCommit: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromDate: (date: Date) => ({ toMillis: () => date.getTime() }) },
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}))
vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: () => ({
    batch: () => ({ update: mockUpdate, commit: mockCommit }),
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: (id: string) => ({ id }),
          where: (...args: unknown[]) => {
            mockWhere(...args)
            return {
              select: (...fields: string[]) => {
                mockSelect(...fields)
                return {
                  get: async () => ({
                    size: stored.size,
                    docs: Array.from(stored, ([id, data]) => ({ id, data: () => data })),
                  }),
                }
              },
            }
          },
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { effectivePublishedAt, refreshPublicationDates } from './refresh-publication-dates'

const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime() })
const live = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  publishedAt: '2026-10-04T15:00:00Z',
  privacyStatus: 'private',
  ...extra,
})

function run(liveVideos: Array<Record<string, unknown>>) {
  const youtube = { getVideoDetailsBatch: vi.fn(async () => liveVideos as never) }
  return { youtube, promise: refreshPublicationDates({ podcastId: 'pptnc', youtube }) }
}

describe('effectivePublishedAt', () => {
  it('agendado: a data do agendamento', () => {
    expect(effectivePublishedAt({ publishedAt: '2026-10-04T15:00:00Z', publishAt: '2026-10-13T10:00:00Z' }))
      .toEqual(new Date('2026-10-13T10:00:00Z'))
  })

  it('sem agendamento (ou agendamento ilegível): a data de publicação', () => {
    expect(effectivePublishedAt({ publishedAt: '2026-10-04T15:00:00Z' })).toEqual(new Date('2026-10-04T15:00:00Z'))
    expect(effectivePublishedAt({ publishedAt: '2026-10-04T15:00:00Z', publishAt: 'x' }))
      .toEqual(new Date('2026-10-04T15:00:00Z'))
  })
})

describe('refreshPublicationDates', () => {
  beforeEach(() => {
    stored.clear()
    vi.clearAllMocks()
  })

  it('relê só os vídeos que o banco dá como não públicos, pelo ID', async () => {
    stored.set('a', { youtubePrivacyStatus: 'private' })
    stored.set('b', { youtubePrivacyStatus: 'unlisted' })
    const { youtube, promise } = run([])

    const result = await promise

    expect(mockWhere).toHaveBeenCalledWith('youtubePrivacyStatus', 'in', ['private', 'unlisted'])
    expect(mockSelect).toHaveBeenCalledWith('youtubePrivacyStatus', 'effectivePublishedAt')
    expect(youtube.getVideoDetailsBatch).toHaveBeenCalledWith(['a', 'b'])
    expect(result).toEqual({ checked: 2, updated: 0 })
  })

  it('vídeo agendado depois de já estar na IAra: grava a data do agendamento', async () => {
    stored.set('a', { youtubePrivacyStatus: 'private', effectivePublishedAt: ts('2026-10-04T15:00:00Z') })

    const result = await run([live('a', { publishAt: '2026-10-13T10:00:00Z' })]).promise

    expect(result).toEqual({ checked: 1, updated: 1 })
    const [ref, fields] = mockUpdate.mock.calls[0]
    expect(ref.id).toBe('a')
    expect(fields.effectivePublishedAt.toMillis()).toBe(new Date('2026-10-13T10:00:00Z').getTime())
    expect(fields.youtubePrivacyStatus).toBe('private')
    expect(mockCommit).toHaveBeenCalledTimes(1)
  })

  it('agendado que foi ao ar: fica com a data real de publicação e vira público', async () => {
    stored.set('a', { youtubePrivacyStatus: 'private', effectivePublishedAt: ts('2026-10-13T10:00:00Z') })

    await run([live('a', { privacyStatus: 'public', publishedAt: '2026-10-13T10:00:02Z' })]).promise

    const fields = mockUpdate.mock.calls[0][1]
    expect(fields.effectivePublishedAt.toMillis()).toBe(new Date('2026-10-13T10:00:02Z').getTime())
    expect(fields.youtubePrivacyStatus).toBe('public')
  })

  it('só toca em data e privacidade — nunca em status nem publishedAt', async () => {
    stored.set('a', { youtubePrivacyStatus: 'private' })

    await run([live('a', { privacyStatus: 'public' })]).promise

    expect(Object.keys(mockUpdate.mock.calls[0][1]).sort())
      .toEqual(['effectivePublishedAt', 'visibilityUpdatedAt', 'youtubePrivacyStatus'])
  })

  it('nada mudou: não escreve', async () => {
    stored.set('a', { youtubePrivacyStatus: 'private', effectivePublishedAt: ts('2026-10-04T15:00:00Z') })

    const result = await run([live('a')]).promise

    expect(result).toEqual({ checked: 1, updated: 0 })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockCommit).not.toHaveBeenCalled()
  })

  it('vídeo que o YouTube não devolve fica como está (ausência não é mudança)', async () => {
    stored.set('a', { youtubePrivacyStatus: 'private' })
    stored.set('sumido', { youtubePrivacyStatus: 'private' })

    const result = await run([live('a', { publishAt: '2026-10-13T10:00:00Z' })]).promise

    expect(result).toEqual({ checked: 2, updated: 1 })
    expect(mockUpdate.mock.calls.map(([ref]) => ref.id)).toEqual(['a'])
  })

  it('falha do YouTube não derruba o sync: devolve failed', async () => {
    stored.set('a', { youtubePrivacyStatus: 'private' })
    const youtube = { getVideoDetailsBatch: vi.fn().mockRejectedValue(new Error('quotaExceeded')) }

    const result = await refreshPublicationDates({ podcastId: 'pptnc', youtube })

    expect(result).toEqual({ checked: 1, updated: 0, failed: true })
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
