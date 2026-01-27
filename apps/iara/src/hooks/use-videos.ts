'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import { log } from '@/lib/logger'
import type { VideoSummary, VideoTypeFilter } from '@/types/video'

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

  // AbortController ref for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchVideos = useCallback(async () => {
    // Cancel any in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

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

      const response = await fetch(`/api/videos?${params}`, {
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Falha ao carregar vídeos')
      }

      const { data, pagination } = await response.json()

      // Only update state if this request wasn't aborted
      if (!controller.signal.aborted) {
        setVideos(data || [])
        setTotalPages(pagination?.totalPages ?? 1)
        setTotalCount(pagination?.totalCount ?? 0)
      }
    } catch (err) {
      // Ignore abort errors - they're expected when cancelling requests
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      log('ERROR', 'Failed to fetch videos', { error: err })
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar vídeos')
        setVideos([])
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [page, typeFilter])

  // Fetch on mount and when page/filter changes
  useEffect(() => {
    fetchVideos()

    // Cleanup: abort request on unmount or when dependencies change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
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
