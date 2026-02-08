'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import { RefreshCw, Inbox, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import type { VideoSummary, VideoTypeFilter } from '@/types/video'
import type { VideoStatusFilter } from '@/hooks/use-videos'

import { ReopenVideoDialog } from './reopen-video-dialog'
import { VideoListItem } from './video-list-item'

interface VideoListPanelProps {
  videos?: VideoSummary[]
  selectedVideoId?: string | null
  onVideoSelect?: (videoId: string) => void
  onSync?: () => void
  isSyncing?: boolean
  isLoading?: boolean
  error?: string | null
  // Pagination
  page?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  // Filter
  typeFilter?: VideoTypeFilter
  onTypeFilterChange?: (type: VideoTypeFilter) => void
  // Status filter
  statusFilter?: VideoStatusFilter
  onStatusFilterChange?: (status: VideoStatusFilter) => void
  // Reopen callback (refreshes list after sent → draft)
  onVideoReopened?: () => void
}

const typeLabels: Record<VideoTypeFilter, string> = {
  all: 'Todos',
  episode: 'Episódios',
  cut: 'Cortes',
  reel: 'Reels',
}

/**
 * Checks if a video is disabled (cannot be selected or interacted with).
 *
 * Note: Sent videos are NOT disabled - they open the reopen dialog.
 * @see Story 11-2 - Reabrir Episódio
 */
function isVideoDisabled(video: VideoSummary): boolean {
  // Check for pending transcription (only for new/draft videos)
  if (video.status === 'new' || video.status === 'draft') {
    return !video.transcriptionSRT && !video.transcriptionTXT
  }

  return false
}

/**
 * Video list panel with header, tabs, and paginated list.
 * Displays VideoListItem for each video with selection state.
 * Supports keyboard navigation with ArrowUp/ArrowDown.
 */
