'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { log } from '@/lib/logger'
import type { NewsletterStatus } from '@/lib/newsletter/types'
import type { NewsletterNewsItem } from '@/types/newsletter'

interface UseNewsletterNewsResult {
  /** News candidates returned by POST (for selection). */
  candidates: NewsletterNewsItem[] | null
  /** Already confirmed news (from existing newsletter data). */
  confirmedNews: NewsletterNewsItem[] | null
  /** Current newsletter status. */
  newsletterStatus: NewsletterStatus | null
  isLoading: boolean
  /** Fetching news candidates from D-2. */
  isFetching: boolean
  /** Confirming selection via PATCH. */
  isConfirming: boolean
  error: string | null
  /** Total news found for D-2 (before LLM filtering). */
  totalFound: number
  /** Whether LLM was used to filter candidates. */
  llmFiltered: boolean
  /** Fetch news candidates via POST. */
  fetchNews: () => Promise<void>
  /** Confirm selection via PATCH. Returns true on success, false on error. */
  confirmSelection: (news: NewsletterNewsItem[]) => Promise<boolean>
}

export function useNewsletterNews(videoId: string | null): UseNewsletterNewsResult {
  const [candidates, setCandidates] = useState<NewsletterNewsItem[] | null>(null)
  const [confirmedNews, setConfirmedNews] = useState<NewsletterNewsItem[] | null>(null)
  const [newsletterStatus, setNewsletterStatus] = useState<NewsletterStatus | null>(null)
  const [isLoading, setIsLoading] = useState(() => videoId !== null)
  const [isFetching, setIsFetching] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalFound, setTotalFound] = useState(0)
  const [llmFiltered, setLlmFiltered] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Fetch existing newsletter data
  useEffect(() => {
    if (!videoId) {
      setCandidates(null)
      setConfirmedNews(null)
      setNewsletterStatus(null)
      setIsLoading(false)
      setIsFetching(false)
      setIsConfirming(false)
      setError(null)
      setTotalFound(0)
      setLlmFiltered(false)
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const run = async () => {
      setIsLoading(true)
      setError(null)
      setCandidates(null)
      setConfirmedNews(null)
      setNewsletterStatus(null)

      try {
        const response = await fetch(`/api/videos/${videoId}/newsletter`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return

        if (!response.ok) throw new Error('Falha ao carregar dados da newsletter')

        const { data } = await response.json()
        if (controller.signal.aborted) return

        setIsLoading(false)

        if (data) {
          setNewsletterStatus(data.status ?? null)
          // If news already confirmed (status >= news_selected), show them
          if (data.news && data.status && data.status !== 'idle' && data.status !== 'draft') {
            setConfirmedNews(data.news)
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!controller.signal.aborted) {
          log('ERROR', 'Failed in useNewsletterNews', { videoId, error: err })
          setIsLoading(false)
          setError(err instanceof Error ? err.message : 'Erro desconhecido')
        }
      }
    }

    run()
    return () => { controller.abort() }
  }, [videoId])

  // Fetch news candidates via POST
  const fetchNews = useCallback(async () => {
    if (!videoId) return

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setError(null)
    setIsFetching(true)
    setCandidates(null)
    setConfirmedNews(null)

    try {
      const response = await fetch(`/api/videos/${videoId}/newsletter/news`, {
        method: 'POST',
        signal: controller.signal,
      })

      if (controller.signal.aborted) return

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Erro ao buscar notícias')
      }

      const { data } = await response.json()
      if (controller.signal.aborted) return

      setCandidates(data.items)
      setTotalFound(data.totalFound)
      setLlmFiltered(data.llmFiltered)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsFetching(false)
      }
    }
  }, [videoId])

  // Confirm selection via PATCH
  const confirmSelection = useCallback(async (news: NewsletterNewsItem[]): Promise<boolean> => {
    if (!videoId) return false

    setError(null)
    setIsConfirming(true)

    try {
      const response = await fetch(`/api/videos/${videoId}/newsletter/news`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Erro ao confirmar seleção')
      }

      const { data } = await response.json()
      setConfirmedNews(news)
      setNewsletterStatus(data.status)
      setCandidates(null)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return false
    } finally {
      setIsConfirming(false)
    }
  }, [videoId])

  return {
    candidates,
    confirmedNews,
    newsletterStatus,
    isLoading,
    isFetching,
    isConfirming,
    error,
    totalFound,
    llmFiltered,
    fetchNews,
    confirmSelection,
  }
}
