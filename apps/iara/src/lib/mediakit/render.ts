/**
 * Mediakit render — headless Chromium print of the (re)bound standalone
 * bundle, plus PDF verification.
 *
 * Recipe validated byte-equivalent to the Claude Design export (2026-08-24):
 *   chromium --headless=new --print-to-pdf --no-pdf-header-footer
 *            --virtual-time-budget=<ms> file://<bundle>
 *
 * Known timing hazard (found in 30.2): a short virtual-time budget can fire
 * the print BEFORE the bundle runtime instantiates the deck, yielding a tiny
 * blank PDF. Mitigation: generous budget + verification + one retry with a
 * doubled budget. Verification failing after retry throws — the caller must
 * NEVER publish an unverified PDF (failsafe: the previous latest.pdf stays).
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { log } from '@/lib/logger'

const execFileAsync = promisify(execFile)

/** 1920×1080 px at the deck's print scale = 1440×810 pt. */
const EXPECTED_MEDIABOX = '/MediaBox [0 0 1440 810]'
const DEFAULT_MIN_BYTES = 2_000_000
const FIRST_BUDGET_MS = 60_000
const RETRY_BUDGET_MS = 120_000
const EXEC_TIMEOUT_MS = 300_000

/** Container sets MEDIAKIT_CHROME_BIN (alpine chromium); dev falls back to
 * the desktop Chrome used in every validation so far. */
const DEFAULT_CHROME_BIN = 'google-chrome-stable'

export class PdfVerificationError extends Error {
  constructor(message: string) {
    super(`Mediakit PDF verification failed: ${message}`)
    this.name = 'PdfVerificationError'
  }
}

export class RenderError extends Error {
  constructor(message: string) {
    super(`Mediakit render failed: ${message}`)
    this.name = 'RenderError'
  }
}

export function resolveChromeBin(): string {
  return process.env.MEDIAKIT_CHROME_BIN || DEFAULT_CHROME_BIN
}

export interface PdfInfo {
  pages: number
  bytes: number
}

/**
 * Lightweight structural check of a Skia-produced PDF: page count, page size
 * and a minimum byte size (a blank print is ~3.5 KB; the real deck ~8 MB).
 */
export function verifyMediakitPdf(
  pdf: Buffer,
  expectedPages: number,
  minBytes: number = DEFAULT_MIN_BYTES
): PdfInfo {
  if (pdf.length < 5 || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new PdfVerificationError('not a PDF (missing %PDF- header)')
  }
  const text = pdf.toString('latin1')
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  if (pages !== expectedPages) {
    throw new PdfVerificationError(`expected ${expectedPages} pages, found ${pages}`)
  }
  if (!text.includes(EXPECTED_MEDIABOX)) {
    throw new PdfVerificationError(`page size is not 1440×810pt (${EXPECTED_MEDIABOX} not found)`)
  }
  if (pdf.length < minBytes) {
    throw new PdfVerificationError(
      `PDF has ${pdf.length} bytes — below the ${minBytes} minimum (blank/partial render?)`
    )
  }
  return { pages, bytes: pdf.length }
}

export interface RenderResult extends PdfInfo {
  pdf: Buffer
  durationMs: number
  attempts: number
}

async function printOnce(bundlePath: string, outPath: string, budgetMs: number): Promise<void> {
  const bin = resolveChromeBin()
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--print-to-pdf=${outPath}`,
    '--no-pdf-header-footer',
    `--virtual-time-budget=${budgetMs}`,
    `file://${bundlePath}`,
  ]
  try {
    await execFileAsync(bin, args, { timeout: EXEC_TIMEOUT_MS })
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? ''
    throw new RenderError(
      `${bin} exited abnormally: ${error instanceof Error ? error.message : 'unknown'}${
        stderr ? ` — stderr: ${stderr.slice(-500)}` : ''
      }`
    )
  }
  if (!existsSync(outPath)) {
    throw new RenderError(`${bin} finished but produced no PDF at ${outPath}`)
  }
}

/**
 * Renders the (bound) bundle HTML to a verified PDF.
 *
 * @param bundleHtml - Complete standalone bundle (post repack)
 * @param expectedPages - Slide count of the deck (derived by the caller)
 */
export async function renderMediakitPdf(
  bundleHtml: string,
  expectedPages: number,
  minBytes: number = DEFAULT_MIN_BYTES
): Promise<RenderResult> {
  const startedAt = Date.now()
  const workDir = await mkdtemp(join(tmpdir(), 'mediakit-'))
  const bundlePath = join(workDir, 'bundle.html')
  const outPath = join(workDir, 'out.pdf')

  try {
    await writeFile(bundlePath, bundleHtml, 'utf-8')

    let attempts = 0
    for (const budget of [FIRST_BUDGET_MS, RETRY_BUDGET_MS]) {
      attempts++
      await printOnce(bundlePath, outPath, budget)
      const pdf = await readFile(outPath)
      try {
        const info = verifyMediakitPdf(pdf, expectedPages, minBytes)
        return { pdf, ...info, durationMs: Date.now() - startedAt, attempts }
      } catch (error) {
        log('WARN', 'Mediakit render attempt failed verification', {
          attempt: attempts,
          budgetMs: budget,
          bytes: pdf.length,
          error: error instanceof Error ? error.message : 'unknown',
        })
        if (attempts === 2) throw error
      }
    }
    // Unreachable — the loop either returns or throws on the 2nd attempt.
    throw new RenderError('render loop exhausted')
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