export function VideoListPanel({
  videos,
  selectedVideoId,
  onVideoSelect,
  onSync,
  isSyncing = false,
  isLoading = false,
  error,
  page = 1,
  totalPages = 1,
  onPageChange,
  typeFilter = 'all',
  onTypeFilterChange,
  statusFilter = 'not_sent',
  onStatusFilterChange,
  onVideoReopened,
}: VideoListPanelProps) {
  // Derive "only new" from statusFilter (not_sent means all except sent)
  const onlyNewVideos = statusFilter === 'not_sent'

  const handleOnlyNewToggle = (checked: boolean) => {
    onStatusFilterChange?.(checked ? 'not_sent' : 'all')
  }
  const hasVideos = videos && videos.length > 0
  const listRef = useRef<HTMLDivElement>(null)

  // Reopen dialog state
  const [reopenVideoId, setReopenVideoId] = useState<string | null>(null)
  const [isReopenDialogOpen, setIsReopenDialogOpen] = useState(false)

  const handleReopenRequest = useCallback((videoId: string) => {
    setReopenVideoId(videoId)
    setIsReopenDialogOpen(true)
  }, [])

  const handleReopenSuccess = useCallback(() => {
    onVideoReopened?.()
  }, [onVideoReopened])

  // Handle keyboard navigation (skips disabled videos, triggers reopen for sent)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!videos || videos.length === 0 || !onVideoSelect) return

      // Helper to find next navigable (non-disabled) video
      const findNextNavigable = (startIndex: number, direction: 1 | -1): number => {
        let index = startIndex + direction
        while (index >= 0 && index < videos.length) {
          if (!isVideoDisabled(videos[index])) {
            return index
          }
          index += direction
        }
        return -1 // No navigable video found
      }

      // Navigate to video: select if normal, open reopen dialog if sent
      const navigateToVideo = (video: VideoSummary) => {
        if (video.status === 'sent') {
          handleReopenRequest(video.id)
        } else {
          onVideoSelect(video.id)
        }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const currentIndex = selectedVideoId
          ? videos.findIndex((v) => v.id === selectedVideoId)
          : -1

        if (currentIndex === -1) {
          // Find first non-disabled video
          const firstNavigable = videos.findIndex((v) => !isVideoDisabled(v))
          if (firstNavigable !== -1) {
            navigateToVideo(videos[firstNavigable])
          }
        } else {
          const nextIndex = findNextNavigable(currentIndex, 1)
          if (nextIndex !== -1) {
            navigateToVideo(videos[nextIndex])
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const currentIndex = selectedVideoId
          ? videos.findIndex((v) => v.id === selectedVideoId)
          : -1

        if (currentIndex > 0) {
          const prevIndex = findNextNavigable(currentIndex, -1)
          if (prevIndex !== -1) {
            navigateToVideo(videos[prevIndex])
          }
        }
      }
    },
    [videos, selectedVideoId, onVideoSelect, handleReopenRequest]
  )

  // Auto-scroll to selected item
  useEffect(() => {
    if (!selectedVideoId || !listRef.current) return

    const selectedElement = listRef.current.querySelector(
      `[aria-selected="true"]`
    ) as HTMLElement

    if (selectedElement && typeof selectedElement.scrollIntoView === 'function') {
      selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedVideoId])

  return (
    <>
    <div data-testid="video-list-panel" className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4 overflow-hidden">
        <h2 className="min-w-0 truncate text-lg font-semibold">Vídeos</h2>
        <div className="flex shrink-0 items-center gap-3">
          {/* Only new videos switch */}
          <div className="flex items-center gap-2">
            <Switch
              id="only-new-videos"
              checked={onlyNewVideos}
              onCheckedChange={handleOnlyNewToggle}
              size="sm"
            />
            <Label
              htmlFor="only-new-videos"
              className="cursor-pointer text-xs text-muted-foreground whitespace-nowrap"
            >
              Só novos
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            disabled={isSyncing}
            className="shrink-0 gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Verificando...' : 'Verificar novos'}</span>
          </Button>
        </div>
      </div>

      {/* Tabs for filtering by type */}
      <div className="shrink-0 overflow-hidden border-b border-border px-2 py-2">
        <Tabs
          value={typeFilter}
          onValueChange={(value) => onTypeFilterChange?.(value as VideoTypeFilter)}
        >
          <TabsList className="w-full">
            {(Object.keys(typeLabels) as VideoTypeFilter[]).map((type) => (
              <TabsTrigger key={type} value={type} className="flex-1 text-xs">
                {typeLabels[type]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Content - scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
        {/* Loading state */}
        {isLoading && <VideoListLoadingState />}

        {/* Error state */}
        {!isLoading && error && <VideoListErrorState message={error} />}

        {/* Empty state */}
        {!isLoading && !error && !hasVideos && <VideoListEmptyState />}

        {/* Video list */}
        {!isLoading && !error && hasVideos && (
          <div
            ref={listRef}
            role="listbox"
            aria-label="Lista de vídeos"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="flex flex-col gap-1 outline-none"
          >
            {videos.map((video) => (
              <VideoListItem
                key={video.id}
                video={video}
                isSelected={selectedVideoId === video.id}
                onSelect={onVideoSelect ?? (() => {})}
                onReopenRequest={handleReopenRequest}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination - fixed at bottom */}
      {!isLoading && !error && hasVideos && totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between overflow-hidden border-t border-border px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Anterior</span>
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange?.(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Próxima</span>
          </Button>
        </div>
      )}
    </div>

    <ReopenVideoDialog
      videoId={reopenVideoId}
      open={isReopenDialogOpen}
      onOpenChange={setIsReopenDialogOpen}
      onSuccess={handleReopenSuccess}
    />
    </>
  )
}

/**
 * Loading skeleton for video list.
 */
function VideoListLoadingState() {
  return (
    <div data-testid="video-list-loading" className="flex flex-col gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-3 p-2">
          <Skeleton className="aspect-video w-24 shrink-0 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Empty state shown when no videos are available.
 */
function VideoListEmptyState() {
  return (
    <div
      data-testid="video-list-empty"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <Inbox className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">Nenhum vídeo encontrado</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Clique em &quot;Verificar novos&quot; para buscar vídeos do seu canal.
      </p>
    </div>
  )
}

/**
 * Error state shown when video loading fails.
 */
function VideoListErrorState({ message }: { message: string }) {
  return (
    <div
      data-testid="video-list-error"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <AlertCircle className="h-12 w-12 text-destructive/70" />
      <h3 className="mt-4 text-lg font-medium text-destructive">Erro ao carregar</h3>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
