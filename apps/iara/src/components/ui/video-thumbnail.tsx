'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Image from 'next/image'

import { cn } from '@/lib/utils'

interface VideoThumbnailProps {
  /** YouTube video ID for fallback URLs */
  youtubeId: string
  /** Custom thumbnail URL (highest priority) */
  thumbnailUrl?: string | null
  /** Alt text for the image */
  alt: string
  /** Width in pixels */
  width?: number
  /** Height in pixels */
  height?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Video thumbnail with automatic YouTube fallback.
 *
 * Tries to load thumbnail in this order:
 * 1. Custom thumbnailUrl (if provided)
 * 2. YouTube hqdefault.jpg (480x360) - guaranteed to exist for ALL videos
 * 3. YouTube default.jpg (120x90)
 *
 * NOTE: maxresdefault.jpg only exists for HD videos with custom thumbnails,
 * so we start with hqdefault.jpg which is guaranteed to exist.
 *
 * If all fail, shows a placeholder with "Sem thumbnail" text.
 */
export function VideoThumbnail({
  youtubeId,
  thumbnailUrl,
  alt,
  width = 120,
  height = 68,
  className,
}: VideoThumbnailProps) {
  // Build fallback chain - memoized to prevent unnecessary re-renders
  // Start with hqdefault (guaranteed to exist) not maxresdefault (only for HD custom)
  const fallbackUrls = useMemo(() => [
    `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${youtubeId}/default.jpg`,
  ], [youtubeId])

  // Determine initial URL
  // IMPORTANT: Ignore thumbnailUrl if it contains query parameters (signed URLs expire)
  // YouTube signed URLs (with ?sqp= or ?rs=) expire after some time and return 404
  const hasExpirableParams = thumbnailUrl?.includes('?')
  const safeThumbUrl = hasExpirableParams ? null : thumbnailUrl
  const initialUrl = safeThumbUrl || fallbackUrls[0]

  const [currentSrc, setCurrentSrc] = useState(initialUrl)
  const [fallbackIndex, setFallbackIndex] = useState(thumbnailUrl ? 0 : 1)
  const [hasError, setHasError] = useState(false)

  // Reset state when youtubeId or thumbnailUrl changes
  // This fixes the issue where thumbnails don't update when the video list changes
  useEffect(() => {
    const hasParams = thumbnailUrl?.includes('?')
    const safeUrl = hasParams ? null : thumbnailUrl
    const newInitialUrl = safeUrl || fallbackUrls[0]
    setCurrentSrc(newInitialUrl)
    setFallbackIndex(safeUrl ? 0 : 1)
    setHasError(false)
  }, [youtubeId, thumbnailUrl, fallbackUrls])

  const handleError = useCallback(() => {
    if (fallbackIndex < fallbackUrls.length) {
      setCurrentSrc(fallbackUrls[fallbackIndex])
      setFallbackIndex((prev) => prev + 1)
    } else {
      // All fallbacks failed
      setHasError(true)
    }
  }, [fallbackIndex, fallbackUrls])

  // Show placeholder if all sources failed
  if (hasError) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground',
          className
        )}
        style={{ width, height }}
      >
        <span className="text-xs">Sem thumbnail</span>
      </div>
    )
  }

  // Use regular img for data URIs (base64) as Next.js Image doesn't handle them well
  const isDataUri = currentSrc.startsWith('data:')

  if (isDataUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={currentSrc}
        alt={alt}
        width={width}
        height={height}
        className={cn('object-cover', className)}
        onError={handleError}
      />
    )
  }

  return (
    <Image
      src={currentSrc}
      alt={alt}
      width={width}
      height={height}
      className={cn('object-cover', className)}
      onError={handleError}
      unoptimized
    />
  )
}
