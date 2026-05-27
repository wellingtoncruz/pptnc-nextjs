/**
 * Cloud Storage operations for newsletter images.
 *
 * Provides upload/delete/download functions for storing generated newsletter
 * images in Google Cloud Storage. Access is via ADC (Application Default
 * Credentials) — the bucket is NOT public. Images are served to the client
 * through an authenticated API proxy route.
 *
 * Uses Firebase Admin Storage (wraps @google-cloud/storage) with ADC.
 *
 * INFRASTRUCTURE NOTE: Configure lifecycle policy on the bucket:
 * gsutil lifecycle set lifecycle.json gs://${NEWSLETTER_IMAGES_BUCKET}
 *
 * lifecycle.json:
 * {
 *   "rule": [{
 *     "action": {"type": "Delete"},
 *     "condition": {"age": 180}
 *   }]
 * }
 *
 * CRITICAL: Never expose admin SDK to the client.
 */

import { log } from '@/lib/logger'

import { getAdminStorage } from './admin'
import { NEWSLETTER_IMAGES_BUCKET, PODCAST_ID } from './config'

export class CloudStorageError extends Error {
  constructor(
    message: string,
    public readonly code: 'UPLOAD_FAILED' | 'DELETE_FAILED' | 'DOWNLOAD_FAILED'
  ) {
    super(message)
    this.name = 'CloudStorageError'
  }
}

function getBucket() {
  const storage = getAdminStorage()
  return NEWSLETTER_IMAGES_BUCKET
    ? storage.bucket(NEWSLETTER_IMAGES_BUCKET)
    : storage.bucket()
}

/**
 * Uploads a newsletter image to Cloud Storage.
 *
 * Returns the GCS file path (NOT a public URL). The image is served
 * to the client through an authenticated API proxy route.
 *
 * @param videoId - The video ID
 * @param imageBuffer - The image data as a Buffer
 * @returns The GCS file path (e.g., "newsletters/pptnc/video-1/123.png")
 * @throws {CloudStorageError} If the upload fails
 */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

