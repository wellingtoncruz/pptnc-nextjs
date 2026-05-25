'use client'

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { ArrowRightIcon, Loader2Icon, AlertTriangleIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video, VideoSummary } from '@/types/video'
import { cn } from '@/lib/utils'

import { EpisodeCard } from './episode-card'

interface Phase0ParentSelectionProps {
  wizard: UseWizardReturn
  video: Video
  /** Callback when parent is selected and saved */
  onParentSelected: (parentEpisodeId: string, inheritedData: { guests: Video['guests']; theme: string }) => void
  className?: string
}

interface EpisodesResponse {
  data: VideoSummary[]
}

const MIN_SEARCH_LENGTH = 5
const DEBOUNCE_MS = 300

const fetcher = (url: string) => fetch(url).then((res) => res.json())

/**
 * Phase 0: Parent Selection - For cut and reel videos only.
 *
 * Allows the producer to select which episode this cut/reel was derived from.
 * When selected, the video inherits guests and theme from the parent episode.
 *
 * Key features:
 * - Lists episodes with context defined (theme populated)
 * - Shows current parent if already selected
 * - Saves parentEpisodeId and inherits guests/theme on advance
 * - Only rendered for cut and reel video types
 */
export function Phase0ParentSelection({
  wizard,
  video,
  onParentSelected,
  className,
}: Phase0ParentSelectionProps) {
  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only set debounced search if min length reached or empty
      if (searchTerm.length >= MIN_SEARCH_LENGTH || searchTerm.length === 0) {
        setDebouncedSearch(searchTerm)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Build API URL with search param
  const apiUrl = debouncedSearch.length >= MIN_SEARCH_LENGTH
    ? `/api/videos/episodes?search=${encodeURIComponent(debouncedSearch)}`
    : '/api/videos/episodes?limit=5'

  // Fetch episodes for selection
  const { data, error, isLoading, mutate } = useSWR<EpisodesResponse>(
    apiUrl,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  const episodes = data?.data ?? []
  const hasEpisodes = episodes.length > 0
  const hasError = !!error
  const isSearching = searchTerm.length > 0 && searchTerm.length < MIN_SEARCH_LENGTH

  // Selected episode state - initialize from video.parentEpisodeId if exists (smart load)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(
    video.parentEpisodeId ?? ''
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Update selection if video changes
  useEffect(() => {
    if (video.parentEpisodeId) {
      setSelectedEpisodeId(video.parentEpisodeId)
    }
  }, [video.parentEpisodeId])

  const handleEpisodeSelect = useCallback((episodeId: string) => {
    setSelectedEpisodeId(episodeId)
    setSaveError(null)
  }, [])

  const handleAdvance = async () => {
    if (!selectedEpisodeId) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const response = await fetch(`/api/videos/${video.id}/parent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentEpisodeId: selectedEpisodeId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message ?? 'Erro ao salvar')
      }

      const result = await response.json()

      // Call callback with inherited data
      onParentSelected(selectedEpisodeId, {
        guests: result.data.guests,
        theme: result.data.theme,
      })

      // Advance to phase 5 (Title) using completePhaseAndAdvance
      // Phase 0 completion is tracked via video.parentEpisodeId in Firestore
      wizard.completePhaseAndAdvance('parent', { parentEpisodeId: selectedEpisodeId })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao salvar'
      setSaveError(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  const handleRetry = () => {
    mutate()
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle>Selecionar Episódio de Origem</CardTitle>
          <CardDescription>
            Selecione o episódio que deu origem a este {video.videoType === 'cut' ? 'corte' : 'reel'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Carregando episódios...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (hasError) {
    return (
      <Card className={cn('', className)}>
        <CardHeader>
          <CardTitle>Selecionar Episódio de Origem</CardTitle>
          <CardDescription>
            Selecione o episódio que deu origem a este {video.videoType === 'cut' ? 'corte' : 'reel'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertTitle>Erro ao carregar episódios</AlertTitle>
            <AlertDescription>
              Não foi possível carregar a lista de episódios.
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button onClick={handleRetry} variant="outline">
              <RefreshCwIcon className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Normal state with episodes (or empty after search)
  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle>Selecionar Episódio de Origem</CardTitle>
        <CardDescription>
          Selecione o episódio que deu origem a este {video.videoType === 'cut' ? 'corte' : 'reel'}.
          O tema e convidados serão herdados automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search input */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por título..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="pl-9"
          />
          {isSearching && (
            <p className="mt-1 text-xs text-muted-foreground">
              Digite pelo menos {MIN_SEARCH_LENGTH} caracteres para buscar
            </p>
          )}
        </div>

        {/* Episode list */}
        {hasEpisodes ? (
          <div className="max-h-[400px] space-y-2 overflow-y-auto custom-scrollbar pr-2">
            {episodes.map((episode) => (
              <EpisodeCard
                key={episode.id}
                episode={episode}
                isSelected={selectedEpisodeId === episode.id}
                isCurrentParent={video.parentEpisodeId === episode.id}
                onSelect={() => handleEpisodeSelect(episode.id)}
              />
            ))}
          </div>
        ) : debouncedSearch.length >= MIN_SEARCH_LENGTH ? (
          /* Empty search results */
          <Alert>
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertTitle>Nenhum episódio encontrado</AlertTitle>
            <AlertDescription>
              Nenhum episódio corresponde à busca &quot;{debouncedSearch}&quot;.
              Tente outro termo ou limpe a busca.
            </AlertDescription>
          </Alert>
        ) : (
          /* No episodes available at all */
          <Alert>
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertTitle>Nenhum episódio disponível</AlertTitle>
            <AlertDescription>
              Não há episódios com contexto definido. Processe um episódio primeiro para definir
              tema e convidados.
            </AlertDescription>
          </Alert>
        )}

        {/* Save error */}
        {saveError && (
          <Alert variant="destructive">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertTitle>Erro ao salvar</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        {/* Advance button */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleAdvance}
            disabled={!selectedEpisodeId || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                Confirmar e Avançar
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
