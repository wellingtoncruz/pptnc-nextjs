'use client'

import { Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { VideoThumbnail } from '@/components/ui/video-thumbnail'
import { useLLMProcessing } from '@/contexts'
import { cn } from '@/lib/utils'
import { getBestThumbnailUrl } from '@/lib/video-utils'
import type { VideoSummary, VideoStatus, VideoType } from '@/types/video'

interface VideoListItemProps {
  video: VideoSummary
  isSelected: boolean
  onSelect: (videoId: string) => void
  onReopenRequest?: (videoId: string) => void
  sentAppearance?: 'dimmed' | 'highlighted'
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
 *
 * Sent videos open reopen dialog when `onReopenRequest` is provided (editorial variant),
 * or select directly when it's not (social variant).
 *
 * @see Story 5.6 - Transcrição On-Demand
 * @see Story 11-2 - Reabrir Episódio (sent videos clickable)
 * @see Story 14.13 - Variant Social (sentAppearance prop)
 */
export function VideoListItem({ video, isSelected, onSelect, onReopenRequest, sentAppearance = 'dimmed' }: VideoListItemProps) {
  const { isProcessing: isLLMProcessing } = useLLMProcessing()
  // Prefer storageThumbnailUrl (works for draft/private videos), fall back to YouTube URL
  const thumbnailUrl = video.storageThumbnailUrl || getBestThumbnailUrl(video.thumbnails)
  const isSent = video.status === 'sent'

  // Bloqueio suave: apenas durante processamento LLM
  const isSelectionBlocked = isLLMProcessing && !isSelected

  const handleClick = () => {
    if (isSelectionBlocked) return

    // Sent videos: open reopen dialog if callback provided, otherwise select directly
    if (isSent && onReopenRequest) {
      onReopenRequest(video.id)
      return
    }

    onSelect(video.id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isSelectionBlocked) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (isSent && onReopenRequest) {
        onReopenRequest(video.id)
        return
      }
      onSelect(video.id)
    }
  }

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-label={video.title}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group flex gap-3 rounded-lg p-2 transition-colors overflow-hidden',
        isSelectionBlocked
          ? 'cursor-wait opacity-70'
          : 'cursor-pointer hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // dimmed (default/editorial): sent videos are subtle, non-sent are active
        // highlighted (social): sent videos are active, non-sent are subtle
        sentAppearance === 'dimmed' && isSent && 'opacity-60',
        sentAppearance === 'highlighted' && !isSent && 'opacity-60',
        isSelected && !(sentAppearance === 'dimmed' && isSent) && 'ring-2 ring-blue-400 bg-accent'
      )}
    >
      {/* Thumbnail - uses VideoThumbnail with YouTube fallback */}
      <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted">
        <VideoThumbnail
          youtubeId={video.id}
          thumbnailUrl={thumbnailUrl || null}
          alt={video.title}
          width={96}
          height={54}
          className="w-full h-full"
        />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {/* Title */}
        <span className="truncate text-sm font-medium">{video.title}</span>

        {/* Badges */}
        <div className="flex gap-1.5 overflow-hidden">
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
