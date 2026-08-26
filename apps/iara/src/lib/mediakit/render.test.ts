import { describe, expect, it } from 'vitest'

import { PdfVerificationError, resolveChromeBin, verifyMediakitPdf } from './render'

/** Builds a fake Skia-like PDF body with the given page count and box. */
function fakePdf(pages: number, mediabox = '/MediaBox [0 0 1440 810]', pad = 0): Buffer {
  const pageObjs = Array.from(
    { length: pages },
    (_, i) => `${i + 3} 0 obj <</Type /Page ${mediabox} /Parent 2 0 R>> endobj\n`
  ).join('')
  const body = `%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n2 0 obj <</Type /Pages /Count ${pages}>> endobj\n${pageObjs}%%EOF`
  return Buffer.concat([Buffer.from(body, 'latin1'), Buffer.alloc(pad)])
}

describe('verifyMediakitPdf', () => {
  it('accepts a PDF with the expected pages, size and mediabox', () => {
    const pdf = fakePdf(11, undefined, 5000)
    const info = verifyMediakitPdf(pdf, 11, 1000)
    expect(info.pages).toBe(11)
    expect(info.bytes).toBe(pdf.length)
  })

  it('rejects non-PDF content', () => {
    expect(() => verifyMediakitPdf(Buffer.from('<html>oops</html>'), 11, 10)).toThrow(
      PdfVerificationError
    )
  })

  it('rejects a wrong page count (blank/partial render)', () => {
    expect(() => verifyMediakitPdf(fakePdf(1, undefined, 5000), 11, 10)).toThrow(/expected 11 pages, found 1/)
  })

  it('does not count the /Pages tree node as a page', () => {
    const info = verifyMediakitPdf(fakePdf(2, undefined, 5000), 2, 10)
    expect(info.pages).toBe(2)
  })

  it('rejects a wrong page size', () => {
    expect(() => verifyMediakitPdf(fakePdf(11, '/MediaBox [0 0 612 792]', 5000), 11, 10)).toThrow(
      /1440×810/
    )
  })

  it('rejects a suspiciously small file (the 3.5KB blank-print case)', () => {
    expect(() => verifyMediakitPdf(fakePdf(11), 11, 2_000_000)).toThrow(/below the 2000000 minimum/)
  })
})

describe('resolveChromeBin', () => {
  it('prefers MEDIAKIT_CHROME_BIN and falls back to desktop Chrome', () => {
    const prev = process.env.MEDIAKIT_CHROME_BIN
    process.env.MEDIAKIT_CHROME_BIN = '/usr/bin/chromium-browser'
    expect(resolveChromeBin()).toBe('/usr/bin/chromium-browser')
    delete process.env.MEDIAKIT_CHROME_BIN
    expect(resolveChromeBin()).toBe('google-chrome-stable')
    if (prev) process.env.MEDIAKIT_CHROME_BIN = prev
  })
})
