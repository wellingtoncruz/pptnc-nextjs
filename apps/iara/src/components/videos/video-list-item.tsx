'use client'

import { Check, AlertCircle } from 'lucide-react'

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
 * Gets the message for why a sent video is blocked.
 */
function getBlockedMessage(): { title: string; description: string } {
  return {
    title: 'Vídeo já publicado',
    description: 'Para trabalhar nesse vídeo, torne ele Privado ou Não Listado no YouTube.',
  }
}

/**
 * Individual video item for display in the video list.
 * Shows thumbnail, title, status badge, and type badge.
 *
 * Sent videos are dimmed and non-interactive. They show a hover card
 * over the thumbnail explaining that the video must be made Private or Unlisted to edit.
 *
 * Note: Videos without transcription are NOT blocked. Transcription is
 * fetched on-demand when the producer selects a video in the Wizard.
 * @see Story 5.6 - Transcrição On-Demand
 */
export function VideoListItem({ video, isSelected, onSelect }: VideoListItemProps) {
  const { isProcessing: isLLMProcessing } = useLLMProcessing()
  // Prefer storageThumbnailUrl (works for draft/private videos), fall back to YouTube URL
  const thumbnailUrl = video.storageThumbnailUrl || getBestThumbnailUrl(video.thumbnails)
  const isSent = video.status === 'sent'

  // Bloqueia seleção se:
  // 1. Vídeo já foi enviado (sent)
  // 2. Uma chamada LLM está em andamento (bloqueio suave, sem mensagem)
  const isDisabled = isSent
  const isSelectionBlocked = isLLMProcessing && !isSelected

  const handleClick = () => {
    // Vídeos desabilitados ou bloqueados não podem ser selecionados
    if (isDisabled || isSelectionBlocked) return
    onSelect(video.id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Vídeos desabilitados ou bloqueados não podem ser selecionados via teclado
    if (isDisabled || isSelectionBlocked) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(video.id)
    }
  }

  const blockedMessage = isDisabled ? getBlockedMessage() : null

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={isDisabled}
      aria-label={
        isDisabled && blockedMessage
          ? `${video.title} - ${blockedMessage.title}: ${blockedMessage.description}`
          : video.title
      }
      tabIndex={isDisabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group flex gap-3 rounded-lg p-2 transition-colors overflow-hidden',
        isDisabled
          ? 'cursor-not-allowed opacity-50'
          : isSelectionBlocked
            ? 'cursor-wait opacity-70' // Bloqueio suave durante processamento LLM
            : 'cursor-pointer hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && !isDisabled && 'ring-2 ring-blue-400 bg-accent'
      )}
    >
      {/* Thumbnail with overlay for blocked videos - uses VideoThumbnail with YouTube fallback */}
      <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted">
        <VideoThumbnail
          youtubeId={video.id}
          thumbnailUrl={thumbnailUrl || null}
          alt={video.title}
          width={96}
          height={54}
          className="w-full h-full"
        />

        {/* Hover overlay for blocked videos */}
        {isDisabled && blockedMessage && (
          <>
            {/* Screen reader accessible text */}
            <span className="sr-only">
              {blockedMessage.title}: {blockedMessage.description}
            </span>
            {/* Visual overlay (mouse users) */}
            <div
              data-testid="blocked-overlay"
              aria-hidden="true"
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <AlertCircle className="h-4 w-4 text-yellow-400 mb-1" />
              <span className="text-[10px] font-medium text-white text-center px-1 leading-tight">
                {blockedMessage.title}
              </span>
            </div>
          </>
        )}
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
