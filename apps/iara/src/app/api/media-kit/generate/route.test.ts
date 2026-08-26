import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

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
vi.mock('@/lib/mediakit/apply-bindings', () => ({
  bindMediakitDeck: (...args: unknown[]) => mockBind(...args),
}))

vi.mock('@/lib/mediakit/bundle', () => ({
  unpackBundle: () => ({ deckHtml: '<section a><section b><section c>' }),
  repackBundle: (_bundle: string, deck: string) => `REPACKED:${deck}`,
}))

const mockRender = vi.fn()
vi.mock('@/lib/mediakit/render', () => ({
  renderMediakitPdf: (...args: unknown[]) => mockRender(...args),
}))

vi.mock('@/lib/mediakit/template', () => ({
  loadMediakitTemplate: () => Promise.resolve('BUNDLE'),
}))

import { POST } from './route'

function makeRequest(key?: string): NextRequest {
  return new NextRequest('http://localhost/api/media-kit/generate', {
    method: 'POST',
    headers: key ? { 'x-mediakit-key': key } : {},
  })
}

const timestamp = (daysAgo: number) => ({
  toDate: () => new Date(Date.now() - daysAgo * 86_400_000),
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MEDIAKIT_TRIGGER_KEY = 'secret-key'
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

describe('POST /api/media-kit/generate', () => {
  it('responds 503 (fail closed) when the trigger key env is absent', async () => {
    delete process.env.MEDIAKIT_TRIGGER_KEY
    const response = await POST(makeRequest('anything'))
    expect(response.status).toBe(503)
    expect(mockReadMediakit).not.toHaveBeenCalled()
  })

  it('responds 401 for a missing or wrong key', async () => {
    expect((await POST(makeRequest())).status).toBe(401)
    expect((await POST(makeRequest('wrong'))).status).toBe(401)
    expect(mockReadMediakit).not.toHaveBeenCalled()
  })

  it('runs the full pipeline and reports the result', async () => {
    const response = await POST(makeRequest('secret-key'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.path).toBe('media-kit/latest.pdf')
    expect(body.pages).toBe(3)
    expect(body.applied).toEqual(['N3'])
    // expectedPages derived from the deck's section count (3 in the mock).
    expect(mockRender).toHaveBeenCalledWith('REPACKED:<section bound>', 3)
    // staleness ages computed per section.
    expect(body.staleness.statsAgeDays).toBe(1)
    expect(body.staleness.seriesAgeDays).toBe(30)
  })

  it('FAILSAFE: render/verification failure returns 500 and NEVER uploads', async () => {
    mockRender.mockRejectedValue(new Error('expected 3 pages, found 1'))
    const response = await POST(makeRequest('secret-key'))
    expect(response.status).toBe(500)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('binding failure (e.g. empty series) returns 500 and never uploads', async () => {
    mockBind.mockImplementation(() => {
      throw new Error('series are empty — run the collectors historical backfill')
    })
    const response = await POST(makeRequest('secret-key'))
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toMatch(/backfill/)
    expect(mockRender).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })
})
