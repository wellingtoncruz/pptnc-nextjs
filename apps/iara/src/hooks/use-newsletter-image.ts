'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { log } from '@/lib/logger'
import type { NewsletterStatus } from '@/lib/newsletter/types'

/** Progress steps emitted by the SSE stream */
export type ImageGeneratingStep = 'generating_prompt' | 'generating_image' | 'uploading' | 'saving' | null

interface UseNewsletterImageResult {
  /** Proxy URL for the image (via authenticated API route), or null */
  imageUrl: string | null
  imagePrompt: string | null
  newsletterStatus: NewsletterStatus | null
  isLoading: boolean
  isGenerating: boolean
  /** Current SSE progress step during generation */
  generatingStep: ImageGeneratingStep
  error: string | null
  /** Prompt preserved when Call 2 (image gen) fails but Call 1 (prompt gen) succeeded */
  errorImagePrompt: string | null
  /** Generate image with full flow (Call 1 + Call 2). Returns true on success. */
  generate: (additionalContext?: string) => Promise<boolean>
  /** Regenerate image using an edited prompt (skip Call 1). Returns true on success. */
  regenerateFromPrompt: (editedPrompt: string) => Promise<boolean>
  retry: () => void
}

/**
 * Parse SSE events from a ReadableStream response body.
 * Calls onEvent for each parsed event.
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

      // Split by double newline (SSE event separator)
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const block of parts) {
        if (!block.trim()) continue
        const eventMatch = block.match(/event: (\w+)/)
        if (!eventMatch) continue

        // Accumulate all data: lines (SSE spec allows multi-line data)
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

export function useNewsletterImage(videoId: string | null): UseNewsletterImageResult {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePrompt, setImagePrompt] = useState<string | null>(null)
  const [newsletterStatus, setNewsletterStatus] = useState<NewsletterStatus | null>(null)
  const [isLoading, setIsLoading] = useState(() => videoId !== null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingStep, setGeneratingStep] = useState<ImageGeneratingStep>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorImagePrompt, setErrorImagePrompt] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastAdditionalContextRef = useRef<string | undefined>()
  const lastEditedPromptRef = useRef<string | undefined>()

  // Fetch existing newsletter data
  useEffect(() => {
    if (!videoId) {
      setImageUrl(null)
      setImagePrompt(null)
      setNewsletterStatus(null)
      setIsLoading(false)
      setIsGenerating(false)
      setGeneratingStep(null)
      setError(null)
      setErrorImagePrompt(null)
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const run = async () => {
      setIsLoading(true)
      setError(null)
      setErrorImagePrompt(null)
      setImageUrl(null)
      setImagePrompt(null)
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
          // imageUrl in Firestore is a GCS file path; serve via authenticated proxy
          setImageUrl(data.imageUrl ? `/api/videos/${videoId}/newsletter/image?t=${Date.now()}` : null)
          setImagePrompt(data.imagePrompt ?? null)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!controller.signal.aborted) {
          log('ERROR', 'Failed in useNewsletterImage', { videoId, error: err })
          setIsLoading(false)
          setError(err instanceof Error ? err.message : 'Erro desconhecido')
        }
      }
    }

    run()
    return () => { controller.abort() }
  }, [videoId])

  /**
   * Internal: POST to image route and parse SSE stream.
   * Supports both full generation (Call 1 + Call 2) and edited prompt (Call 2 only).
   */
  const postAndStream = useCallback(async (body: Record<string, string>): Promise<boolean> => {
    if (!videoId) return false

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setError(null)
    setErrorImagePrompt(null)
    setIsLoading(false)
    setIsGenerating(true)
    setGeneratingStep(null)

    let success = false

    try {
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
        `/api/videos/${videoId}/newsletter/image`,
        options
      )

      if (controller.signal.aborted) return false

      // Validation errors return JSON (non-200)
      if (!response.ok) {
        const json = await response.json().catch(() => ({}))
        throw new Error(json.error?.message || 'Erro ao gerar imagem da newsletter')
      }

      // Success: parse SSE stream
      if (!response.body) {
        throw new Error('Resposta sem body')
      }

      await parseSSEStream(response.body, controller.signal, (eventType, data) => {
        if (controller.signal.aborted) return

        if (eventType === 'progress') {
          setGeneratingStep(data.step as ImageGeneratingStep)
        } else if (eventType === 'complete') {
          setImageUrl(`/api/videos/${videoId}/newsletter/image?t=${Date.now()}`)
          setImagePrompt(data.imagePrompt as string)
          setNewsletterStatus('image_ready')
          success = true
        } else if (eventType === 'error') {
          if (data.imagePrompt) {
            setErrorImagePrompt(data.imagePrompt as string)
          }
          setError((data.message as string) || 'Erro ao gerar imagem da newsletter')
        }
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return false
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGenerating(false)
        setGeneratingStep(null)
      }
    }

    return success
  }, [videoId])

  // Generate image via POST (full flow: Call 1 + Call 2)
  const generate = useCallback(async (additionalContext?: string): Promise<boolean> => {
    lastAdditionalContextRef.current = additionalContext
    lastEditedPromptRef.current = undefined
    const body: Record<string, string> = {}
    if (additionalContext) body.additionalContext = additionalContext
    return postAndStream(body)
  }, [postAndStream])

  // Regenerate image using an edited prompt (skip Call 1)
  const regenerateFromPrompt = useCallback(async (editedPrompt: string): Promise<boolean> => {
    lastEditedPromptRef.current = editedPrompt
    lastAdditionalContextRef.current = undefined
    return postAndStream({ editedPrompt })
  }, [postAndStream])

  // Retry: re-dispatch last action
  const retry = useCallback(async () => {
    if (lastEditedPromptRef.current) {
      await regenerateFromPrompt(lastEditedPromptRef.current)
    } else {
      await generate(lastAdditionalContextRef.current)
    }
  }, [generate, regenerateFromPrompt])

  return {
    imageUrl,
    imagePrompt,
    newsletterStatus,
    isLoading,
    isGenerating,
    generatingStep,
    error,
    errorImagePrompt,
    generate,
    regenerateFromPrompt,
    retry,
  }
}
