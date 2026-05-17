/**
 * API route for LinkedIn guest profile scraping.
 *
 * POST /api/guests/scrape
 *
 * Called fire-and-forget after saving episode context.
 * Scrapes LinkedIn profiles for all guests with a linkedin URL,
 * stores enriched data in the guests subcollection,
 * uploads avatar images to Cloud Storage (Story 24.2),
 * and updates the video's `guests[i].photo` field with a proxy URL.
 *
 * @see architecture-iara.md#API Design
 * @see Epic 24 (Story 24.2)
 */

import { createHash } from 'crypto'

import { Timestamp } from 'firebase-admin/firestore'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { scrapeLinkedInProfile } from '@/lib/brightdata'
import { BrightDataConfigError } from '@/lib/brightdata/client'
import { uploadGuestAvatar, CloudStorageError } from '@/lib/firebase/cloud-storage'
import { PODCAST_ID } from '@/lib/firebase/config'
import { upsertGuest } from '@/lib/firebase/guests-admin'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { GuestScrapeRequestSchema } from '@/lib/schemas/guest'

export const runtime = 'nodejs' // REQUIRED for firebase-admin

const AVATAR_DOWNLOAD_TIMEOUT_MS = 15_000
const PLACEHOLDER_SIZE_THRESHOLD = 1000
/** Max concurrent guest scrapes — cap matches the max number of guests in an episode. */
const SCRAPE_CONCURRENCY_CAP = 3

/** Derives a stable, filesystem-safe key for the guest avatar in GCS. */
function deriveGuestKey(linkedinUrl: string, linkedinNumId?: string | number): string {
  if (linkedinNumId !== undefined && linkedinNumId !== null && String(linkedinNumId).length > 0) {
    const sanitized = String(linkedinNumId).replace(/[^a-zA-Z0-9_-]/g, '')
    if (sanitized.length > 0) return sanitized
  }
  return createHash('md5').update(linkedinUrl).digest('hex')
}

