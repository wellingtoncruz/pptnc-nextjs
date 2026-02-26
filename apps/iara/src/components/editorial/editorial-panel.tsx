'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EpisodeCard } from './episode-card'
import type { EpisodeSummary } from './episode-card'

/**
 * Editorial section panel with episode grid, search, and loading states.
 */
export function EditorialPanel() {
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Fetch episodes
  const fetchEpisodes = useCallback(async (search?: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (search) {
        params.set('search', search)
      } else {
        params.set('limit', '16')
      }

      const response = await fetch(`/api/editorial/episodes?${params.toString()}`)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || 'Erro ao carregar episódios')
      }

      const data = await response.json()
      setEpisodes(data.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setEpisodes([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount and when debounced search changes
  useEffect(() => {
    fetchEpisodes(debouncedSearch || undefined)
  }, [debouncedSearch, fetchEpisodes])

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h1 className="text-lg font-semibold">Editorial</h1>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por título..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-6">
            {isLoading && episodes.length === 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="aspect-video w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                {error}
              </div>
            ) : episodes.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Nenhum episódio encontrado
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {episodes.map((episode) => (
                  <EpisodeCard key={episode.id} episode={episode} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
