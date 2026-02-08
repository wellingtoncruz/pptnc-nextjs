/**
 * BrightData API client for LinkedIn profile scraping.
 *
 * Uses the BrightData Web Scraper API to fetch LinkedIn profile data.
 * The API returns 202 (async) with a snapshot_id, then we poll until ready
 * and fetch the snapshot data.
 *
 * Flow:
 * 1. POST /scrape → 202 + snapshot_id
 * 2. GET /progress/{snapshot_id} → poll until status: "ready"
 * 3. GET /snapshot/{snapshot_id}?format=json → profile data
 *
 * @see https://docs.brightdata.com/api-reference/web-scraper-api/social-media-apis/linkedin/profiles
 */

import { LinkedInGuestSchema } from '@/lib/schemas/guest'
import { log } from '@/lib/logger'
import type { LinkedInGuestProfile } from '@/types/guest'

const BRIGHTDATA_SCRAPE_ENDPOINT =
  'https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1viktl72bvl7bjuj0&notify=false&include_errors=true'

const BRIGHTDATA_PROGRESS_ENDPOINT = 'https://api.brightdata.com/datasets/v3/progress'
const BRIGHTDATA_SNAPSHOT_ENDPOINT = 'https://api.brightdata.com/datasets/v3/snapshot'

/** Total timeout for the entire scrape+poll+fetch flow */
const TOTAL_TIMEOUT_MS = 90_000

/** Interval between progress checks */
const POLL_INTERVAL_MS = 5_000

/** Maximum number of poll attempts */
const MAX_POLL_ATTEMPTS = 15

/**
 * Helper to make an authenticated fetch to BrightData.
 */
async function brightdataFetch(
  url: string,
  apiKey: string,
  options?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
}

/**
 * Polls the BrightData progress endpoint until the snapshot is ready.
 *
 * @returns true if ready, false if timed out or errored
 */
async function waitForSnapshot(
  snapshotId: string,
  apiKey: string
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    try {
      const response = await brightdataFetch(
        `${BRIGHTDATA_PROGRESS_ENDPOINT}/${snapshotId}`,
        apiKey
      )

      if (!response.ok) {
        log('WARN', 'BrightData progress check failed', {
          snapshotId,
          status: response.status,
          attempt,
        })
        continue
      }

      const progress = await response.json()

      if (progress.status === 'ready') {
        log('INFO', 'BrightData snapshot ready', {
          snapshotId,
          attempt,
          records: progress.records,
        })
        return true
      }

      if (progress.status === 'failed') {
        log('ERROR', 'BrightData snapshot failed', { snapshotId, progress })
        return false
      }

      log('INFO', 'BrightData snapshot not ready yet', {
        snapshotId,
        status: progress.status,
        attempt,
      })
    } catch (error) {
      log('WARN', 'BrightData progress poll error', {
        snapshotId,
        attempt,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  log('ERROR', 'BrightData polling exhausted max attempts', {
    snapshotId,
    maxAttempts: MAX_POLL_ATTEMPTS,
  })
  return false
}

/**
 * Fetches the snapshot data from BrightData.
 */
async function fetchSnapshotData(
  snapshotId: string,
  apiKey: string
): Promise<unknown[] | null> {
  try {
    const response = await brightdataFetch(
      `${BRIGHTDATA_SNAPSHOT_ENDPOINT}/${snapshotId}?format=json`,
      apiKey
    )

    if (!response.ok) {
      log('ERROR', 'BrightData snapshot fetch failed', {
        snapshotId,
        status: response.status,
      })
      return null
    }

    const data = await response.json()

    if (!Array.isArray(data) || data.length === 0) {
      log('WARN', 'BrightData snapshot empty or invalid', { snapshotId, data })
      return null
    }

    return data
  } catch (error) {
    log('ERROR', 'BrightData snapshot fetch error', {
      snapshotId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

/**
 * Scrapes a LinkedIn profile using the BrightData API.
 *
 * Flow: POST /scrape → poll /progress → GET /snapshot
 *
 * @param linkedinUrl - The LinkedIn profile URL to scrape
 * @returns The parsed LinkedIn profile data, or null on error/timeout
 */
export async function scrapeLinkedInProfile(
  linkedinUrl: string
): Promise<LinkedInGuestProfile | null> {
  const apiKey = process.env.BRIGHTDATA_API_KEY

  if (!apiKey) {
    log('ERROR', 'BRIGHTDATA_API_KEY not configured, skipping scrape', { linkedinUrl })
    return null
  }

  log('INFO', 'Starting LinkedIn profile scrape', { linkedinUrl })

  const overallTimeout = setTimeout(() => {}, TOTAL_TIMEOUT_MS)

  try {
    // Step 1: Trigger scrape
    const response = await brightdataFetch(BRIGHTDATA_SCRAPE_ENDPOINT, apiKey, {
      method: 'POST',
      body: JSON.stringify({ input: [{ url: linkedinUrl }] }),
    })

    // HTTP 200: Synchronous success (rare but possible for cached results)
    if (response.status === 200) {
      const data = await response.json()
      return parseProfileData(data, linkedinUrl)
    }

    // HTTP 202: Async — extract snapshot_id and poll
    if (response.status === 202) {
      const asyncResponse = await response.json()
      const snapshotId = asyncResponse.snapshot_id

      if (!snapshotId) {
        log('ERROR', 'BrightData 202 response missing snapshot_id', { linkedinUrl, asyncResponse })
        return null
      }

      log('INFO', 'BrightData scrape queued, polling for results', { linkedinUrl, snapshotId })

      // Step 2: Poll until ready
      const isReady = await waitForSnapshot(snapshotId, apiKey)
      if (!isReady) {
        return null
      }

      // Step 3: Fetch snapshot data
      const data = await fetchSnapshotData(snapshotId, apiKey)
      if (!data) {
        return null
      }

      return parseProfileData(data, linkedinUrl)
    }

    // Other HTTP errors (401, 429, 5xx, etc.)
    log('ERROR', 'BrightData API error', {
      linkedinUrl,
      status: response.status,
      statusText: response.statusText,
    })
    return null
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log('ERROR', 'BrightData request timed out', { linkedinUrl, timeoutMs: TOTAL_TIMEOUT_MS })
      return null
    }

    log('ERROR', 'BrightData request failed', {
      linkedinUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  } finally {
    clearTimeout(overallTimeout)
  }
}

/**
 * Parses and validates BrightData profile data with Zod.
 */
function parseProfileData(
  data: unknown,
  linkedinUrl: string
): LinkedInGuestProfile | null {
  const items = Array.isArray(data) ? data : [data]

  if (items.length === 0) {
    log('WARN', 'BrightData returned empty response', { linkedinUrl })
    return null
  }

  // Validate with Zod before returning (enforcement rule #2)
  const parsed = LinkedInGuestSchema.safeParse(items[0])

  if (!parsed.success) {
    log('WARN', 'BrightData response failed Zod validation', {
      linkedinUrl,
      issues: parsed.error.issues,
    })
    return null
  }

  log('INFO', 'LinkedIn profile scraped successfully', {
    linkedinUrl,
    name: parsed.data.name,
  })

  return parsed.data
}
