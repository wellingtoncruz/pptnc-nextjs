'use client'

import { Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardFooter } from '@/components/ui/card'
import { VideoThumbnail } from '@/components/ui/video-thumbnail'
import { cn } from '@/lib/utils'
import { statusColors, statusLabels } from '@/lib/video-constants'
import type { VideoStatus } from '@/types/video'

export interface EpisodeSummary {
  id: string
  title: string
  description?: string
  status: string
  thumbnailUrl?: string
  publishedAt?: string
}

interface EpisodeCardProps {
  episode: EpisodeSummary
}

export function EpisodeCard({ episode }: EpisodeCardProps) {
  const status = (episode.status as VideoStatus) || 'new'

  return (
    <Card className="relative overflow-hidden pt-0">
      <VideoThumbnail
        youtubeId={episode.id}
        thumbnailUrl={episode.thumbnailUrl}
        alt={episode.title}
        width={480}
        height={270}
        className="aspect-video w-full object-cover"
      />
      <CardHeader className="px-4">
        <CardAction>
          <Badge variant="outline" className={cn('text-xs', statusColors[status])}>
            {status === 'sent' && <Check className="mr-1 h-3 w-3" />}
            {statusLabels[status] ?? status}
          </Badge>
        </CardAction>
        <CardTitle className="line-clamp-1 text-sm">{episode.title}</CardTitle>
        <CardDescription className="line-clamp-2">
          {episode.description || <span className="italic">Sem descrição</span>}
        </CardDescription>
      </CardHeader>
      <CardFooter className="border-t bg-muted/50 p-4">
        <Button variant="default" size="sm" className="w-full" asChild>
          <a href={`/report/${episode.id}`} target="_blank" rel="noopener noreferrer">
            Relatório Editorial
          </a>
        </Button>
      </CardFooter>
    </Card>
  )
}
