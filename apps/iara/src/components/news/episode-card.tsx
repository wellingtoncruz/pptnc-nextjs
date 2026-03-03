import { Clock, Users } from 'lucide-react'

import { VideoThumbnail } from '@/components/ui/video-thumbnail'
import { cn } from '@/lib/utils'
import { formatDuration, getBestThumbnailUrl } from '@/lib/video-utils'
import type { VideoSummary } from '@/types/video'

interface EpisodeCardProps {
  episode: VideoSummary
  isSelected: boolean
  onClick: () => void
}

export function EpisodeCard({ episode, isSelected, onClick }: EpisodeCardProps) {
  const thumbnailUrl = episode.storageThumbnailUrl || getBestThumbnailUrl(episode.thumbnails) || null
  const guestNames = episode.guests?.map(g => g.name).join(', ')

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full gap-3 rounded-lg border p-3 text-left transition-colors',
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border hover:bg-accent/50',
      )}
      data-testid={`episode-card-${episode.id}`}
    >
      <VideoThumbnail
        youtubeId={episode.id}
        thumbnailUrl={thumbnailUrl}
        alt={episode.title}
        width={120}
        height={68}
        className="shrink-0 rounded"
      />
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold text-sm truncate">{episode.title}</h4>
        {episode.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {episode.description}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          {guestNames && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" />
              {guestNames}
            </span>
          )}
          {episode.duration > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {formatDuration(episode.duration)}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
