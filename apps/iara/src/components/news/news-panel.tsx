'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { NewsListItem } from './news-list-item'
import { NewsWorkspace } from './news-workspace'
import type { News } from '@/types/news'

const PAGE_SIZE = 15

/**
 * News section panel with master-detail layout.
 * Left panel: paginated news list (Gmail-style compact rows).
 * Right panel: selected news detail.
 */
export function NewsPanel() {
  const [items, setItems] = useState<News[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNews, setSelectedNews] = useState<News | null>(null)

  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Cursor-based pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [prevCursors, setPrevCursors] = useState<Array<string | undefined>>([])
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined)
  const [totalCount, setTotalCount] = useState(0)

  const fetchNews = useCallback(async (cursor?: string, search?: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      if (cursor) {
        params.set('cursor', cursor)
      }
      if (search) {
        params.set('search', search)
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

  const handleSearch = () => {
    const term = searchTerm.trim()
    setActiveSearch(term)
    setPrevCursors([])
    setCurrentCursor(undefined)
    setSelectedNews(null)
    fetchNews(undefined, term || undefined)
  }

  const handleClearSearch = () => {
    setSearchTerm('')
    setActiveSearch('')
    setPrevCursors([])
    setCurrentCursor(undefined)
    setSelectedNews(null)
    fetchNews()
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleNextPage = () => {
    if (!nextCursor) return
    setPrevCursors(prev => [...prev, currentCursor])
    setCurrentCursor(nextCursor)
    setSelectedNews(null)
    fetchNews(nextCursor, activeSearch || undefined)
  }

  const handlePrevPage = () => {
    if (prevCursors.length === 0) return
    const prev = [...prevCursors]
    const cursor = prev.pop()
    setPrevCursors(prev)
    setCurrentCursor(cursor)
    setSelectedNews(null)
    fetchNews(cursor, activeSearch || undefined)
  }

  const hasPrevPage = prevCursors.length > 0
  const hasNextPage = nextCursor !== null
  const currentPage = prevCursors.length + 1
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Notícias</h1>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar notícias..."
              className="pr-8"
            />
            {activeSearch && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleSearch}
            aria-label="Buscar"
          >
            <Search className="size-4" />
          </Button>
        </div>
        {activeSearch && !isLoading && (
          <p className="text-xs text-muted-foreground">
            {items.length === 0
              ? `Nenhuma notícia encontrada para "${activeSearch}"`
              : `${items.length} resultado${items.length !== 1 ? 's' : ''}${hasNextPage ? ' (mais resultados disponíveis)' : ''}`}
          </p>
        )}
      </div>

      {/* Master-detail content */}
      <div className="flex min-h-0 flex-1">
        {/* Left panel: News list */}
        <div className="flex w-1/2 flex-col border-r border-border">
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            {isLoading && items.length === 0 ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-3 w-16 shrink-0" />
                      <Skeleton className="h-3 w-20 shrink-0" />
                    </div>
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
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
              <div className="divide-y divide-border">
                {items.map((news) => (
                  <NewsListItem
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

        {/* Right panel: News workspace */}
        <div className="w-1/2 overflow-hidden">
          {selectedNews ? (
            <NewsWorkspace newsId={selectedNews.id} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>Selecione uma notícia para ver os detalhes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
