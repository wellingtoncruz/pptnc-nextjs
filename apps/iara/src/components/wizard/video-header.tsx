'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarIcon, ClockIcon, RefreshCwIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Video } from '@/types/video'

interface VideoHeaderProps {
  video: Video
  className?: string
}

/**
 * Format duration in seconds to HH:MM:SS format.
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

/**
 * Helper to format Firestore Timestamp or date string.
 *
 * Handles multiple formats:
 * - Firestore Timestamp with toDate() method (client-side)
 * - Serialized Firestore timestamp { _seconds, _nanoseconds } (from API)
 * - Serialized Firestore timestamp { seconds, nanoseconds } (alternate format)
 * - ISO date string
 * - Date object
 */
function formatTimestamp(
  timestamp: unknown,
  formatStr: string
): string | null {
  if (!timestamp) return null
  try {
    let date: Date

    if (timestamp instanceof Date) {
      date = timestamp
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp)
    } else if (typeof timestamp === 'object' && timestamp !== null) {
      const ts = timestamp as Record<string, unknown>

      // Firestore Timestamp with toDate() method
      if (typeof ts.toDate === 'function') {
        date = (ts.toDate as () => Date)()
      }
      // Serialized Firestore timestamp (from API response)
      else if ('_seconds' in ts && typeof ts._seconds === 'number') {
        date = new Date(ts._seconds * 1000)
      }
      // Alternate serialized format
      else if ('seconds' in ts && typeof ts.seconds === 'number') {
        date = new Date(ts.seconds * 1000)
      }
      else {
        return null
      }
    } else {
      return null
    }

    // Validate date
    if (isNaN(date.getTime())) return null

    return format(date, formatStr, { locale: ptBR })
  } catch {
    return null
  }
}

/**
 * VideoHeader component displays video title above the player.
 *
 * @see Story 5.1 - AC1
 */
export function VideoHeader({ video, className }: VideoHeaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Video Title */}
      <h2 className="text-lg font-semibold text-foreground line-clamp-2">
        {video.title || 'Vídeo sem título'}
      </h2>
    </div>
  )
}

interface VideoMetadataProps {
  video: Video
  className?: string
}

/**
 * VideoMetadata component displays video metadata below the player.
 *
 * Shows:
 * - Created date (data de criação)
 * - Last updated date (última atualização)
 * - Duration in HH:MM:SS format
 *
 * @see Story 5.1 - AC2 (item 1.b do fix.md)
 */
export function VideoMetadata({ video, className }: VideoMetadataProps) {
  // Format dates - handles both Firestore Timestamp and serialized formats
  const createdDate = formatTimestamp(video.createdAt, "dd MMM yyyy")
  const updatedDate = formatTimestamp(video.updatedAt, "dd MMM yyyy 'às' HH:mm")

  const duration = video.duration ? formatDuration(video.duration) : null

  return (
    <div className={cn('flex flex-wrap items-center gap-4 text-xs text-muted-foreground', className)}>
      {/* Created date */}
      {createdDate && (
        <div className="flex items-center gap-1">
          <CalendarIcon className="size-3" />
          <span>Criado em {createdDate}</span>
        </div>
      )}

      {/* Updated date */}
      {updatedDate && (
        <div className="flex items-center gap-1">
          <RefreshCwIcon className="size-3" />
          <span>Atualizado {updatedDate}</span>
        </div>
      )}

      {/* Duration */}
      {duration && (
        <div className="flex items-center gap-1">
          <ClockIcon className="size-3" />
          <span>{duration}</span>
        </div>
      )}
    </div>
  )
}
