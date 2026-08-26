import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadMediakit = vi.fn()
vi.mock('@/lib/firebase/mediakit-admin', () => ({
  readMediakit: () => mockReadMediakit(),
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
    stats: { updatedAt: timestamp(1) },
    audience: { updatedAt: timestamp(2) },
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

  it('FAILSAFE: render/verification failure throws and NEVER uploads', async () => {
    mockRender.mockRejectedValue(new Error('expected 3 pages, found 1'))
    await expect(runMediakitGeneration()).rejects.toThrow(/expected 3 pages/)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('binding failure (e.g. empty series) throws and never renders/uploads', async () => {
    mockBind.mockImplementation(() => {
      throw new Error('series are empty — run the collectors historical backfill')
    })
    await expect(runMediakitGeneration()).rejects.toThrow(/backfill/)
    expect(mockRender).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('missing-section data still flows to the binder (which owns the loud failure)', async () => {
    mockReadMediakit.mockResolvedValue({ stats: null, audience: null, series: null })
    await runMediakitGeneration()
    expect(mockBind).toHaveBeenCalledWith(
      expect.any(String),
      { stats: null, audience: null, series: null },
      expect.any(Date)
    )
  })
})