/** Detects the MIME type from the first bytes of an image buffer. */
function detectAvatarMime(buffer: Buffer): string | null {
  if (buffer.length < 4) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  // WebP: starts with "RIFF" then "WEBP" at byte 8
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

/**
 * Downloads a remote avatar and uploads it to Cloud Storage.
 * Returns the GCS path + proxy URL, or null on failure.
 */
async function ingestAvatar(
  avatarUrl: string,
  guestKey: string
): Promise<{ gcsPath: string; proxyUrl: string } | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AVATAR_DOWNLOAD_TIMEOUT_MS)
    const response = await fetch(avatarUrl, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!response.ok) {
      log('WARN', 'Failed to download avatar', { avatarUrl, status: response.status })
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    if (buffer.length < PLACEHOLDER_SIZE_THRESHOLD) {
      log('WARN', 'Avatar image too small, likely placeholder', {
        avatarUrl,
        size: buffer.length,
      })
      return null
    }

    const mimeType = detectAvatarMime(buffer) ?? 'image/jpeg'
    const { filePath } = await uploadGuestAvatar(guestKey, buffer, mimeType)

    return {
      gcsPath: filePath,
      proxyUrl: `/api/guests/${guestKey}/avatar`,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log('ERROR', 'Avatar download timed out', {
        avatarUrl,
        guestKey,
        timeoutMs: AVATAR_DOWNLOAD_TIMEOUT_MS,
      })
      return null
    }
    if (error instanceof CloudStorageError) {
      log('ERROR', 'Avatar Cloud Storage upload failed', {
        avatarUrl,
        guestKey,
        code: error.code,
      })
      return null
    }
    log('ERROR', 'Failed to ingest avatar', {
      avatarUrl,
      guestKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

interface ScrapeOutcome {
  index: number
  linkedinUrl: string
  status: 'success' | 'error'
  proxyUrl?: string
  /**
   * Scrape result echoed back so the Phase 1 UI can auto-fill the disabled
   * name/role/company fields (Story 24.7). `null` means BrightData responded
   * without a value for that field; the UI unlocks the field empty.
   */
  enrichment?: {
    name: string | null
    role: string | null
    company: string | null
  }
}

/**
 * Scrapes a single guest. Returns a structured outcome so the caller can
 * fold all of them into the response after `Promise.allSettled`.
 *
 * `BrightDataConfigError` is intentionally NOT caught here so it can propagate
 * through `Promise.allSettled` (rejected) and be detected at the route level —
 * a config error must surface as HTTP 503, not be counted as one of N errors.
 */
async function scrapeSingleGuest(
  guestIndex: number,
  guestLinkedinUrl: string
): Promise<ScrapeOutcome> {
  log('INFO', 'Scraping guest LinkedIn profile', {
    guestIndex,
    linkedinUrl: guestLinkedinUrl,
  })

  const profile = await scrapeLinkedInProfile(guestLinkedinUrl)

  if (!profile) {
    return { index: guestIndex, linkedinUrl: guestLinkedinUrl, status: 'error' }
  }

  const guestKey = deriveGuestKey(guestLinkedinUrl, profile.linkedin_num_id)

  let avatar: Awaited<ReturnType<typeof ingestAvatar>> = null
  if (profile.avatar) {
    avatar = await ingestAvatar(profile.avatar, guestKey)
  }

  await upsertGuest(PODCAST_ID, {
    url: guestLinkedinUrl,
    name: profile.name,
    avatar: profile.avatar,
    position: profile.position,
    currentCompanyName: profile.current_company_name,
    about: profile.about,
    city: profile.city,
    countryCode: profile.country_code,
    linkedinId: profile.linkedin_id,
    linkedinNumId: profile.linkedin_num_id,
    ...(avatar?.gcsPath && { avatarGcsPath: avatar.gcsPath }),
    raw: profile._raw ?? (profile as unknown as Record<string, unknown>),
  })

  return {
    index: guestIndex,
    linkedinUrl: guestLinkedinUrl,
    status: 'success',
    proxyUrl: avatar?.proxyUrl,
    enrichment: {
      name: profile.name ?? null,
      role: profile.position ?? null,
      company: profile.current_company_name ?? null,
    },
  }
}

/**
 * POST /api/guests/scrape
 *
 * Scrapes LinkedIn profiles for all guests in a video.
 * Only processes videos with videoType === 'episode'.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { videoId, linkedinUrls } = GuestScrapeRequestSchema.parse(body)

    log('INFO', 'Guest scrape started', { videoId, filterUrls: linkedinUrls?.length })

    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    if (video.videoType !== 'episode') {
      // Story 24.5 — Cuts/reels VIEW dinâmica do parentEpisode. Sem chamada paga.
      if (video.parentEpisodeId) {
        log('INFO', 'Cut/reel inherits guests from parent episode (no scrape)', {
          videoId,
          videoType: video.videoType,
          parentEpisodeId: video.parentEpisodeId,
        })
        return NextResponse.json({
          data: {
            videoId,
            scrapedCount: 0,
            errorCount: 0,
            inheritedFrom: video.parentEpisodeId,
          },
        })
      }
      log('WARN', 'Cut/reel has no parentEpisodeId — cannot inherit guests', {
        videoId,
        videoType: video.videoType,
      })
      return NextResponse.json({
        data: { videoId, scrapedCount: 0, errorCount: 0, warning: 'NO_PARENT' },
      })
    }

    const guests = video.guests ?? []
    const guestsWithLinkedin = linkedinUrls
      ? guests.filter((g) => g.linkedin && linkedinUrls.includes(g.linkedin))
      : guests.filter((g) => g.linkedin)

    if (guestsWithLinkedin.length === 0) {
      log('INFO', 'No guests with LinkedIn URLs, skipping', { videoId })
      return NextResponse.json({
        data: { videoId, scrapedCount: 0, errorCount: 0, skippedCount: 0 },
      })
    }

    // Dedup ledger (Story 24.3): URLs already scraped for THIS video are skipped.
    // Rescrape between videos is allowed — the ledger is per-video.
    const alreadyScrapedUrls = new Set(
      (video.guestsScrapedAt ?? []).map((entry) => entry.url)
    )

    // Index map ensures outcomes apply back to the right position after parallel allSettled.
    const tasks: Array<{ index: number; linkedinUrl: string }> = []
    const skippedUrls: string[] = []
    guests.forEach((guest, index) => {
      if (!guest.linkedin) return
      if (!guestsWithLinkedin.some((g) => g.linkedin === guest.linkedin)) return
      if (alreadyScrapedUrls.has(guest.linkedin)) {
        skippedUrls.push(guest.linkedin)
        return
      }
      tasks.push({ index, linkedinUrl: guest.linkedin })
    })

    if (skippedUrls.length > 0) {
      log('INFO', 'Guest scrape dedup hit', { videoId, skippedCount: skippedUrls.length })
    }

    // Run in parallel — cap matches the max number of guests in an episode.
    // No external rate-limit library needed; BrightData itself queues.
    const runners = tasks.slice(0, SCRAPE_CONCURRENCY_CAP).map((task) =>
      scrapeSingleGuest(task.index, task.linkedinUrl)
    )
    const settled = await Promise.allSettled(runners)

    let scrapedCount = 0
    let errorCount = 0
    const failedUrls: string[] = []
    const newLedgerEntries: Array<{ url: string; scrapedAt: Timestamp }> = []
    const updatedGuests = guests.map((g) => ({ ...g }))
    let guestsUpdated = false
    let configErrorCode: 'MISSING_API_KEY' | 'UNAUTHORIZED' | 'FORBIDDEN' | null = null
    // Story 24.7 — Echo enrichment so Phase 1 can auto-fill name/role/company.
    const scrapedGuests: Array<{
      linkedinUrl: string
      name: string | null
      role: string | null
      company: string | null
    }> = []

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const outcome = result.value
        if (outcome.status === 'success') {
          scrapedCount++
          newLedgerEntries.push({ url: outcome.linkedinUrl, scrapedAt: Timestamp.now() })
          if (outcome.proxyUrl) {
            updatedGuests[outcome.index] = {
              ...updatedGuests[outcome.index],
              photo: outcome.proxyUrl,
            }
            guestsUpdated = true
          }
          if (outcome.enrichment) {
            scrapedGuests.push({
              linkedinUrl: outcome.linkedinUrl,
              name: outcome.enrichment.name,
              role: outcome.enrichment.role,
              company: outcome.enrichment.company,
            })
          }
        } else {
          errorCount++
          failedUrls.push(outcome.linkedinUrl)
        }
      } else {
        // Config errors short-circuit the response — every parallel task
        // would have hit the same misconfiguration, so we surface a 503.
        if (result.reason instanceof BrightDataConfigError) {
          configErrorCode = result.reason.code
          continue
        }
        errorCount++
        log('ERROR', 'Guest scrape task rejected', {
          videoId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        })
      }
    }

    if (configErrorCode) {
      log('ERROR', 'Guest scrape blocked by provider config error', {
        videoId,
        code: configErrorCode,
      })
      return NextResponse.json(
        {
          error: {
            code: 'CONFIG_ERROR',
            message: 'Serviço de enriquecimento indisponível. Preencha manualmente.',
            providerCode: configErrorCode,
          },
        },
        { status: 503 }
      )
    }

    // Persist combined update: guests array (if photos changed) + ledger append (if any success).
    const updatePayload: Record<string, unknown> = {}
    if (guestsUpdated) updatePayload.guests = updatedGuests
    if (newLedgerEntries.length > 0) {
      updatePayload.guestsScrapedAt = [...(video.guestsScrapedAt ?? []), ...newLedgerEntries]
    }
    if (Object.keys(updatePayload).length > 0) {
      await updateVideoAdmin(PODCAST_ID, videoId, updatePayload)
      log('INFO', 'Video updated after scrape', {
        videoId,
        guestsUpdated,
        ledgerAdded: newLedgerEntries.length,
      })
    }

    log('INFO', 'Guest scrape completed', {
      videoId,
      scrapedCount,
      errorCount,
      skippedCount: skippedUrls.length,
    })

    return NextResponse.json({
      data: {
        videoId,
        scrapedCount,
        errorCount,
        skippedCount: skippedUrls.length,
        failedUrls,
        skippedUrls,
        scrapedGuests,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid scrape request', { error })
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos' } },
        { status: 400 }
      )
    }

    log('ERROR', 'Guest scrape failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao processar scraping' } },
      { status: 500 }
    )
  }
}
