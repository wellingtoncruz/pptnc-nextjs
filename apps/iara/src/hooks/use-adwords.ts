'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { runAsyncJob } from '@/lib/jobs/run-async-job'
import { log } from '@/lib/logger'
import type { AdwordsData } from '@/types/adwords'

interface UseAdwordsResult {
  data: AdwordsData | null
  isLoading: boolean
  isGenerating: boolean
  error: string | null
  retry: () => void
  reprocess: (additionalContext: string) => Promise<void>
}

export function useAdwords(
  videoId: string | null,
  hasPrerequisites: boolean
): UseAdwordsResult {
  const [data, setData] = useState<AdwordsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Fetch existing adwords data
  const fetchData = useCallback(async (signal: AbortSignal): Promise<AdwordsData | null> => {
    if (!videoId) return null
    const response = await fetch(`/api/videos/${videoId}/adwords`, { signal })
    if (!response.ok) throw new Error('Falha ao carregar dados AdWords')
    const { data } = await response.json()
    return data
  }, [videoId])

  // Generate adwords data via LLM
  const generate = useCallback(async (
    signal: AbortSignal,
    additionalContext?: string
  ): Promise<AdwordsData> => {
    // Async job (Epic 27) — escapa do edge timeout (~60s) do Cloud Run.
    return runAsyncJob<AdwordsData>({
      url: `/api/videos/${videoId}/adwords/generate`,
      body: additionalContext ? { additionalContext } : undefined,
      signal,
    })
  }, [videoId])

  // Main effect: fetch + auto-generate
  useEffect(() => {
    if (!videoId) {
      setData(null)
      setIsLoading(false)
      setIsGenerating(false)
      setError(null)
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const run = async () => {
      setIsLoading(true)
      setError(null)
      setIsGenerating(false)
      setData(null)

      try {
        const existing = await fetchData(controller.signal)
        if (controller.signal.aborted) return
        setIsLoading(false)

        if (existing) {
          setData(existing)
          return
        }

        // No data exists
        if (!hasPrerequisites) {
          setError('ineligible')
          return
        }

        // Auto-generate
        setIsGenerating(true)
        const generated = await generate(controller.signal)
        if (controller.signal.aborted) return
        setData(generated)
        setIsGenerating(false)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!controller.signal.aborted) {
          log('ERROR', 'Failed in useAdwords', { videoId, error: err })
          setIsLoading(false)
          setIsGenerating(false)
          setError(err instanceof Error ? err.message : 'Erro desconhecido')
        }
      }
    }

    run()
    return () => { controller.abort() }
  }, [videoId, hasPrerequisites, fetchData, generate])

  // Retry: re-dispatch generate
  const retry = useCallback(async () => {
    if (!videoId) return
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setError(null)
    setIsGenerating(true)

    try {
      const generated = await generate(controller.signal)
      if (controller.signal.aborted) return
      setData(generated)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsGenerating(false)
    }
  }, [videoId, generate])

  // Reprocess with additionalContext — re-throws for caller
  const reprocess = useCallback(async (additionalContext: string) => {
    if (!videoId) return
    setIsGenerating(true)
    setError(null)

    try {
      // Async job (Epic 27) — escapa do edge timeout (~60s) do Cloud Run.
      const newData = await runAsyncJob<AdwordsData>({
        url: `/api/videos/${videoId}/adwords/generate`,
        body: { additionalContext },
        signal: abortControllerRef.current?.signal,
      })
      setData(newData)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      throw err
    } finally {
      setIsGenerating(false)
    }
  }, [videoId])

  return { data, isLoading, isGenerating, error, retry, reprocess }
}
