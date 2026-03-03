'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { News } from '@/types/news'

import { NewsEpisodesPhase } from './news-episodes-phase'
import { NewsPhaseNav } from './news-phase-nav'
import { NewsSocialPhase } from './news-social-phase'
import { NewsViewPhase } from './news-view-phase'

interface NewsWorkspaceProps {
  newsId: string
}

/**
 * Determines max reachable phase based on news data.
 * - No related_videos → max 1
 * - With related_videos, no selected_video → max 2
 * - With selected_video → max 3
 */
function getMaxReachablePhase(news: News): number {
  if (news.selected_video) return 3
  if (news.related_videos && news.related_videos.length > 0) return 2
  return 1
}

/**
 * News workspace with 3-phase wizard.
 * Phase 1: News view + find episodes button
 * Phase 2: Episode cards + selection (Story 18.6)
 * Phase 3: Social post editing (Story 18.7)
 */
export function NewsWorkspace({ newsId }: NewsWorkspaceProps) {
  const [news, setNews] = useState<News | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPhase, setCurrentPhase] = useState(1)

  const maxReachablePhase = news ? getMaxReachablePhase(news) : 1

  const fetchNews = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/news/${newsId}`)
      if (!response.ok) {
        throw new Error('Erro ao carregar notícia')
      }
      const data = await response.json()
      setNews(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsLoading(false)
    }
  }, [newsId])

  useEffect(() => {
    fetchNews()
    setCurrentPhase(1)
  }, [fetchNews])

  // Clamp currentPhase to stay within maxReachablePhase after data changes
  useEffect(() => {
    if (news) {
      const maxPhase = getMaxReachablePhase(news)
      setCurrentPhase(prev => Math.min(prev, maxPhase))
    }
  }, [news])

  const handlePhaseChange = (phase: number) => {
    if (phase <= maxReachablePhase) {
      setCurrentPhase(phase)
    }
  }

  const handleDataUpdate = useCallback(async () => {
    // Re-fetch news without resetting loading/phase state
    try {
      const response = await fetch(`/api/news/${newsId}`)
      if (response.ok) {
        const data = await response.json()
        setNews(data.data)
      }
    } catch {
      // Silently fail — data will be stale but functional
    }
  }, [newsId])

  const handleFindEpisodes = useCallback(() => {
    // Navigate to Phase 2. maxReachablePhase may still be 1 at this point —
    // the Phase 2 component will trigger the find-episodes API call,
    // then call handleDataUpdate to refresh maxReachablePhase.
    setCurrentPhase(2)
  }, [])

  const handleAdvanceToSocial = useCallback(() => {
    setCurrentPhase(3)
  }, [])

  if (isLoading) {
    return (
      <div data-testid="news-workspace-loading" className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !news) {
    return (
      <div data-testid="news-workspace-error" className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <AlertCircle className="size-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error || 'Notícia não encontrada'}</p>
        <Button variant="outline" size="sm" onClick={fetchNews}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div data-testid="news-workspace" className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-5 py-3">
        <h2 className="text-lg font-semibold truncate">{news.titulo}</h2>
      </div>

      {/* Phase navigation — effectiveMax accounts for transition to phase 2 before data updates */}
      <NewsPhaseNav
        currentPhase={currentPhase}
        maxReachablePhase={Math.max(maxReachablePhase, currentPhase)}
        onPhaseChange={handlePhaseChange}
      />

      {/* Phase content */}
      <div className="flex-1 overflow-hidden">
        {currentPhase === 1 && (
          <NewsViewPhase
            news={news}
            onFindEpisodes={handleFindEpisodes}
          />
        )}
        {currentPhase === 2 && (
          <NewsEpisodesPhase
            news={news}
            onDataUpdate={handleDataUpdate}
            onAdvance={handleAdvanceToSocial}
          />
        )}
        {currentPhase === 3 && (
          <NewsSocialPhase
            news={news}
            onDataUpdate={handleDataUpdate}
          />
        )}
      </div>
    </div>
  )
}

// Export for use by child phase components
export { getMaxReachablePhase }
export type { NewsWorkspaceProps }
