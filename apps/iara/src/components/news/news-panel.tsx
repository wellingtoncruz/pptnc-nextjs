'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NewsCard } from './news-card'
import { NewsDetail } from './news-detail'
import type { News } from '@/types/news'

const PAGE_SIZE = 8

/**
 * News section panel with master-detail layout.
 * Left panel: paginated news cards in 2-column grid.
 * Right panel: selected news detail.
 */
export function NewsPanel() {
  const [items, setItems] = useState<News[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNews, setSelectedNews] = useState<News | null>(null)

  // Cursor-based pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [prevCursors, setPrevCursors] = useState<Array<string | undefined>>([])
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined)
  const [totalCount, setTotalCount] = useState(0)

  const fetchNews = useCallback(async (cursor?: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      if (cursor) {
        params.set('cursor', cursor)
      }

      const response = await fetch(`/api/news?${params.toString()}`)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || 'Erro ao carregar notícias')
      }

      const data = await response.json()
      setItems(data.data?.items ?? [])
      setNextCursor(data.data?.nextCursor ?? null)
      setTotalCount(data.data?.totalCount ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setItems([])
      setNextCursor(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    fetchNews()
  }, [fetchNews])

  const handleNextPage = () => {
    if (!nextCursor) return
    // Push current cursor to stack for "back" navigation
    setPrevCursors(prev => [...prev, currentCursor])
    setCurrentCursor(nextCursor)
    setSelectedNews(null)
    fetchNews(nextCursor)
  }

  const handlePrevPage = () => {
    if (prevCursors.length === 0) return
    const prev = [...prevCursors]
    const cursor = prev.pop()
    setPrevCursors(prev)
    setCurrentCursor(cursor)
    setSelectedNews(null)
    fetchNews(cursor)
  }

  const hasPrevPage = prevCursors.length > 0
  const hasNextPage = nextCursor !== null
  const currentPage = prevCursors.length + 1
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Notícias</h1>
      </div>

      {/* Master-detail content */}
      <div className="flex min-h-0 flex-1">
        {/* Left panel: News list */}
        <div className="flex w-1/2 flex-col border-r border-border">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isLoading && items.length === 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border p-4">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                    <div className="flex justify-between pt-2">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                {error}
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Nenhuma notícia encontrada
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {items.map((news) => (
                  <NewsCard
                    key={news.id}
                    news={news}
                    isSelected={selectedNews?.id === news.id}
                    onSelect={() => setSelectedNews(news)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pagination footer */}
          {!isLoading && items.length > 0 && (hasPrevPage || hasNextPage) && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={!hasPrevPage}
              >
                <ChevronLeft className="mr-1 size-4" />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasNextPage}
              >
                Próxima
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Right panel: News detail */}
        <div className="w-1/2 overflow-y-auto">
          <NewsDetail news={selectedNews} />
        </div>
      </div>
    </div>
  )
}
