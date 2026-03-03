'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { News } from '@/types/news'
import type { VideoSummary } from '@/types/video'

import { EpisodeCard } from './episode-card'

interface NewsEpisodesPhaseProps {
  news: News
  onDataUpdate: () => Promise<void>
  onAdvance: () => void
}

export function NewsEpisodesPhase({ news, onDataUpdate, onAdvance }: NewsEpisodesPhaseProps) {
  const [episodes, setEpisodes] = useState<VideoSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(news.selected_video ?? null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchTriggered = useRef(false)

  const fetchEpisodes = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/news/${news.id}/find-episodes`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Erro ao buscar episódios relacionados')
      }

      const data = await response.json()
      setEpisodes(data.data?.episodes ?? [])

      // Refresh workspace data (updates related_videos → maxReachablePhase)
      await onDataUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [news.id, onDataUpdate])

  // Auto-fetch on mount (useRef prevents double-trigger in StrictMode)
  useEffect(() => {
    if (fetchTriggered.current) return
    fetchTriggered.current = true
    fetchEpisodes()
  }, [fetchEpisodes])

  const handleSelect = useCallback(async (videoId: string) => {
    setSelectedId(videoId)

    try {
      await fetch(`/api/news/${news.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_video: videoId }),
      })

      // Refresh workspace data (updates selected_video → maxReachablePhase)
      await onDataUpdate()
    } catch {
      // Selection still works locally even if persist fails
    }
  }, [news.id, onDataUpdate])

  if (isLoading) {
    return (
      <div data-testid="news-episodes-loading" className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Buscando episódios relacionados...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="news-episodes-error" className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <AlertCircle className="size-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => { fetchTriggered.current = false; fetchEpisodes() }}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  if (episodes.length === 0) {
    return (
      <div data-testid="news-episodes-empty" className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Nenhum episódio relacionado encontrado</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" data-testid="news-episodes-phase">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
        {episodes.map((episode) => (
          <EpisodeCard
            key={episode.id}
            episode={episode}
            isSelected={selectedId === episode.id}
            onClick={() => handleSelect(episode.id)}
          />
        ))}
      </div>

      {/* Advance button */}
      <div className="shrink-0 border-t border-border px-6 py-4">
        <Button
          onClick={onAdvance}
          className="w-full"
          disabled={!selectedId}
          data-testid="advance-to-social-button"
        >
          Avançar para Redação
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  )
}
