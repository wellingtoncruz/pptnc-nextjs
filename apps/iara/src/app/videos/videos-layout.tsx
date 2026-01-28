'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback, useState, useEffect, useRef } from 'react'

import { MasterDetailLayout } from '@/components/layout/master-detail-layout'
import { Sidebar } from '@/components/layout/sidebar'
import { VideoListPanel } from '@/components/videos/video-list-panel'
import { VideoDetailPanel } from '@/components/videos/video-detail-panel'
import { SyncOverlay } from '@/components/videos/sync-overlay'
import { SyncResultModal, type SyncResultData } from '@/components/videos/sync-result-modal'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { useVideos } from '@/hooks/use-videos'
import { log } from '@/lib/logger'

interface VideosLayoutProps {
  userName?: string
}

/**
 * Client-side layout for the videos page.
 * Manages the Master-Detail layout with URL-based video selection.
 * Shows settings panel (full width) when view=settings.
 */
export function VideosLayout({ userName }: VideosLayoutProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentView = searchParams.get('view')

  // Track if initial mount check has been done
  const hasCheckedInitialUrl = useRef(false)

  // Redirect if accessed directly with ?selected param (only allowed via click)
  useEffect(() => {
    if (!hasCheckedInitialUrl.current) {
      hasCheckedInitialUrl.current = true
      const selectedParam = searchParams.get('selected')
      if (selectedParam) {
        router.replace('/videos')
      }
    }
  }, [searchParams, router])

  // Only get selectedVideoId after initial check (will be null after redirect)
  const selectedVideoId = hasCheckedInitialUrl.current ? searchParams.get('selected') : null

  // Syncing state for overlay
  const [isSyncing, setIsSyncing] = useState(false)

  // Sync result modal state
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResultData | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Fetch videos using the hook
  const {
    videos,
    isLoading,
    error,
    refresh,
    page,
    totalPages,
    setPage,
    typeFilter,
    setTypeFilter,
  } = useVideos()

  // Handle video selection - updates URL (Rule #10)
  const handleVideoSelect = useCallback((videoId: string) => {
    router.push(`${pathname}?selected=${videoId}`)
  }, [router, pathname])

  // Handle closing the sync result modal
  const handleCloseSyncModal = useCallback(() => {
    setSyncModalOpen(false)
    setSyncResult(null)
    setSyncError(null)
  }, [])

  // Handle sync - calls refresh from useVideos with overlay
  const handleSync = useCallback(async () => {
    setIsSyncing(true)
    setSyncResult(null)
    setSyncError(null)

    try {
      const response = await fetch('/api/sync', { method: 'POST' })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Falha na sincronização')
      }

      const response_data = await response.json()
      const result = response_data.data
      await refresh()

      // Log sync summary
      const newCount = result.newVideos ?? 0
      const reopenedCount = result.reopenedVideos ?? 0
      log('INFO', 'Sync completed', { newVideos: newCount, reopenedVideos: reopenedCount })

      // Show result modal
      setSyncResult({
        newVideos: newCount,
        reopenedVideos: reopenedCount,
        transcriptionsFetched: result.transcriptionsFetched ?? 0,
        transcriptionsUnavailable: result.transcriptionsUnavailable ?? 0,
        quotaError: result.quotaError,
      })
      setSyncModalOpen(true)
    } catch (err) {
      log('ERROR', 'Sync failed', { error: err })
      // Still refresh to show local data
      await refresh()
      // Show error in modal
      setSyncError(err instanceof Error ? err.message : 'Erro desconhecido na sincronização')
      setSyncModalOpen(true)
    } finally {
      setIsSyncing(false)
    }
  }, [refresh])

  // When in settings view, show only sidebar and settings panel (no video list)
  if (currentView === 'settings') {
    return (
      <div className="flex h-screen">
        <div className="shrink-0">
          <Sidebar userName={userName} />
        </div>
        <div className="flex-1">
          <SettingsPanel />
        </div>
      </div>
    )
  }

  // Find the selected video from the list
  const selectedVideo = selectedVideoId
    ? videos.find(v => v.id === selectedVideoId) ?? null
    : null

  // Default: show full master-detail layout with video list
  return (
    <>
      <SyncOverlay isOpen={isSyncing} />
      <SyncResultModal
        isOpen={syncModalOpen}
        onClose={handleCloseSyncModal}
        result={syncResult}
        error={syncError}
      />
      <MasterDetailLayout
        sidebar={<Sidebar userName={userName} />}
        list={
          <VideoListPanel
            videos={videos}
            selectedVideoId={selectedVideoId}
            onVideoSelect={handleVideoSelect}
            onSync={handleSync}
            isSyncing={isSyncing}
            isLoading={isLoading}
            error={error}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
          />
        }
        detail={<VideoDetailPanel videoId={selectedVideoId} video={selectedVideo} />}
      />
    </>
  )
}
