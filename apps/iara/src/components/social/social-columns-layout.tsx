'use client'

import { useMemo } from 'react'
import { AlertCircle } from 'lucide-react'

import { SocialPostColumn } from './social-post-column'
import { useSocialPosts } from '@/hooks/use-social-posts'
import type { EnabledNetworkInfo } from '@/hooks/use-social-posts'
import type { VideoSummary } from '@/types/video'

interface SocialColumnsLayoutProps {
  video: VideoSummary
  enabledNetworks: EnabledNetworkInfo[]
}

export function SocialColumnsLayout({ video, enabledNetworks }: SocialColumnsLayoutProps) {
  const missingFields: string[] = []
  if (!video.title) missingFields.push('título')
  if (!video.theme) missingFields.push('tema')
  if (!video.description) missingFields.push('descrição')
  const hasPrerequisites = missingFields.length === 0

  const {
    posts, isLoading, generatingNetworkId, reprocessingNetworkId,
    errors, retryNetwork, reprocessNetwork, updatePost,
  } = useSocialPosts(video.id, enabledNetworks, hasPrerequisites)

  // useMemo MUST be before any conditional return (React Rules of Hooks)
  const postsMap = useMemo(() => {
    const map = new Map<string, typeof posts[0]>()
    for (const post of posts) {
      map.set(post.networkId, post)
    }
    return map
  }, [posts])

  if (!hasPrerequisites) {
    return (
      <div data-testid="social-columns-prerequisites" className="flex items-center justify-center h-full p-8">
        <div className="flex flex-col items-center gap-3 text-muted-foreground max-w-md text-center">
          <AlertCircle className="h-10 w-10 opacity-40" />
          <p className="text-sm">
            Este vídeo precisa ter os seguintes campos processados antes de gerar posts para redes sociais: <strong>{missingFields.join(', ')}</strong>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="social-columns-layout" className="flex h-full overflow-x-auto custom-scrollbar">
      {enabledNetworks.map(network => (
        <SocialPostColumn
          key={network.id}
          networkId={network.id}
          networkName={network.name}
          networkIcon={network.icon}
          videoId={video.id}
          post={postsMap.get(network.id) ?? null}
          isGenerating={generatingNetworkId === network.id}
          isLoading={isLoading}
          isReprocessing={reprocessingNetworkId === network.id}
          error={errors.get(network.id) ?? null}
          onRetry={() => retryNetwork(network.id)}
          onReprocess={reprocessNetwork}
          onPostUpdated={updatePost}
        />
      ))}
    </div>
  )
}
