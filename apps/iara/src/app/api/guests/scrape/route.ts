/**
 * API route for LinkedIn guest profile scraping.
 *
 * POST /api/guests/scrape
 *
 * Called fire-and-forget after saving episode context.
 * Scrapes LinkedIn profiles for all guests with a linkedin URL,
 * stores enriched data in the guests subcollection,
 * downloads avatar images to disk, and updates the video's
 * guests[i].photo field.
 *
 * @see architecture-iara.md#API Design
 */

import { createHash } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { scrapeLinkedInProfile } from '@/lib/brightdata'
import { PODCAST_ID } from '@/lib/firebase/config'
import { upsertGuest } from '@/lib/firebase/guests-admin'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { GuestScrapeRequestSchema } from '@/lib/schemas/guest'

export const runtime = 'nodejs' // REQUIRED for firebase-admin + fs

const AVATAR_DOWNLOAD_TIMEOUT_MS = 15_000

/**
 * Downloads an avatar image and saves it to public/guests/{hash}.jpg.
 *
 * @param avatarUrl - The remote avatar URL to download
 * @param linkedinUrl - The LinkedIn URL (used to generate the hash filename)
 * @returns The relative path (/guests/{hash}.jpg) or null on failure
 */
async function downloadAndSaveAvatar(
  avatarUrl: string,
  linkedinUrl: string
): Promise<string | null> {
  try {
    const hash = createHash('md5').update(linkedinUrl).digest('hex')
    const filename = `${hash}.jpg`
    const dirPath = path.join(process.cwd(), 'public', 'guests')
    const filePath = path.join(dirPath, filename)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AVATAR_DOWNLOAD_TIMEOUT_MS)

    const response = await fetch(avatarUrl, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!response.ok) {
      log('WARN', 'Failed to download avatar', { avatarUrl, status: response.status })
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    // Skip placeholder images (too small to be a real avatar)
    if (buffer.length < 1000) {
      log('WARN', 'Avatar image too small, likely placeholder', { avatarUrl, size: buffer.length })
      return null
    }

    await mkdir(dirPath, { recursive: true })
    await writeFile(filePath, buffer)

    const relativePath = `/guests/${filename}`
    log('INFO', 'Avatar saved to disk', { linkedinUrl, relativePath, size: buffer.length })
    return relativePath
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log('ERROR', 'Avatar download timed out', { avatarUrl, linkedinUrl, timeoutMs: AVATAR_DOWNLOAD_TIMEOUT_MS })
      return null
    }

    log('ERROR', 'Failed to save avatar', {
      avatarUrl,
      linkedinUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
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

    // Fetch the video
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    // Only process episodes (AC5)
    if (video.videoType !== 'episode') {
      log('INFO', 'Skipping scrape for non-episode video', { videoId, videoType: video.videoType })
      return NextResponse.json({
        data: { videoId, scrapedCount: 0, errorCount: 0 },
      })
    }

    // Filter guests: if linkedinUrls provided, only scrape those specific URLs
    const guests = video.guests ?? []
    const guestsWithLinkedin = linkedinUrls
      ? guests.filter((g) => g.linkedin && linkedinUrls.includes(g.linkedin))
      : guests.filter((g) => g.linkedin)

    if (guestsWithLinkedin.length === 0) {
      log('INFO', 'No guests with LinkedIn URLs, skipping', { videoId })
      return NextResponse.json({
        data: { videoId, scrapedCount: 0, errorCount: 0 },
      })
    }

    let scrapedCount = 0
    let errorCount = 0
    let guestsUpdated = false
    // Clone guests array for photo updates
    const updatedGuests = guests.map((g) => ({ ...g }))

    // Build a Set of URLs to scrape for O(1) lookup in the loop
    const urlsToScrape = new Set(guestsWithLinkedin.map((g) => g.linkedin))

    for (let i = 0; i < updatedGuests.length; i++) {
      const guest = updatedGuests[i]
      if (!guest.linkedin || !urlsToScrape.has(guest.linkedin)) continue

      log('INFO', 'Scraping guest LinkedIn profile', {
        videoId,
        guestIndex: i,
        linkedinUrl: guest.linkedin,
      })

      const profile = await scrapeLinkedInProfile(guest.linkedin)

      if (!profile) {
        errorCount++
        continue
      }

      // Download avatar first (if available) so we can include photoPath in upsert
      let photoPath: string | null = null
      if (profile.avatar) {
        photoPath = await downloadAndSaveAvatar(profile.avatar, guest.linkedin)
        if (photoPath) {
          updatedGuests[i] = { ...updatedGuests[i], photo: photoPath }
          guestsUpdated = true
        }
      }

      // Upsert in guests subcollection (includes photoPath if avatar was downloaded)
      await upsertGuest(PODCAST_ID, {
        url: guest.linkedin,
        name: profile.name,
        avatar: profile.avatar,
        position: profile.position,
        currentCompanyName: profile.current_company_name,
        about: profile.about,
        city: profile.city,
        countryCode: profile.country_code,
        linkedinId: profile.linkedin_id,
        linkedinNumId: profile.linkedin_num_id,
        ...(photoPath && { photoPath }),
        raw: profile._raw ?? (profile as unknown as Record<string, unknown>),
      })

      scrapedCount++
    }

    // Update video's guests array if any photos were added
    if (guestsUpdated) {
      await updateVideoAdmin(PODCAST_ID, videoId, { guests: updatedGuests })
      log('INFO', 'Video guests updated with photos', { videoId })
    }

    log('INFO', 'Guest scrape completed', { videoId, scrapedCount, errorCount })

    return NextResponse.json({
      data: { videoId, scrapedCount, errorCount },
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
