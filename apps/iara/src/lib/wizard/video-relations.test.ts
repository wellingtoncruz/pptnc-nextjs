import { describe, expect, it, vi } from 'vitest'

const { mockDocGet, mockQueryGet } = vi.hoisted(() => ({ mockDocGet: vi.fn(), mockQueryGet: vi.fn() }))

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: (id: string) => ({ id, get: () => mockDocGet(id) }),
          where: () => ({
            select: () => ({ get: mockQueryGet }),
            limit: () => 'CHILDREN_QUERY',
          }),
        }),
      }),
    }),
  }),
}))

import {
  assertUnlinkedInTx,
  canReclassify,
  getVideoRelations,
  hasRelations,
  VideoLinkedError,
} from './video-relations'

const NONE = { parent: null, children: [] }
const WITH_PARENT = { parent: { id: 'ep', title: 'Ep' }, children: [] }
const WITH_CHILD = { parent: null, children: [{ id: 'c', title: 'C' }] }

describe('canReclassify (Adendo B)', () => {
  it('vídeo sem vínculo pode', () => {
    expect(canReclassify({ standalone: false }, NONE)).toBe(true)
  })
  it('vídeo com pai ou com filhos não pode', () => {
    expect(canReclassify({ standalone: false }, WITH_PARENT)).toBe(false)
    expect(canReclassify({ standalone: false }, WITH_CHILD)).toBe(false)
  })
  it('avulso sempre pode', () => {
    expect(canReclassify({ standalone: true }, NONE)).toBe(true)
  })
  it('hasRelations', () => {
    expect(hasRelations(NONE)).toBe(false)
    expect(hasRelations(WITH_PARENT)).toBe(true)
    expect(hasRelations(WITH_CHILD)).toBe(true)
  })
})

describe('getVideoRelations', () => {
  it('lê o título do pai e lista os filhos', async () => {
    mockDocGet.mockResolvedValue({ get: (f: string) => ({ title: 'Episódio X', videoType: 'episode' })[f] })
    mockQueryGet.mockResolvedValue({
      docs: [{ id: 'c1', get: (f: string) => ({ title: 'Corte 1', videoType: 'cut' })[f] }],
    })

    const r = await getVideoRelations('p', { id: 'v1', parentEpisodeId: 'ep-1' } as never)

    expect(r.parent).toEqual({ id: 'ep-1', title: 'Episódio X', videoType: 'episode' })
    expect(r.children).toEqual([{ id: 'c1', title: 'Corte 1', videoType: 'cut' }])
  })

  it('pai apagado continua sendo vínculo (título cai no id)', async () => {
    mockDocGet.mockResolvedValue({ get: () => undefined })
    mockQueryGet.mockResolvedValue({ docs: [] })

    const r = await getVideoRelations('p', { id: 'v1', parentEpisodeId: 'ep-gone' } as never)

    expect(r.parent?.title).toBe('ep-gone')
    expect(hasRelations(r)).toBe(true)
  })
})

describe('assertUnlinkedInTx', () => {
  function tx(parentEpisodeId: string, childrenEmpty: boolean) {
    return {
      get: vi.fn((ref: unknown) =>
        ref === 'CHILDREN_QUERY'
          ? Promise.resolve({ empty: childrenEmpty })
          : Promise.resolve({ get: () => parentEpisodeId })
      ),
    } as never
  }

  it('passa sem vínculo', async () => {
    await expect(assertUnlinkedInTx(tx('', true), 'p', 'v1')).resolves.toBeUndefined()
  })
  it('recusa quando ganhou pai', async () => {
    await expect(assertUnlinkedInTx(tx('ep-1', true), 'p', 'v1')).rejects.toBeInstanceOf(VideoLinkedError)
  })
  it('recusa quando ganhou filho', async () => {
    await expect(assertUnlinkedInTx(tx('', false), 'p', 'v1')).rejects.toBeInstanceOf(VideoLinkedError)
  })
})
