/**
 * Thumbnail operations for video sync.
 *
 * Downloads thumbnails from YouTube and converts to base64 data URLs
 * for storage directly in Firestore documents.
 *
 * CRITICAL: Never expose admin SDK to the client.
 */

import { log } from '../logger'

/**
 * Downloads an image from a URL and converts it to a base64 data URL.
 *
 * @param sourceUrl - URL of the image to download
 * @returns Base64 data URL (data:image/jpeg;base64,...) or null if failed
 */
export async function downloadImageAsDataUrl(
  sourceUrl: string
): Promise<string | null> {
  try {
    // Download image from source URL
    const response = await fetch(sourceUrl)

    if (!response.ok) {
      log('WARN', 'Failed to download image', {
        sourceUrl,
        status: response.status,
      })
      return null
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Skip if image is too small (likely a placeholder/error image)
    if (buffer.length < 1000) {
      log('WARN', 'Image too small, likely a placeholder', {
        sourceUrl,
        size: buffer.length,
      })
      return null
    }

    // Convert to base64 data URL
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${contentType};base64,${base64}`

    log('INFO', 'Image downloaded and converted to base64', {
      sourceUrl: sourceUrl.substring(0, 50) + '...',
      size: buffer.length,
      dataUrlLength: dataUrl.length,
    })

    return dataUrl
  } catch (error) {
    log('ERROR', 'Failed to download image', {
      sourceUrl,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Downloads a video thumbnail and returns it as a base64 data URL.
 *
 * Tries multiple source URLs in order of preference.
 * The returned data URL can be used directly in <img src="..."> or stored in Firestore.
 *
 * @param podcastId - Podcast ID (for logging)
 * @param videoId - YouTube video ID (for logging)
 * @param thumbnailUrls - Array of thumbnail URLs to try (in order of preference)
 * @returns Base64 data URL of thumbnail, or null if all sources failed
 */
export async function uploadVideoThumbnail(
  podcastId: string,
  videoId: string,
  thumbnailUrls: string[]
): Promise<string | null> {
  for (const url of thumbnailUrls) {
    if (!url) continue

    const result = await downloadImageAsDataUrl(url)
    if (result) {
      return result
    }
  }

  log('WARN', 'All thumbnail URLs failed', { podcastId, videoId })
  return null
}