export async function uploadNewsletterImage(videoId: string, imageBuffer: Buffer): Promise<string> {
  if (!SAFE_ID_PATTERN.test(videoId)) {
    throw new CloudStorageError('Invalid video ID for storage path', 'UPLOAD_FAILED')
  }
  const filePath = `newsletters/${PODCAST_ID}/${videoId}/${Date.now()}.png`

  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)

    await file.save(imageBuffer, {
      contentType: 'image/png',
      resumable: false,
    })

    log('INFO', 'Newsletter image uploaded', {
      podcastId: PODCAST_ID,
      videoId,
      filePath,
      size: imageBuffer.length,
    })

    return filePath
  } catch (error) {
    if (error instanceof CloudStorageError) throw error

    log('ERROR', 'Newsletter image upload failed', {
      podcastId: PODCAST_ID,
      videoId,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    throw new CloudStorageError(
      `Failed to upload newsletter image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UPLOAD_FAILED'
    )
  }
}

/**
 * Downloads a newsletter image from Cloud Storage.
 *
 * Used by the proxy API route to serve images to authenticated clients.
 *
 * @param filePath - The GCS file path
 * @returns The image data as a Buffer
 * @throws {CloudStorageError} If the download fails
 */
export async function downloadNewsletterImage(filePath: string): Promise<Buffer> {
  if (!filePath.startsWith('newsletters/')) {
    throw new CloudStorageError('Invalid file path for download', 'DOWNLOAD_FAILED')
  }
  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    const [contents] = await file.download()

    log('INFO', 'Newsletter image downloaded', { podcastId: PODCAST_ID, filePath })

    return contents
  } catch (error) {
    log('ERROR', 'Newsletter image download failed', {
      podcastId: PODCAST_ID,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    throw new CloudStorageError(
      `Failed to download newsletter image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DOWNLOAD_FAILED'
    )
  }
}

// ==========================================================================
// Story 18.8 — News image Cloud Storage helpers
// ==========================================================================

/**
 * Uploads a news image to Cloud Storage.
 *
 * @param newsId - The news document ID
 * @param imageBuffer - The image data as a Buffer
 * @returns The GCS file path (e.g., "news-images/pptnc/news-1/123.png")
 * @throws {CloudStorageError} If the upload fails
 */
export async function uploadNewsImage(newsId: string, imageBuffer: Buffer): Promise<string> {
  if (!SAFE_ID_PATTERN.test(newsId)) {
    throw new CloudStorageError('Invalid news ID for storage path', 'UPLOAD_FAILED')
  }
  const filePath = `news-images/${PODCAST_ID}/${newsId}/${Date.now()}.png`

  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)

    await file.save(imageBuffer, {
      contentType: 'image/png',
      resumable: false,
    })

    log('INFO', 'News image uploaded', {
      podcastId: PODCAST_ID,
      newsId,
      filePath,
      size: imageBuffer.length,
    })

    return filePath
  } catch (error) {
    if (error instanceof CloudStorageError) throw error

    log('ERROR', 'News image upload failed', {
      podcastId: PODCAST_ID,
      newsId,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    throw new CloudStorageError(
      `Failed to upload news image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UPLOAD_FAILED'
    )
  }
}

/**
 * Downloads a news image from Cloud Storage.
 *
 * @param filePath - The GCS file path
 * @returns The image data as a Buffer
 * @throws {CloudStorageError} If the download fails
 */
export async function downloadNewsImage(filePath: string): Promise<Buffer> {
  if (!filePath.startsWith('news-images/') || filePath.includes('..')) {
    throw new CloudStorageError('Invalid file path for news image download', 'DOWNLOAD_FAILED')
  }
  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    const [contents] = await file.download()

    log('INFO', 'News image downloaded', { podcastId: PODCAST_ID, filePath })

    return contents
  } catch (error) {
    log('ERROR', 'News image download failed', {
      podcastId: PODCAST_ID,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    throw new CloudStorageError(
      `Failed to download news image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DOWNLOAD_FAILED'
    )
  }
}

/**
 * Deletes a news image from Cloud Storage.
 *
 * Fire-and-forget: errors are logged but NOT thrown.
 *
 * @param filePath - The GCS file path
 */
export async function deleteNewsImage(filePath: string): Promise<void> {
  if (!filePath.startsWith('news-images/') || filePath.includes('..')) {
    log('WARN', 'deleteNewsImage called with invalid path (ignored)', { filePath })
    return
  }
  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    await file.delete({ ignoreNotFound: true })

    log('INFO', 'News image deleted', { podcastId: PODCAST_ID, filePath })
  } catch (error) {
    log('WARN', 'News image delete failed (fire-and-forget)', {
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * Deletes a newsletter image from Cloud Storage.
 *
 * Fire-and-forget: errors are logged but NOT thrown.
 * The lifecycle policy (180 days) ensures eventual cleanup of orphaned images.
 *
 * @param filePath - The GCS file path (e.g., "newsletters/pptnc/video-1/123.png")
 */
export async function deleteNewsletterImage(filePath: string): Promise<void> {
  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    await file.delete({ ignoreNotFound: true })

    log('INFO', 'Newsletter image deleted', { podcastId: PODCAST_ID, filePath })
  } catch (error) {
    log('WARN', 'Newsletter image delete failed (fire-and-forget)', {
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// ==========================================================================
// Epic 24 — Guest avatars (Story 24.2)
//
// Guest avatars are downloaded from LinkedIn (via BrightData scraping) and
// stored under `guest-avatars/{PODCAST_ID}/{guestKey}-{timestamp}.{ext}`.
// The timestamp prevents cache stale when a guest's avatar changes upstream
// (mesma motivação do AC10 da Retro 22 — Cloud Run filesystem efêmero).
// Served to clients via authenticated proxy route — bucket não é público.
// ==========================================================================

const SAFE_GUEST_KEY = /^[a-zA-Z0-9_-]+$/

/**
 * Uploads a guest avatar to Cloud Storage.
 *
 * @param guestKey - Stable identifier (linkedin_num_id when available, MD5 of URL otherwise).
 * @param imageBuffer - The avatar bytes.
 * @param mimeType - One of MIME_TO_EXT keys.
 * @returns The GCS file path (e.g., "guest-avatars/pptnc/12345678-1716000000000.jpg").
 */
export async function uploadGuestAvatar(
  guestKey: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ filePath: string; mimeType: string }> {
  if (!SAFE_GUEST_KEY.test(guestKey)) {
    throw new CloudStorageError('Invalid guest key for avatar path', 'UPLOAD_FAILED')
  }
  const ext = MIME_TO_EXT[mimeType]
  if (!ext) {
    throw new CloudStorageError('Unsupported MIME type for guest avatar', 'UPLOAD_FAILED')
  }
  if (imageBuffer.length === 0) {
    throw new CloudStorageError('Empty buffer for guest avatar', 'UPLOAD_FAILED')
  }

  const filePath = `guest-avatars/${PODCAST_ID}/${guestKey}-${Date.now()}.${ext}`

  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    await file.save(imageBuffer, {
      contentType: mimeType,
      resumable: false,
    })

    log('INFO', 'Guest avatar uploaded', {
      podcastId: PODCAST_ID,
      guestKey,
      filePath,
      size: imageBuffer.length,
      mimeType,
    })

    return { filePath, mimeType }
  } catch (error) {
    if (error instanceof CloudStorageError) throw error
    log('ERROR', 'Guest avatar upload failed', {
      podcastId: PODCAST_ID,
      guestKey,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw new CloudStorageError(
      `Failed to upload guest avatar: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UPLOAD_FAILED'
    )
  }
}

/**
 * Downloads a guest avatar from Cloud Storage. Path-validated to the guest-avatars prefix.
 */
export async function downloadGuestAvatar(filePath: string): Promise<Buffer> {
  if (!filePath.startsWith('guest-avatars/') || filePath.includes('..')) {
    throw new CloudStorageError('Invalid path for guest avatar download', 'DOWNLOAD_FAILED')
  }
  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    const [contents] = await file.download()
    log('INFO', 'Guest avatar downloaded', { podcastId: PODCAST_ID, filePath })
    return contents
  } catch (error) {
    log('ERROR', 'Guest avatar download failed', {
      podcastId: PODCAST_ID,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw new CloudStorageError(
      `Failed to download guest avatar: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DOWNLOAD_FAILED'
    )
  }
}

// ==========================================================================
// Epic 22 — Thumbnail config images (Base, Referência)
// ==========================================================================

/** Allowed video types for thumbnail config uploads ('standalone' = Vídeo Avulso, Epic 25). */
const THUMBNAIL_CONFIG_VIDEO_TYPES = ['episode', 'cut', 'standalone'] as const
type ThumbnailConfigVideoType = (typeof THUMBNAIL_CONFIG_VIDEO_TYPES)[number]

/** Allowed roles inside the thumbnail config. */
const THUMBNAIL_CONFIG_ROLES = ['base', 'reference'] as const
type ThumbnailConfigRole = (typeof THUMBNAIL_CONFIG_ROLES)[number]

/** MIME → extension mapping for thumbnail config uploads. */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * Uploads a thumbnail config image (Base or Referência) to Cloud Storage.
 *
 * Path: `thumbnail-config/{PODCAST_ID}/{videoType}/{role}-{timestamp}.{ext}`.
 * The timestamp prevents stale-cache issues when the producer replaces an
 * existing image. The previous file is left in the bucket — cleanup is manual
 * per the Epic 22 decision (no lifecycle policy).
 *
 * Returns the GCS path (not a public URL); the proxy route is responsible for
 * serving it to authenticated clients.
 *
 * @throws {CloudStorageError} If the upload fails or inputs are invalid.
 */
export async function uploadThumbnailConfigImage(
  videoType: ThumbnailConfigVideoType,
  role: ThumbnailConfigRole,
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ filePath: string; mimeType: string }> {
  if (!THUMBNAIL_CONFIG_VIDEO_TYPES.includes(videoType)) {
    throw new CloudStorageError('Invalid video type for thumbnail config', 'UPLOAD_FAILED')
  }
  if (!THUMBNAIL_CONFIG_ROLES.includes(role)) {
    throw new CloudStorageError('Invalid role for thumbnail config', 'UPLOAD_FAILED')
  }
  const ext = MIME_TO_EXT[mimeType]
  if (!ext) {
    throw new CloudStorageError('Unsupported MIME type for thumbnail config', 'UPLOAD_FAILED')
  }
  if (imageBuffer.length === 0) {
    throw new CloudStorageError('Empty image buffer for thumbnail config', 'UPLOAD_FAILED')
  }

  const filePath = `thumbnail-config/${PODCAST_ID}/${videoType}/${role}-${Date.now()}.${ext}`

  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    await file.save(imageBuffer, {
      contentType: mimeType,
      resumable: false,
    })

    log('INFO', 'Thumbnail config image uploaded', {
      podcastId: PODCAST_ID,
      videoType,
      role,
      filePath,
      size: imageBuffer.length,
      mimeType,
    })

    return { filePath, mimeType }
  } catch (error) {
    if (error instanceof CloudStorageError) throw error

    log('ERROR', 'Thumbnail config image upload failed', {
      podcastId: PODCAST_ID,
      videoType,
      role,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    throw new CloudStorageError(
      `Failed to upload thumbnail config image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UPLOAD_FAILED'
    )
  }
}

/**
 * Thumbnail staging — Epic 22 / Story 22.3e (manual upload) + Story 22.4 (LLM gen).
 *
 * Staging holds candidate thumbnails the producer is evaluating during the
 * wizard session. Story 22.3g moves the chosen one to a "final" path (or
 * persists the staging URL directly to `video.storageThumbnailUrl`).
 *
 * `source` distinguishes the two paths so we can tell uploads from generated
 * thumbnails at a glance in GCS, and so 22.4's retry/backoff doesn't collide
 * with manual uploads in the same key namespace.
 */
const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]+$/
/**
 * - `upload`: thumbnail própria enviada pelo produtor (Caminho 2 / Story 22.3e).
 * - `generated`: thumbnail gerada pela IAra (Caminho 1 / Story 22.3c + 22.4).
 * - `guest`: foto de convidado usada como reference image extra na geração
 *   de cortes (Story 22.3f). Não é uma thumbnail candidata em si — é insumo
 *   pro LLM. Fica em staging e morre com a sessão (não é movida pra final).
 */
export type ThumbnailStagingSource = 'upload' | 'generated' | 'guest'

const STAGING_PREFIX: Record<ThumbnailStagingSource, string> = {
  upload: 'upload',
  generated: 'gen',
  guest: 'guest',
}

export async function uploadThumbnailStagingImage(
  videoId: string,
  source: ThumbnailStagingSource,
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ filePath: string; mimeType: string }> {
  if (!SAFE_VIDEO_ID.test(videoId)) {
    throw new CloudStorageError('Invalid video ID for thumbnail staging path', 'UPLOAD_FAILED')
  }
  const ext = MIME_TO_EXT[mimeType]
  if (!ext) {
    throw new CloudStorageError('Unsupported MIME type for thumbnail staging', 'UPLOAD_FAILED')
  }
  if (imageBuffer.length === 0) {
    throw new CloudStorageError('Empty image buffer for thumbnail staging', 'UPLOAD_FAILED')
  }

  const filePath = `thumbnail-staging/${PODCAST_ID}/${videoId}/${STAGING_PREFIX[source]}-${Date.now()}.${ext}`

  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    await file.save(imageBuffer, {
      contentType: mimeType,
      resumable: false,
    })

    log('INFO', 'Thumbnail staging image uploaded', {
      podcastId: PODCAST_ID,
      videoId,
      source,
      filePath,
      size: imageBuffer.length,
      mimeType,
    })

    return { filePath, mimeType }
  } catch (error) {
    if (error instanceof CloudStorageError) throw error
    log('ERROR', 'Thumbnail staging image upload failed', {
      podcastId: PODCAST_ID,
      videoId,
      source,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw new CloudStorageError(
      `Failed to upload thumbnail staging image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UPLOAD_FAILED'
    )
  }
}

/**
 * Copia uma thumbnail de staging para o path final canônico do vídeo.
 *
 * Path final: `thumbnails/{PODCAST_ID}/{videoId}/final-{timestamp}.{ext}`.
 * O **timestamp invalida cache de browser/CDN/next-image** — sem ele, o URL
 * salvo em `video.storageThumbnailUrl` ficava idêntico entre sessões e o
 * preview da Phase 8 mostrava a thumb antiga mesmo após gerar uma nova
 * (bug detectado em 2026-05-14). Arquivos antigos viram lixo no bucket;
 * limpeza fica pra lifecycle policy.
 *
 * Idempotente: se `stagingPath` já for um final path, retorna o próprio
 * sem copiar — cobre o caso do produtor reabrir a fase e clicar Continuar
 * sem trocar a seleção.
 *
 * Story 22.3g + cache-bust fix 2026-05-14.
 */
export async function copyThumbnailStagingToFinal(
  stagingPath: string,
  videoId: string
): Promise<{ filePath: string }> {
  if (!SAFE_VIDEO_ID.test(videoId)) {
    throw new CloudStorageError('Invalid video ID for thumbnail final path', 'UPLOAD_FAILED')
  }
  const finalPrefix = `thumbnails/${PODCAST_ID}/${videoId}/`
  if (stagingPath.startsWith(finalPrefix)) {
    // Already final — no copy needed.
    return { filePath: stagingPath }
  }
  if (!stagingPath.startsWith('thumbnail-staging/') || stagingPath.includes('..')) {
    throw new CloudStorageError('Invalid staging path for thumbnail copy', 'UPLOAD_FAILED')
  }
  const ext = stagingPath.split('.').pop() ?? 'png'
  const destPath = `${finalPrefix}final-${Date.now()}.${ext}`

  try {
    const bucket = getBucket()
    const source = bucket.file(stagingPath)
    const dest = bucket.file(destPath)
    await source.copy(dest)
    log('INFO', 'Thumbnail copied staging → final', {
      podcastId: PODCAST_ID,
      videoId,
      stagingPath,
      destPath,
    })
    return { filePath: destPath }
  } catch (error) {
    log('ERROR', 'Thumbnail staging → final copy failed', {
      podcastId: PODCAST_ID,
      videoId,
      stagingPath,
      destPath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw new CloudStorageError(
      `Failed to copy thumbnail to final: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UPLOAD_FAILED'
    )
  }
}

/**
 * Baixa uma thumbnail final do bucket. Path-validated — só serve arquivos
 * sob `thumbnails/{PODCAST_ID}/`. Story 22.3g.
 */
export async function downloadThumbnailFinalImage(filePath: string): Promise<Buffer> {
  const prefix = `thumbnails/${PODCAST_ID}/`
  if (!filePath.startsWith(prefix) || filePath.includes('..')) {
    throw new CloudStorageError('Invalid file path for thumbnail final download', 'DOWNLOAD_FAILED')
  }
  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    const [contents] = await file.download()
    log('INFO', 'Thumbnail final image downloaded', { podcastId: PODCAST_ID, filePath })
    return contents
  } catch (error) {
    log('ERROR', 'Thumbnail final image download failed', {
      podcastId: PODCAST_ID,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw new CloudStorageError(
      `Failed to download thumbnail final image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DOWNLOAD_FAILED'
    )
  }
}

export async function downloadThumbnailStagingImage(filePath: string): Promise<Buffer> {
  if (!filePath.startsWith('thumbnail-staging/') || filePath.includes('..')) {
    throw new CloudStorageError('Invalid file path for thumbnail staging download', 'DOWNLOAD_FAILED')
  }
  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    const [contents] = await file.download()
    log('INFO', 'Thumbnail staging image downloaded', { podcastId: PODCAST_ID, filePath })
    return contents
  } catch (error) {
    log('ERROR', 'Thumbnail staging image download failed', {
      podcastId: PODCAST_ID,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw new CloudStorageError(
      `Failed to download thumbnail staging image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DOWNLOAD_FAILED'
    )
  }
}

/**
 * Downloads a thumbnail config image from Cloud Storage.
 *
 * Path-validated to ensure the request stays within the thumbnail-config prefix
 * and cannot traverse into other parts of the bucket.
 */
export async function downloadThumbnailConfigImage(filePath: string): Promise<Buffer> {
  if (!filePath.startsWith('thumbnail-config/') || filePath.includes('..')) {
    throw new CloudStorageError('Invalid file path for thumbnail config download', 'DOWNLOAD_FAILED')
  }
  try {
    const bucket = getBucket()
    const file = bucket.file(filePath)
    const [contents] = await file.download()

    log('INFO', 'Thumbnail config image downloaded', { podcastId: PODCAST_ID, filePath })

    return contents
  } catch (error) {
    log('ERROR', 'Thumbnail config image download failed', {
      podcastId: PODCAST_ID,
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    throw new CloudStorageError(
      `Failed to download thumbnail config image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DOWNLOAD_FAILED'
    )
  }
}
