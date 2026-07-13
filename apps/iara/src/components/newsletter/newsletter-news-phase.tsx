'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Newspaper } from 'lucide-react'

import { useNewsletterNews } from '@/hooks/use-newsletter-news'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { NewsletterStatus } from '@/lib/newsletter/types'
import type { NewsletterNewsItem } from '@/types/newsletter'

interface NewsletterNewsPhaseProps {
  videoId: string
  newsletterStatus: NewsletterStatus | null
  onStatusChange?: (status: NewsletterStatus) => void
}

export function NewsletterNewsPhase({ videoId, newsletterStatus: externalStatus, onStatusChange }: NewsletterNewsPhaseProps) {
  const {
    candidates,
    confirmedNews,
    newsSkipped,
    newsletterStatus: hookStatus,
    isLoading,
    isFetching,
    isConfirming,
    error,
    fetchNews,
    confirmSelection,
    skipNews,
  } = useNewsletterNews(videoId)

  const effectiveStatus = hookStatus ?? externalStatus

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= 5) return prev
        next.add(id)
      }
      return next
    })
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!candidates) return
    const selected = candidates.filter((c) => selectedIds.has(c.id))
    const ok = await confirmSelection(selected)
    if (ok) onStatusChange?.('news_selected')
  }, [candidates, selectedIds, confirmSelection, onStatusChange])

  const handleSkip = useCallback(async () => {
    const ok = await skipNews()
    if (ok) onStatusChange?.('news_selected')
  }, [skipNews, onStatusChange])

  const handleRefetch = useCallback(() => {
    setSelectedIds(new Set())
    fetchNews()
  }, [fetchNews])

  // Auto-fetch when entering Phase 2 with draft confirmed
  const autoFetchTriggeredRef = useRef(false)

  useEffect(() => {
    autoFetchTriggeredRef.current = false
    setSelectedIds(new Set())
  }, [videoId])

  useEffect(() => {
    if (
      !isLoading && !isFetching && !error
      && effectiveStatus && effectiveStatus !== 'idle'
      && !newsSkipped // edição já marcada como sem notícias: não buscar por conta própria
      && candidates === null && (confirmedNews === null || confirmedNews.length === 0)
      && !autoFetchTriggeredRef.current
    ) {
      autoFetchTriggeredRef.current = true
      fetchNews()
    }
  }, [isLoading, isFetching, error, effectiveStatus, newsSkipped, candidates, confirmedNews, fetchNews])

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="newsletter-news-loading" className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Not eligible: draft not generated yet
  if (!effectiveStatus || effectiveStatus === 'idle') {
    return (
      <div data-testid="newsletter-news-no-draft" className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
        <AlertCircle className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Complete a Fase 1 (Draft) antes de buscar notícias
        </p>
      </div>
    )
  }

  // Fetching candidates
  if (isFetching) {
    return (
      <div data-testid="newsletter-news-fetching" className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Buscando notícias relevantes...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div data-testid="newsletter-news-error" className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={handleRefetch}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  // Confirmed state: news already selected (read-only)
  if (confirmedNews && confirmedNews.length > 0) {
    return (
      <div data-testid="newsletter-news-confirmed" className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="text-sm text-muted-foreground">
            {confirmedNews.length} notícias selecionadas
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleRefetch}>
              Refazer Seleção
            </Button>
            <Button size="sm" onClick={() => onStatusChange?.('news_selected')}>
              Continuar
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {confirmedNews.map((item) => (
            <div key={item.id} className="flex items-start gap-3 p-4 border-b border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {item.source && <span>{item.source}</span>}
                  {item.publishedAt && <span>{item.publishedAt}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Skipped state: producer chose to publish this edition without news
  if (newsSkipped && (candidates === null || candidates.length === 0)) {
    return (
      <div data-testid="newsletter-news-skipped" className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="text-sm text-muted-foreground">
            Esta edição seguirá sem notícias
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleRefetch} disabled={isConfirming}>
              Buscar Notícias
            </Button>
            <Button size="sm" onClick={() => onStatusChange?.('news_selected')}>
              Continuar
            </Button>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <Newspaper className="size-8 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            A newsletter será gerada sem seção de notícias.
            <br />
            Você ainda pode voltar atrás: busque notícias e confirme uma seleção.
          </p>
        </div>
      </div>
    )
  }

  // Candidates state: list with checkboxes
  if (candidates && candidates.length > 0) {
    const selectedCount = selectedIds.size
    const canConfirm = selectedCount >= 3 && selectedCount <= 5
    const isMaxSelected = selectedCount >= 5

    return (
      <div data-testid="newsletter-news-candidates" className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="text-sm text-muted-foreground">
            {selectedCount} de 3-5 selecionadas
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleSkip} disabled={isConfirming}>
              Seguir sem Notícias
            </Button>
            <Button size="sm" variant="outline" onClick={handleRefetch} disabled={isConfirming}>
              Buscar Novamente
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={!canConfirm || isConfirming}>
              {isConfirming ? 'Confirmando...' : 'Confirmar Seleção'}
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {candidates.map((item) => {
            const isSelected = selectedIds.has(item.id)
            const isFaded = isMaxSelected && !isSelected

            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-4 border-b border-border transition-opacity ${isFaded ? 'opacity-30 pointer-events-none' : ''}`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSelection(item.id)}
                  aria-label={`Selecionar ${item.title}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {item.source && <span>{item.source}</span>}
                    {item.publishedAt && <span>{item.publishedAt}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Empty candidates after fetch
  if (candidates !== null && candidates.length === 0) {
    return (
      <div data-testid="newsletter-news-empty" className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
        <AlertCircle className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nenhuma notícia encontrada para este período
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefetch} disabled={isConfirming}>
            Buscar Novamente
          </Button>
          <Button size="sm" onClick={handleSkip} disabled={isConfirming}>
            Seguir sem Notícias
          </Button>
        </div>
      </div>
    )
  }

  // Default: preparing to auto-fetch (brief transitional state)
  return (
    <div data-testid="newsletter-news-ready" className="flex flex-col items-center justify-center h-full gap-3">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Preparando busca de notícias...</p>
    </div>
  )
}
