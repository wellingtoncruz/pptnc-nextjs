/**
 * Editorial Report - Public Page (Server Component)
 *
 * Public route: /report/[videoId]
 * No auth required. Fetches data server-side with Admin SDK.
 *
 * Validates:
 * - Video exists
 * - Video type is 'episode'
 *
 * Fetches: episode video, podcast (youtubeFooter), child videos (cuts/reels).
 *
 * @see story-11-4-relatorio-editorial.md
 */

import { notFound } from 'next/navigation'

import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin, getChildVideos } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { log } from '@/lib/logger'

import { EditorialReport } from '@/components/editorial/editorial-report'

interface ReportPageProps {
  params: Promise<{ videoId: string }>
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { videoId } = await params

  try {
    // Fetch episode video
    const video = await getVideoAdmin(PODCAST_ID, videoId)

    // Validate: video exists and is an episode
    if (!video || video.videoType !== 'episode') {
      notFound()
    }

    // Fetch podcast (for youtubeFooter) and child videos in parallel
    const [podcast, childVideos] = await Promise.all([
      getPodcastAdmin(PODCAST_ID),
      getChildVideos(PODCAST_ID, videoId),
    ])

    // Separate children into cuts and reels
    const cuts = childVideos.filter((v) => v.videoType === 'cut')
    const reels = childVideos.filter((v) => v.videoType === 'reel')

    return (
      <EditorialReport
        video={video}
        cuts={cuts}
        reels={reels}
        youtubeFooter={podcast?.youtubeFooter}
      />
    )
  } catch (error) {
    // ZodError or Firestore errors — treat as not found for public page
    log('ERROR', 'Failed to load editorial report', { videoId, error })
    notFound()
  }
}
