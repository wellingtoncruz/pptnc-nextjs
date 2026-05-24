/**
 * POST /api/guests/avatar/upload
 *
 * Manual avatar upload for guests when the BrightData scrape didn't return a
 * photo (Story 24.7 polish). Accepts multipart/form-data with `linkedinUrl`
 * (string) and `file` (image). Stores under the same `guest-avatars/`
 * convention used by the scrape path so the existing
 * `/api/guests/[guestKey]/avatar` proxy resolves it transparently.
 *
 * @see Epic 24, Story 24.7
 */

import { createHash } from 'crypto'

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { uploadGuestAvatar, CloudStorageError } from '@/lib/firebase/cloud-storage'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getGuestByLinkedInUrl, upsertGuest } from '@/lib/firebase/guests-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — avatar pequeno cabe folgado.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Same key derivation used by the scrape route — keeps the proxy lookup consistent. */
function deriveGuestKey(linkedinUrl: string, linkedinNumId?: string | number): string {
  if (linkedinNumId !== undefined && linkedinNumId !== null && String(linkedinNumId).length > 0) {
    const sanitized = String(linkedinNumId).replace(/[^a-zA-Z0-9_-]/g, '')
    if (sanitized.length > 0) return sanitized
  }
  return createHash('md5').update(linkedinUrl).digest('hex')
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  try {
    const formData = await request.formData()
    const linkedinUrl = formData.get('linkedinUrl')
    const file = formData.get('file')

    if (typeof linkedinUrl !== 'string' || !linkedinUrl.startsWith('https://')) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'linkedinUrl é obrigatório' } },
        { status: 400 }
      )
    }
    // Duck-typed Blob check — `instanceof Blob` is unreliable across runtimes
    // (Node FormData vs jsdom vs Edge). All we need is .size + .arrayBuffer().
    if (
      !file ||
      typeof file !== 'object' ||
      typeof (file as Blob).size !== 'number' ||
      typeof (file as Blob).arrayBuffer !== 'function'
    ) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'file é obrigatório' } },
        { status: 400 }
      )
    }
    const blob = file as Blob
    if (blob.size === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Arquivo vazio' } },
        { status: 400 }
      )
    }
    if (blob.size > MAX_BYTES) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Arquivo maior que 2 MB' } },
        { status: 400 }
      )
    }

    // Some clients (e.g., clipboard paste) drop the explicit MIME — fall back
    // to image/jpeg so the producer isn't blocked. Cloud Storage will sniff
    // the actual bytes downstream.
    const rawType = (file as File).type
    const mimeType = ALLOWED_MIME.has(rawType) ? rawType : 'image/jpeg'

    const buffer = Buffer.from(await blob.arrayBuffer())

    // Reuse existing guest doc (if any) to inherit linkedinNumId — keeps the
    // guestKey stable across scrape-derived and manually-uploaded avatars.
    const existing = await getGuestByLinkedInUrl(PODCAST_ID, linkedinUrl)
    const guestKey = deriveGuestKey(linkedinUrl, existing?.linkedinNumId)

    const { filePath } = await uploadGuestAvatar(guestKey, buffer, mimeType)

    // Update or create the guest doc so the proxy can resolve the new path.
    await upsertGuest(PODCAST_ID, {
      url: linkedinUrl,
      avatarGcsPath: filePath,
      raw: existing?.raw ?? {},
      ...(existing?.name && { name: existing.name }),
      ...(existing?.position && { position: existing.position }),
      ...(existing?.currentCompanyName && { currentCompanyName: existing.currentCompanyName }),
      ...(existing?.linkedinId && { linkedinId: existing.linkedinId }),
      ...(existing?.linkedinNumId !== undefined && { linkedinNumId: existing.linkedinNumId }),
    })

    log('INFO', 'Manual guest avatar uploaded', {
      linkedinUrl,
      guestKey,
      filePath,
      sizeBytes: buffer.length,
    })

    return NextResponse.json({
      data: {
        proxyUrl: `/api/guests/${guestKey}/avatar`,
      },
    })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      log('ERROR', 'Manual avatar upload failed (storage)', {
        code: error.code,
        message: error.message,
      })
      return NextResponse.json(
        { error: { code: 'STORAGE_ERROR', message: 'Erro ao salvar avatar' } },
        { status: 500 }
      )
    }
    log('ERROR', 'Manual avatar upload failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao processar upload' } },
      { status: 500 }
    )
  }
}
