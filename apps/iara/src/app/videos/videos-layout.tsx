'use client'

import { useSearchParams } from 'next/navigation'

import { MasterDetailLayout } from '@/components/layout/master-detail-layout'
import { Sidebar } from '@/components/layout/sidebar'
import { VideoListPanel } from '@/components/videos/video-list-panel'
import { VideoDetailPanel } from '@/components/videos/video-detail-panel'
import { SettingsPanel } from '@/components/settings/settings-panel'

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
  const selectedVideoId = searchParams.get('selected')
  const currentView = searchParams.get('view')

  const handleSync = async () => {
    // Sync will be implemented in a future story
    // This will call POST /api/sync
  }

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
      list={<VideoListPanel onSync={handleSync} />}
      detail={<VideoDetailPanel videoId={selectedVideoId} />}
    />
  )
}
