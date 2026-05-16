/**
 * Unit tests for BrightData client.
 *
 * Tests LinkedIn profile scraping with mocked fetch.
 * Covers: sync (200), async (202 + poll + snapshot), errors, timeout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { scrapeLinkedInProfile } from './client'
import { log } from '@/lib/logger'

describe('scrapeLinkedInProfile', () => {
  const linkedinUrl = 'https://www.linkedin.com/in/richardbranson'

  const validProfile = {
    name: 'Richard Branson',
    url: 'https://www.linkedin.com/in/richardbranson',
    avatar: 'https://media.licdn.com/avatar.jpg',
    position: 'Founder at Virgin Group',
    current_company_name: 'Virgin Group',
    about: 'Entrepreneur',
    city: 'London',
    country_code: 'GB',
    linkedin_id: 'richardbranson',
  }

  const originalEnv = process.env.BRIGHTDATA_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BRIGHTDATA_API_KEY = 'test-api-key'
    vi.stubGlobal('fetch', vi.fn())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalEnv !== undefined) {
      process.env.BRIGHTDATA_API_KEY = originalEnv
    } else {
      delete process.env.BRIGHTDATA_API_KEY
    }
    vi.unstubAllGlobals()
  })

  /**
   * Helper: runs scrapeLinkedInProfile while advancing fake timers
   * to resolve the polling delays (5000ms per poll attempt).
   */
  async function runWithTimerAdvance(
    url: string,
    advanceMs = 6_000,
    times = 5
  ): Promise<ReturnType<typeof scrapeLinkedInProfile>> {
    const resultPromise = scrapeLinkedInProfile(url)
    for (let i = 0; i < times; i++) {
      await vi.advanceTimersByTimeAsync(advanceMs)
    }
    return resultPromise
  }

  describe('Synchronous response (HTTP 200)', () => {
    it('returns profile on sync scrape', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce([validProfile]),
      } as any)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeDefined()
      expect(result?.name).toBe('Richard Branson')
      expect(result?.position).toBe('Founder at Virgin Group')
    })

    it('handles partial fields in sync response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce([{ name: 'Jane Doe' }]),
      } as any)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result?.name).toBe('Jane Doe')
      expect(result?.url).toBeUndefined()
    })
  })

  describe('Async response (HTTP 202 + polling)', () => {
    it('polls progress and fetches snapshot on async scrape', async () => {
      vi.mocked(fetch)
        // Step 1: POST /scrape → 202 with snapshot_id
        .mockResolvedValueOnce({
          ok: false,
          status: 202,
          json: vi.fn().mockResolvedValueOnce({
            snapshot_id: 'snap-123',
            status: 'starting',
          }),
        } as any)
        // Step 2: GET /progress/snap-123 → ready
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            status: 'ready',
            records: 1,
          }),
        } as any)
        // Step 3: GET /snapshot/snap-123 → profile data
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce([validProfile]),
        } as any)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeDefined()
      expect(result?.name).toBe('Richard Branson')
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)

      // Verify progress call URL
      const progressCall = vi.mocked(fetch).mock.calls[1]
      expect(progressCall[0]).toContain('/progress/snap-123')

      // Verify snapshot call URL
      const snapshotCall = vi.mocked(fetch).mock.calls[2]
      expect(snapshotCall[0]).toContain('/snapshot/snap-123')
    })

    it('polls multiple times before snapshot is ready', async () => {
      vi.mocked(fetch)
        // POST /scrape → 202
        .mockResolvedValueOnce({
          ok: false,
          status: 202,
          json: vi.fn().mockResolvedValueOnce({ snapshot_id: 'snap-456' }),
        } as any)
        // GET /progress → running
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({ status: 'running' }),
        } as any)
        // GET /progress → running
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({ status: 'running' }),
        } as any)
        // GET /progress → ready
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({ status: 'ready', records: 1 }),
        } as any)
        // GET /snapshot → data
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce([validProfile]),
        } as any)

      const result = await runWithTimerAdvance(linkedinUrl, 6_000, 5)

      expect(result?.name).toBe('Richard Branson')
      // 1 scrape + 3 progress polls + 1 snapshot fetch = 5 calls
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5)
    })

    it('returns null when 202 response has no snapshot_id', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 202,
        json: vi.fn().mockResolvedValueOnce({ status: 'error' }),
      } as any)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeNull()
      expect(vi.mocked(log)).toHaveBeenCalledWith(
        'ERROR',
        'BrightData 202 response missing snapshot_id',
        expect.any(Object)
      )
    })

    it('returns null when snapshot status is failed', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 202,
          json: vi.fn().mockResolvedValueOnce({ snapshot_id: 'snap-fail' }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({ status: 'failed' }),
        } as any)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeNull()
      expect(vi.mocked(log)).toHaveBeenCalledWith(
        'ERROR',
        'BrightData snapshot failed',
        expect.any(Object)
      )
    })

    it('returns null when snapshot data fetch fails', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 202,
          json: vi.fn().mockResolvedValueOnce({ snapshot_id: 'snap-ok' }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({ status: 'ready', records: 1 }),
        } as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as any)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeNull()
    })
  })

  describe('API key and auth', () => {
    it('throws BrightDataConfigError(MISSING_API_KEY) when key is not configured (Story 24.4)', async () => {
      delete process.env.BRIGHTDATA_API_KEY

      // No fake-timer dance needed — the throw is synchronous, before any polling.
      await expect(scrapeLinkedInProfile(linkedinUrl)).rejects.toThrow('BRIGHTDATA_API_KEY')
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
      expect(vi.mocked(log)).toHaveBeenCalledWith(
        'ERROR',
        'BRIGHTDATA_API_KEY not configured',
        expect.any(Object)
      )
    })

    it('sends correct Authorization header', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce([validProfile]),
      } as any)

      await runWithTimerAdvance(linkedinUrl)

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      )
    })
  })

  describe('HTTP errors', () => {
    it('throws BrightDataConfigError(UNAUTHORIZED) on HTTP 401 (Story 24.4)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as any)

      // First fetch resolves immediately to the 401 — no polling timers fire.
      await expect(scrapeLinkedInProfile(linkedinUrl)).rejects.toThrow(/401/)
    })

    it('throws BrightDataConfigError(FORBIDDEN) on HTTP 403 (Story 24.4)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as any)

      await expect(scrapeLinkedInProfile(linkedinUrl)).rejects.toThrow(/403/)
    })

    it('returns null on HTTP 429 (rate limit)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as any)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeNull()
    })
  })

  describe('Data validation', () => {
    it('returns null on empty response array', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce([]),
      } as any)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeNull()
    })

    it('returns null on Zod validation failure', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce([{ url: 'not-a-url' }]),
      } as any)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeNull()
      expect(vi.mocked(log)).toHaveBeenCalledWith(
        'WARN',
        'BrightData response failed Zod validation',
        expect.any(Object)
      )
    })
  })

  describe('Network and timeout errors', () => {
    it('returns null on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeNull()
      expect(vi.mocked(log)).toHaveBeenCalledWith(
        'ERROR',
        'BrightData request failed',
        expect.objectContaining({ error: 'Network error' })
      )
    })

    it('returns null on AbortError', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      vi.mocked(fetch).mockRejectedValueOnce(abortError)

      const result = await runWithTimerAdvance(linkedinUrl)

      expect(result).toBeNull()
      expect(vi.mocked(log)).toHaveBeenCalledWith(
        'ERROR',
        'BrightData request timed out',
        expect.any(Object)
      )
    })
  })
})
