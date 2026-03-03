'use client'

import { useCallback, useRef, useState } from 'react'

import { log } from '@/lib/logger'

/** Progress steps emitted by the news image SSE stream */
export type NewsImageStep = 'generating_image' | 'uploading' | 'saving' | null

interface UseNewsImageResult {
  /** Proxy URL for the image (via authenticated API route), or null */
  imageUrl: string | null
  isGenerating: boolean
  /** Current SSE progress step during generation */
  generatingStep: NewsImageStep
  error: string | null
  /** Generate image. Returns true on success. */
  generateImage: (additionalContext?: string) => Promise<boolean>
}

/**
 * Parse SSE events from a ReadableStream response body.
 */
async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (eventType: string, data: Record<string, unknown>) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal.aborted) break
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const block of parts) {
        if (!block.trim()) continue
        const eventMatch = block.match(/event: (\w+)/)
        if (!eventMatch) continue

        const dataLines = block.split('\n')
          .filter(line => line.startsWith('data: '))
          .map(line => line.slice(6))
        if (dataLines.length === 0) continue

        try {
          const data = JSON.parse(dataLines.join('\n'))
          onEvent(eventMatch[1], data)
        } catch {
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Hook for news image generation via SSE.
 *
 * Simpler than useNewsletterImage: no initial data fetch (image comes from news prop),
 * only 1 direct call to Gemini Image (no intermediate prompt generation).
 *
 * @param newsId - The news document ID
 * @param initialImageUrl - Existing image URL from the news document (undefined = no image)
 * @see Story 18.10
 */
export function useNewsImage(newsId: string, initialImageUrl?: string): UseNewsImageResult {
  const [imageUrl, setImageUrl] = useState<string | null>(
    initialImageUrl ? `/api/news/${newsId}/image?t=${Date.now()}` : null
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingStep, setGeneratingStep] = useState<NewsImageStep>(null)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const generateImage = useCallback(async (additionalContext?: string): Promise<boolean> => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setError(null)
    setIsGenerating(true)
    setGeneratingStep(null)

    let success = false

    try {
      const body: Record<string, string> = {}
      if (additionalContext) body.additionalContext = additionalContext

      const hasBody = Object.keys(body).length > 0
      const options: RequestInit = {
        method: 'POST',
        signal: controller.signal,
        ...(hasBody ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        } : {}),
      }

      const response = await fetch(
        `/api/news/${newsId}/generate-image`,
        options
      )

      if (controller.signal.aborted) return false

      // Validation errors return JSON (non-200)
      if (!response.ok) {
        const json = await response.json().catch(() => ({}))
        throw new Error(json.error?.message || 'Erro ao gerar imagem da notícia')
      }

      if (!response.body) {
        throw new Error('Resposta sem body')
      }

      await parseSSEStream(response.body, controller.signal, (eventType, data) => {
        if (controller.signal.aborted) return

        if (eventType === 'progress') {
          setGeneratingStep(data.step as NewsImageStep)
        } else if (eventType === 'complete') {
          setImageUrl(`/api/news/${newsId}/image?t=${Date.now()}`)
          success = true
        } else if (eventType === 'error') {
          setError((data.message as string) || 'Erro ao gerar imagem da notícia')
        }
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return false
      if (!controller.signal.aborted) {
        log('ERROR', 'Failed in useNewsImage', { newsId, error: err })
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGenerating(false)
        setGeneratingStep(null)
      }
    }

    return success
  }, [newsId])

  return {
    imageUrl,
    isGenerating,
    generatingStep,
    error,
    generateImage,
  }
}
