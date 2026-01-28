'use client'

import { cn } from '@/lib/utils'

interface VideoPreviewProps {
  videoId: string
  className?: string
}

/**
 * YouTube video preview component with embedded player.
 *
 * Uses the YouTube iframe embed API for responsive video playback.
 */
export function VideoPreview({ videoId, className }: VideoPreviewProps) {
  return (
    <div className={cn('relative w-full', className)}>
      {/* Aspect ratio container for 16:9 */}
      <div className="relative w-full pt-[56.25%]">
        <iframe
          className="absolute inset-0 w-full h-full rounded-lg"
          src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  )
}
