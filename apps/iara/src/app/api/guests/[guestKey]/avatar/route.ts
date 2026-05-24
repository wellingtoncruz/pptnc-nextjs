/**
 * GET /api/guests/[guestKey]/avatar
 *
 * Proxy — serves the stored guest avatar from Cloud Storage via ADC.
 * The bucket is NOT public; avatars are accessed server-side with ADC
 * and streamed to the authenticated client.
 *
 * `guestKey` is the same key used to derive the GCS path during scrape:
 * either `linkedin_num_id` (when available) or `md5(linkedinUrl)`.
 *
 * Resolution strategy: read the most recent guest doc whose `avatarGcsPath`
 * starts with `guest-avatars/{podcastId}/{guestKey}-` to find the current
 * avatar (timestamp suffix invalidates cache between updates).
 *
 * @see Story 24.2
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import {
  authExpiredResponse,
  createErrorResponse,
  notFoundResponse,
} from '@/lib/api/video-field-handler'
import {
  downloadGuestAvatar,
  CloudStorageError,
} from '@/lib/firebase/cloud-storage'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getGuestAvatarPathByKey } from '@/lib/firebase/guests-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const SAFE_GUEST_KEY = /^[a-zA-Z0-9_-]+$/

interface RouteContext {
  params: Promise<{ guestKey: string }>
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<NextResponse | Response> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { guestKey } = await context.params

  if (!SAFE_GUEST_KEY.test(guestKey)) {
    return createErrorResponse('VALIDATION_ERROR', 'guestKey inválido', 400)
  }

  try {
    const gcsPath = await getGuestAvatarPathByKey(PODCAST_ID, guestKey)
    if (!gcsPath) {
      return notFoundResponse('Avatar do convidado')
    }

    const buffer = await downloadGuestAvatar(gcsPath)

    let contentType = 'image/jpeg'
    if (buffer[0] === 0x89 && buffer[1] === 0x50) contentType = 'image/png'
    else if (buffer[0] === 0x52 && buffer[1] === 0x49) contentType = 'image/webp'

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      log('ERROR', 'Failed to proxy guest avatar', {
        guestKey,
        code: error.code,
        message: error.message,
      })
      return createErrorResponse('STORAGE_ERROR', 'Avatar não encontrado no storage', 404)
    }

    log('ERROR', 'Failed to proxy guest avatar', {
      guestKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao carregar avatar', 500)
  }
}
