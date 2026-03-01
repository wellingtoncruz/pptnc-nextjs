'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { log } from '@/lib/logger'
import type { NewsletterData } from '@/types/newsletter'

interface UseNewsletterReportResult {
  report: string | null
  formatPrompt: string
  isGenerating: boolean
  error: string | null
  generate: (formatPrompt: string) => Promise<boolean>
  saveReport: (report: string) => Promise<void>
  setFormatPrompt: (prompt: string) => void
  retry: () => void
}

export function useNewsletterReport(
  videoId: string | null,
  newsletterData: NewsletterData | null,
  defaultFormatPrompt: string
): UseNewsletterReportResult {
  const [report, setReport] = useState<string | null>(newsletterData?.report ?? null)
  const [formatPrompt, setFormatPrompt] = useState(
    newsletterData?.formatPrompt || defaultFormatPrompt
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync from props when newsletterData changes (e.g., parent re-fetch after status change)
  const hasUserEditedRef = useRef(false)
  useEffect(() => {
    if (hasUserEditedRef.current) return
    setReport(newsletterData?.report ?? null)
    setFormatPrompt(newsletterData?.formatPrompt || defaultFormatPrompt)
  }, [newsletterData, defaultFormatPrompt])

  const lastFormatPromptRef = useRef(formatPrompt)
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleSetFormatPrompt = useCallback((prompt: string) => {
    hasUserEditedRef.current = true
    setFormatPrompt(prompt)
  }, [])

  const generate = useCallback(async (prompt: string): Promise<boolean> => {
    if (!videoId) return false
    hasUserEditedRef.current = false
    lastFormatPromptRef.current = prompt

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setError(null)
    setIsGenerating(true)

    try {
      const response = await fetch(`/api/videos/${videoId}/newsletter/format`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formatPrompt: prompt }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Erro ao gerar relatório da newsletter')
      }

      const { data } = await response.json()
      if (controller.signal.aborted) return false
      setReport(data.report)
      return true
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return false
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido'
        log('ERROR', 'Failed in useNewsletterReport', { videoId, error: message })
        setError(message)
      }
      return false
    } finally {
      if (!controller.signal.aborted) {
        setIsGenerating(false)
      }
    }
  }, [videoId])

  const saveReport = useCallback(async (reportValue: string) => {
    if (!videoId) return
    const response = await fetch(`/api/videos/${videoId}/newsletter`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: reportValue }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error?.message || 'Erro ao salvar relatório')
    }
  }, [videoId])

  const retry = useCallback(async () => {
    await generate(lastFormatPromptRef.current)
  }, [generate])

  return {
    report,
    formatPrompt,
    isGenerating,
    error,
    generate,
    saveReport,
    setFormatPrompt: handleSetFormatPrompt,
    retry,
  }
}
