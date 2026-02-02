'use client'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getBestThumbnailUrl, formatDuration } from '@/lib/video-utils'
import { Badge } from '@/components/ui/badge'
import { VideoThumbnail } from '@/components/ui/video-thumbnail'
import type { VideoSummary } from '@/types/video'

interface EpisodeCardProps {
  episode: VideoSummary
  isSelected: boolean
  /** Whether this episode is the currently saved parent */
  isCurrentParent?: boolean
  onSelect: () => void
}

/**
 * Card component for displaying an episode in the parent selection list.
 * Used in Phase 0 (Parent Selection) for cut and reel videos.
 *
 * Shows:
 * - Thumbnail (with YouTube fallback)
 * - Title
 * - Duration
 * - Selection indicator (checkmark when selected)
 * - "Vídeo pai atual" badge when isCurrentParent is true
 *
 * NOTE: This component assumes episode.id is the YouTube video ID.
 * This is currently true because Firestore document IDs use the YouTube ID.
 * If this changes, VideoSummary should include an explicit youtubeId field.
 */
export function EpisodeCard({
  episode,
  isSelected,
  isCurrentParent = false,
  onSelect,
}: EpisodeCardProps) {
  // Prefer storageThumbnailUrl (base64 cached) over YouTube thumbnails
  const thumbnailUrl = episode.storageThumbnailUrl || getBestThumbnailUrl(episode.thumbnails)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all',
        'hover:bg-accent/50',
        isSelected
          ? 'border-primary bg-primary/10 ring-2 ring-primary/50'
          : 'border-border bg-card',
        isCurrentParent && !isSelected && 'border-green-500 border-2'
      )}
    >
      {/* Current parent badge */}
      {isCurrentParent && (
        <Badge
          variant="default"
          className="absolute -top-2 right-2 bg-green-600 text-white text-xs"
        >
          Vídeo pai atual
        </Badge>
      )}

      {/* Thumbnail */}
      <div className="relative flex-shrink-0 overflow-hidden rounded-md">
        <VideoThumbnail
          youtubeId={episode.id}
          thumbnailUrl={thumbnailUrl}
          alt={episode.title}
          width={120}
          height={68}
          className="rounded-md"
        />

        {/* Selection indicator overlay */}
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/30 rounded-md">
            <div className="rounded-full bg-primary p-1">
              <Check className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h4 className="line-clamp-2 text-sm font-medium leading-tight">
          {episode.title}
        </h4>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {episode.duration > 0 && (
            <span>{formatDuration(episode.duration)}</span>
          )}
          {episode.theme && (
            <>
              <span>•</span>
              <span className="line-clamp-1">{episode.theme}</span>
            </>
          )}
        </div>

        {episode.guests && episode.guests.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {episode.guests.length} convidado{episode.guests.length > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </button>
  )
}
