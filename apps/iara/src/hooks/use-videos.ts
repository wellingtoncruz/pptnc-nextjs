'use client'

import { useState, useEffect, useCallback } from 'react'

import { log } from '@/lib/logger'
import type { VideoSummary, VideoType } from '@/types/video'

export type VideoTypeFilter = VideoType | 'all'

const PAGE_SIZE = 20

interface UseVideosOptions {
  typeFilter?: VideoTypeFilter
}

interface UseVideosResult {
  videos: VideoSummary[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  // Pagination
  page: number
  totalPages: number
  totalCount: number
  setPage: (page: number) => void
  // Filter
  typeFilter: VideoTypeFilter
  setTypeFilter: (type: VideoTypeFilter) => void
}

/**
 * Hook for fetching and managing video list with pagination and filtering.
 *
 * Fetches videos via /api/videos endpoint (using Admin SDK server-side).
 *
 * @param options - Optional filter options
 * @returns Object with videos, pagination state, filter state, and actions
 */
export function useVideos(options: UseVideosOptions = {}): UseVideosResult {
  const [videos, setVideos] = useState<VideoSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [typeFilter, setTypeFilter] = useState<VideoTypeFilter>(options.typeFilter ?? 'all')

  const fetchVideos = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: PAGE_SIZE.toString(),
      })

      if (typeFilter !== 'all') {
        params.set('type', typeFilter)
      }

      const response = await fetch(`/api/videos?${params}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Falha ao carregar vídeos')
      }

      const { data, pagination } = await response.json()
      setVideos(data || [])
      setTotalPages(pagination?.totalPages ?? 1)
      setTotalCount(pagination?.totalCount ?? 0)
    } catch (err) {
      log('ERROR', 'Failed to fetch videos', { error: err })
      setError(err instanceof Error ? err.message : 'Falha ao carregar vídeos')
      setVideos([])
    } finally {
      setIsLoading(false)
    }
  }, [page, typeFilter])

  // Fetch on mount and when page/filter changes
  useEffect(() => {
    fetchVideos()
  }, [fetchVideos])

  // Reset page when filter changes
  const handleTypeFilterChange = useCallback((type: VideoTypeFilter) => {
    setTypeFilter(type)
    setPage(1) // Reset to first page when filter changes
  }, [])

  return {
    videos,
    isLoading,
    error,
    refresh: fetchVideos,
    page,
    totalPages,
    totalCount,
    setPage,
    typeFilter,
    setTypeFilter: handleTypeFilterChange,
  }
}
