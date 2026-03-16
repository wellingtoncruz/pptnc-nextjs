'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Loader2, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { News } from '@/types/news'
import type { VideoSummary } from '@/types/video'

import { EpisodeCard } from './episode-card'

type SearchMode = 'semantic' | 'text'

interface NewsEpisodesPhaseProps {
  news: News
  onDataUpdate: () => Promise<void>
  onAdvance: () => void
}

export function NewsEpisodesPhase({ news, onDataUpdate, onAdvance }: NewsEpisodesPhaseProps) {
  const [semanticEpisodes, setSemanticEpisodes] = useState<VideoSummary[]>([])
  const [textEpisodes, setTextEpisodes] = useState<VideoSummary[]>([])
  const [searchMode, setSearchMode] = useState<SearchMode>('semantic')
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(news.selected_video ?? null)
  const [selectedEpisode, setSelectedEpisode] = useState<VideoSummary | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchTriggered = useRef(false)

  const episodes = searchMode === 'semantic' ? semanticEpisodes : textEpisodes

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
      setSemanticEpisodes(data.data?.episodes ?? [])

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

  const handleSelect = useCallback(async (episode: VideoSummary) => {
    setSelectedId(episode.id)
    setSelectedEpisode(episode)

    try {
      await fetch(`/api/news/${news.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_video: episode.id }),
      })

      // Refresh workspace data (updates selected_video → maxReachablePhase)
      await onDataUpdate()
    } catch {
      // Selection still works locally even if persist fails
    }
  }, [news.id, onDataUpdate])

  const handleTextSearch = useCallback(async () => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    setIsSearching(true)
    setError(null)

    try {
      const response = await fetch(`/api/news/${news.id}/search-episodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })

      if (!response.ok) {
        throw new Error('Erro ao buscar episódios')
      }

      const data = await response.json()
      setTextEpisodes(data.data?.episodes ?? [])
      setSearchMode('text')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsSearching(false)
    }
  }, [news.id, searchQuery])

  const handleResetSearch = useCallback(() => {
    setSearchMode('semantic')
    setSearchQuery('')
    setTextEpisodes([])
    setError(null)
  }, [])

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTextSearch()
    }
  }, [handleTextSearch])

  if (isLoading) {
    return (
      <div data-testid="news-episodes-loading" className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Buscando episódios relacionados...</p>
      </div>
    )
  }

  if (error && searchMode === 'semantic' && semanticEpisodes.length === 0) {
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

  return (
    <div className="flex h-full flex-col" data-testid="news-episodes-phase">
      {/* Selected episode card (persistent across modes) */}
      {selectedEpisode && searchMode === 'text' && (
        <div className="shrink-0 border-b border-border px-6 pt-4 pb-3" data-testid="selected-episode-banner">
          <p className="text-xs text-muted-foreground mb-1.5">Episódio selecionado:</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium truncate">{selectedEpisode.title}</span>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="shrink-0 px-6 pt-4 pb-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Buscar episódio por nome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              data-testid="episode-search-input"
              className="pr-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleResetSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="episode-search-clear"
                aria-label="Limpar busca"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleTextSearch}
            disabled={!searchQuery.trim() || isSearching}
            data-testid="episode-search-button"
            aria-label="Buscar episódio"
          >
            {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </Button>
        </div>
        {searchMode === 'text' && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground" data-testid="search-mode-label">
              Resultados da busca por nome
            </span>
            <button
              type="button"
              onClick={handleResetSearch}
              className="text-xs text-primary hover:underline"
              data-testid="back-to-semantic"
            >
              Voltar para episódios relacionados
            </button>
          </div>
        )}
      </div>

      {/* Episode list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-2 space-y-3">
        {error && searchMode === 'text' && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <AlertCircle className="size-6 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {!error && episodes.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground" data-testid="news-episodes-empty">
            <p className="text-sm">
              {searchMode === 'text'
                ? 'Nenhum episódio encontrado para esta busca'
                : 'Nenhum episódio relacionado encontrado'}
            </p>
          </div>
        )}

        {episodes.map((episode) => (
          <EpisodeCard
            key={episode.id}
            episode={episode}
            isSelected={selectedId === episode.id}
            onClick={() => handleSelect(episode)}
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
