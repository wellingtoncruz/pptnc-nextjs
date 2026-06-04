'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Share2 } from 'lucide-react'

import { SocialColumnsLayout } from './social-columns-layout'
import { VideoListPanel } from '@/components/videos/video-list-panel'
import { useVideos } from '@/hooks/use-videos'
import type { EnabledNetworkInfo } from '@/hooks/use-social-posts'
import type { SocialNetwork } from '@/types/social'

interface SocialLayoutProps {
  enabledSocialNetworks?: string[]
}

export function SocialLayout({ enabledSocialNetworks = [] }: SocialLayoutProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const selectedVideoId = searchParams.get('selected')

  const {
    videos, isLoading, error, refresh, page, totalPages, setPage,
    typeFilter, setTypeFilter, statusFilter, setStatusFilter,
  } = useVideos({ statusFilter: 'ready_sent' })

  // Epic 26: episodes are now included in the social view (no type exclusion).
  // The query is scoped to ready+sent (Epic 26 / TD-11), so only videos with
  // finalized metadata or already published appear here.
  // Order: preserve the API order (publishedAt desc, recent-first). Sent videos
  // are visually highlighted by VideoListPanel, not floated to the top (Story 25.12).

  // Fetch social networks catalog once
  const [allNetworks, setAllNetworks] = useState<SocialNetwork[]>([])
  useEffect(() => {
    fetch('/api/social-networks')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.data) setAllNetworks(d.data)
      })
      .catch(() => { /* social networks catalog fetch failed — columns will be empty */ })
  }, [])

  // Build enriched enabled networks with stable reference
  const enabledNetworks: EnabledNetworkInfo[] = useMemo(() => {
    if (!allNetworks.length || !enabledSocialNetworks.length) return []
    return enabledSocialNetworks
      .map(id => allNetworks.find(n => n.id === id))
      .filter((n): n is SocialNetwork => n != null)
  }, [allNetworks, enabledSocialNetworks])

  // Find selected video from the list
  const selectedVideo = useMemo(() => {
    if (!selectedVideoId) return null
    return videos.find(v => v.id === selectedVideoId) ?? null
  }, [selectedVideoId, videos])

  const handleVideoSelect = useCallback((videoId: string) => {
    router.push(`${pathname}?view=social&selected=${videoId}`)
  }, [router, pathname])

  return (
    <div data-testid="social-layout" className="flex h-full">
      {/* Video sidebar */}
      <div className="w-[380px] shrink-0 border-r border-border">
        <VideoListPanel
          videos={videos}
          selectedVideoId={selectedVideoId}
          onVideoSelect={handleVideoSelect}
          isLoading={isLoading}
          error={error}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          variant="social"
          onVideoReopened={refresh}
        />
      </div>

      {/* Work area */}
      <div className="flex-1 overflow-hidden">
        {selectedVideoId && selectedVideo ? (
          <SocialColumnsLayout video={selectedVideo} enabledNetworks={enabledNetworks} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 h-full text-muted-foreground">
            <Share2 className="h-12 w-12 opacity-30" />
            <p className="text-sm">Selecione um vídeo para ver os posts sociais</p>
          </div>
        )}
      </div>
    </div>
  )
}
