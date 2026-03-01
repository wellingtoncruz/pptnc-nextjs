'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { Mail } from 'lucide-react'

import { VideoListPanel } from '@/components/videos/video-list-panel'
import { useVideos } from '@/hooks/use-videos'

import { NewsletterWorkPanel } from './newsletter-work-panel'

export function NewsletterLayout() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const selectedVideoId = searchParams.get('selected')

  const {
    videos: rawVideos, isLoading, error, refresh, page, totalPages, setPage,
    typeFilter, setTypeFilter, statusFilter, setStatusFilter,
  } = useVideos({ statusFilter: 'all', typeFilter: 'episode' })

  // Sort: sent-first, then preserve API order (recent-first)
  const videos = useMemo(() => {
    return [...rawVideos].sort((a, b) => {
      const aIsSent = a.status === 'sent' ? 0 : 1
      const bIsSent = b.status === 'sent' ? 0 : 1
      if (aIsSent !== bIsSent) return aIsSent - bIsSent
      return 0
    })
  }, [rawVideos])

  const selectedVideo = useMemo(() => {
    if (!selectedVideoId) return null
    return videos.find(v => v.id === selectedVideoId) ?? null
  }, [selectedVideoId, videos])

  const handleVideoSelect = useCallback((videoId: string) => {
    router.push(`${pathname}?view=newsletter&selected=${videoId}`)
  }, [router, pathname])

  return (
    <div data-testid="newsletter-layout" className="flex h-full">
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
          variant="newsletter"
          onVideoReopened={refresh}
        />
      </div>

      {/* Work area */}
      <div className="flex-1 overflow-hidden">
        {selectedVideoId && selectedVideo ? (
          <NewsletterWorkPanel videoId={selectedVideoId} video={selectedVideo} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 h-full text-muted-foreground">
            <Mail className="h-12 w-12 opacity-30" />
            <p className="text-sm">Selecione um episódio para gerar a newsletter</p>
          </div>
        )}
      </div>
    </div>
  )
}
