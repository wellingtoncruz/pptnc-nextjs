import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadMediakit = vi.fn()
const mockWriteRendered = vi.fn()
vi.mock('@/lib/firebase/mediakit-admin', () => ({
  readMediakit: () => mockReadMediakit(),
  writeMediakitRendered: (values: Record<string, string>) => mockWriteRendered(values),
}))

const mockUpload = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  uploadMediakitPdf: (pdf: Buffer) => mockUpload(pdf),
}))

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

const mockBind = vi.fn()
vi.mock('./apply-bindings', () => ({
  bindMediakitDeck: (...args: unknown[]) => mockBind(...args),
}))

vi.mock('./bundle', () => ({
  unpackBundle: () => ({ deckHtml: '<section a><section b><section c>' }),
  repackBundle: (_bundle: string, deck: string) => `REPACKED:${deck}`,
}))

const mockRender = vi.fn()
vi.mock('./render', () => ({
  renderMediakitPdf: (...args: unknown[]) => mockRender(...args),
}))

vi.mock('./template', () => ({
  loadMediakitTemplate: () => Promise.resolve('BUNDLE'),
}))

import { runMediakitGeneration } from './generate-pipeline'

const timestamp = (daysAgo: number) => ({
  toDate: () => new Date(Date.now() - daysAgo * 86_400_000),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockReadMediakit.mockResolvedValue({
    stats: {
      updatedAt: timestamp(1),
      impressions: 4_300_000,
      viewsYoutube: 2_320_000,
      viewsSpotifyStreams: 60_000,
      episodes: 240,
      cuts: 1_200,
      shorts: 1_920,
      watchHours: 178_000,
      launch: '2021-09',
    },
    audience: {
      updatedAt: timestamp(2),
      youtubeSubscribers: 33_979,
      followers: { tiktok: 3_258, linkedin: 3_263, spotify: 3_289, instagram: 1_251 },
      age: { '35-44': 41.7, '45-59': 26.4 },
    },
    series: { updatedAt: timestamp(30) },
  })
  mockBind.mockReturnValue({
    html: '<section bound>',
    report: { applied: ['N3'], unchanged: [], notesChanged: [] },
  })
  mockRender.mockResolvedValue({
    pdf: Buffer.from('pdf'),
    pages: 3,
    bytes: 8_000_000,
    durationMs: 1200,
    attempts: 1,
  })
  mockUpload.mockResolvedValue('media-kit/latest.pdf')
})

describe('runMediakitGeneration', () => {
  it('runs the full pipeline and reports the result', async () => {
    const report = await runMediakitGeneration()
    expect(report.path).toBe('media-kit/latest.pdf')
    expect(report.pages).toBe(3)
    expect(report.applied).toEqual(['N3'])
    // expectedPages derived from the deck's section count (3 in the mock).
    expect(mockRender).toHaveBeenCalledWith('REPACKED:<section bound>', 3)
    // staleness ages computed per section.
    expect(report.staleness.statsAgeDays).toBe(1)
    expect(report.staleness.seriesAgeDays).toBe(30)
  })

  it('FAILSAFE: render/verification failure throws and NEVER uploads nor writes rendered', async () => {
    mockRender.mockRejectedValue(new Error('expected 3 pages, found 1'))
    await expect(runMediakitGeneration()).rejects.toThrow(/expected 3 pages/)
    expect(mockUpload).not.toHaveBeenCalled()
    // A página /midiakit espelha o PDF publicado — sem publish, sem rendered.
    expect(mockWriteRendered).not.toHaveBeenCalled()
  })

  it('binding failure (e.g. empty series) throws and never renders/uploads', async () => {
    mockBind.mockImplementation(() => {
      throw new Error('series are empty — run the collectors historical backfill')
    })
    await expect(runMediakitGeneration()).rejects.toThrow(/backfill/)
    expect(mockRender).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('missing contract sections fail LOUD before any render/upload', async () => {
    mockReadMediakit.mockResolvedValue({ stats: null, audience: null, series: null })
    await expect(runMediakitGeneration()).rejects.toThrow(/stats section missing/)
    expect(mockRender).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockWriteRendered).not.toHaveBeenCalled()
  })
})
