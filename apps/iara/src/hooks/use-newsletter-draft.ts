'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { log } from '@/lib/logger'
import type { NewsletterStatus } from '@/lib/newsletter/types'

interface UseNewsletterDraftResult {
  draft: string | null
  newsletterStatus: NewsletterStatus | null
  isLoading: boolean
  isGenerating: boolean
  error: string | null
  generate: (additionalContext?: string) => Promise<void>
  saveDraft: (draft: string) => Promise<void>
  retry: () => void
}

export function useNewsletterDraft(videoId: string | null): UseNewsletterDraftResult {
  const [draft, setDraft] = useState<string | null>(null)
  const [newsletterStatus, setNewsletterStatus] = useState<NewsletterStatus | null>(null)
  const [isLoading, setIsLoading] = useState(() => videoId !== null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastAdditionalContextRef = useRef<string | undefined>()

  // Fetch existing newsletter data
  const fetchData = useCallback(async (signal: AbortSignal) => {
    if (!videoId) return null
    const response = await fetch(`/api/videos/${videoId}/newsletter`, { signal })
    if (!response.ok) throw new Error('Falha ao carregar dados da newsletter')
    const { data } = await response.json()
    return data
  }, [videoId])

  // Generate draft via LLM
  const generateDraft = useCallback(async (
    signal: AbortSignal,
    additionalContext?: string
  ) => {
    const options: RequestInit = {
      method: 'POST',
      signal,
    }
    if (additionalContext) {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify({ additionalContext })
    }
    const response = await fetch(
      `/api/videos/${videoId}/newsletter/draft`,
      options
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error?.message || 'Erro ao gerar draft da newsletter')
    }
    const { data } = await response.json()
    return data
  }, [videoId])

  // Main effect: fetch existing data (does NOT auto-generate)
  useEffect(() => {
    if (!videoId) {
      setDraft(null)
      setNewsletterStatus(null)
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
      setDraft(null)
      setNewsletterStatus(null)

      try {
        const existing = await fetchData(controller.signal)
        if (controller.signal.aborted) return
        setIsLoading(false)

        if (existing) {
          setDraft(existing.draft ?? null)
          setNewsletterStatus(existing.status ?? null)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!controller.signal.aborted) {
          log('ERROR', 'Failed in useNewsletterDraft', { videoId, error: err })
          setIsLoading(false)
          setError(err instanceof Error ? err.message : 'Erro desconhecido')
        }
      }
    }

    run()
    return () => { controller.abort() }
  }, [videoId, fetchData])

  // Generate: explicit user action or auto-triggered
  const generate = useCallback(async (additionalContext?: string) => {
    if (!videoId) return
    lastAdditionalContextRef.current = additionalContext

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setError(null)
    setIsLoading(false) // Clear stale loading state (initial fetch may have been aborted)
    setIsGenerating(true)

    try {
      const result = await generateDraft(controller.signal, additionalContext)
      if (controller.signal.aborted) return
      setDraft(result.draft)
      setNewsletterStatus('draft')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGenerating(false)
      }
    }
  }, [videoId, generateDraft])

  // Save draft via PATCH (for auto-save)
  const saveDraft = useCallback(async (draftValue: string) => {
    if (!videoId) return
    const response = await fetch(`/api/videos/${videoId}/newsletter`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: draftValue }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error?.message || 'Erro ao salvar draft')
    }
  }, [videoId])

  // Retry: re-dispatch generate with last additionalContext
  const retry = useCallback(() => {
    generate(lastAdditionalContextRef.current)
  }, [generate])

  return { draft, newsletterStatus, isLoading, isGenerating, error, generate, saveDraft, retry }
}
