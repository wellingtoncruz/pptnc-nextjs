'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

import { MasterDetailLayout } from '@/components/layout/master-detail-layout'
import { Sidebar } from '@/components/layout/sidebar'
import { VideoListPanel } from '@/components/videos/video-list-panel'
import { VideoDetailPanel } from '@/components/videos/video-detail-panel'
import { SettingsPanel } from '@/components/settings/settings-panel'
import { useVideos } from '@/hooks/use-videos'

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

  const selectedVideoId = searchParams.get('selected')
  const currentView = searchParams.get('view')

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

  // Handle sync - calls refresh from useVideos
  const handleSync = useCallback(async () => {
    // First sync from YouTube API, then refresh local list
    try {
      const response = await fetch('/api/sync', { method: 'POST' })
      if (!response.ok) {
        throw new Error('Sync failed')
      }
      await refresh()
    } catch {
      // Silently refresh even if sync fails - user might still want to see local data
      await refresh()
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

  // Default: show full master-detail layout with video list
  return (
    <MasterDetailLayout
      sidebar={<Sidebar userName={userName} />}
      list={
        <VideoListPanel
          videos={videos}
          selectedVideoId={selectedVideoId}
          onVideoSelect={handleVideoSelect}
          onSync={handleSync}
          isLoading={isLoading}
          error={error}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
        />
      }
      detail={<VideoDetailPanel videoId={selectedVideoId} />}
    />
  )
}
