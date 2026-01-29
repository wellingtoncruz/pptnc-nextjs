'use client'

import { cn } from '@/lib/utils'
import { YouTubeEmbed } from './youtube-embed'
import { useYouTube } from './youtube-context'

interface VideoPreviewProps {
  videoId: string
  title?: string
  thumbnailUrl?: string
  className?: string
}

/**
 * YouTube video preview component with embedded player.
 *
 * Integrates with YouTubeContext to allow:
 * - ClickableTimestamp components to seek the video
 * - In-page control instead of opening new tabs
 *
 * @pattern TIMESTAMP_SEEK_IN_PAGE - Timestamps control in-page player
 * @see youtube-context.tsx - Context provider for player state
 * @see youtube-embed.tsx - Embed component with 800ms seekTo fix
 */
export function VideoPreview({
  videoId,
  title = 'YouTube video player',
  thumbnailUrl,
  className,
}: VideoPreviewProps) {
  const youtube = useYouTube()

  return (
    <div className={cn('relative w-full', className)}>
      <YouTubeEmbed
        youtubeId={videoId}
        title={title}
        thumbnailUrl={thumbnailUrl}
        onPlayerReady={youtube.setPlayer}
        registerStartPlayback={youtube.registerStartPlayback}
        className="w-full"
      />
    </div>
  )
}
