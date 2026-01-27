'use client'

import Image from 'next/image'
import { Check, Film } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getBestThumbnailUrl } from '@/lib/video-utils'
import type { VideoSummary, VideoStatus, VideoType } from '@/types/video'

interface VideoListItemProps {
  video: VideoSummary
  isSelected: boolean
  onSelect: (videoId: string) => void
}

const statusColors: Record<VideoStatus, string> = {
  new: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse',
  draft: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  ready: 'bg-green-500/20 text-green-400 border-green-500/30',
  sending: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse',
  sent: 'bg-green-500/20 text-green-400 border-green-500/30',
}

const statusLabels: Record<VideoStatus, string> = {
  new: 'novo',
  processing: 'processando',
  draft: 'rascunho',
  ready: 'pronto',
  sending: 'enviando',
  sent: 'enviado',
}

const typeColors: Record<VideoType, string> = {
  episode: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  cut: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  reel: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
}

const typeLabels: Record<VideoType, string> = {
  episode: 'episódio',
  cut: 'corte',
  reel: 'reel',
}

/**
 * Individual video item for display in the video list.
 * Shows thumbnail, title, status badge, and type badge.
 */
export function VideoListItem({ video, isSelected, onSelect }: VideoListItemProps) {
  const thumbnailUrl = getBestThumbnailUrl(video.thumbnails)

  const handleClick = () => {
    onSelect(video.id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(video.id)
    }
  }

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex cursor-pointer gap-3 rounded-lg p-2 transition-colors',
        'hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && 'ring-2 ring-blue-400 bg-accent'
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={video.title}
            fill
            className="object-cover"
            sizes="96px"
          />
        ) : (
          <div
            data-testid="thumbnail-placeholder"
            className="flex h-full w-full items-center justify-center"
          >
            <Film className="h-6 w-6 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {/* Title */}
        <span className="truncate text-sm font-medium">{video.title}</span>

        {/* Badges */}
        <div className="flex gap-1.5">
          <Badge variant="outline" className={cn('text-xs', statusColors[video.status])}>
            {video.status === 'sent' && (
              <Check data-testid="check-icon" className="mr-1 h-3 w-3" />
            )}
            {statusLabels[video.status]}
          </Badge>
          <Badge variant="outline" className={cn('text-xs', typeColors[video.videoType])}>
            {typeLabels[video.videoType]}
          </Badge>
        </div>
      </div>
    </div>
  )
}
