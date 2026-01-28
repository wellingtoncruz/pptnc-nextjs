'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Guest } from '@/types/video'

/**
 * Flat context data structure.
 * theme: episode theme
 * guests: array where guests[0] is co-host if present
 */
interface ContextData {
  theme?: string
  guests?: Guest[]
}

interface ContextInputsPreviewProps {
  /** Episode ID to fetch context for */
  episodeId: string
  /** Episode title for display */
  episodeTitle: string
  /** Pre-loaded theme (optional) */
  preloadedTheme?: string
  /** Pre-loaded guests (optional) */
  preloadedGuests?: Guest[]
}

/**
 * Preview component showing episode context data.
 *
 * Shows theme and guests in a read-only format.
 * Note: guests[0] is the co-host when present.
 */
export function ContextInputsPreview({
  episodeId,
  episodeTitle,
  preloadedTheme,
  preloadedGuests,
}: ContextInputsPreviewProps) {
  const hasPreloaded = preloadedTheme !== undefined || preloadedGuests !== undefined
  const [context, setContext] = useState<ContextData | null>(
    hasPreloaded ? { theme: preloadedTheme, guests: preloadedGuests } : null
  )
  const [isLoading, setIsLoading] = useState(!hasPreloaded)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (hasPreloaded) {
      setContext({ theme: preloadedTheme, guests: preloadedGuests })
      setIsLoading(false)
      return
    }

    // AbortController for cleanup on unmount
    const abortController = new AbortController()

    // Fetch context from API
    const fetchContext = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/videos/${episodeId}/context`, {
          signal: abortController.signal,
        })
        if (!response.ok) {
          throw new Error('Failed to load context')
        }
        const data = await response.json()
        setContext({
          theme: data.data?.theme ?? undefined,
          guests: data.data?.guests ?? undefined,
        })
      } catch (err) {
        // Ignore abort errors (component unmounted)
        if (err instanceof Error && err.name === 'AbortError') return
        setError('Não foi possível carregar o contexto do episódio.')
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchContext()

    // Cleanup: abort fetch on unmount
    return () => abortController.abort()
  }, [episodeId, hasPreloaded, preloadedTheme, preloadedGuests])

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-lg border p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (!context) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          Nenhum contexto disponível para este episódio.
        </p>
      </div>
    )
  }

  // Note: In the legacy schema, guests[0] is the co-host when present.
  // We display all guests the same way since we don't have a separate coHost field.
  const guests = context.guests ?? []

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-medium text-sm">
        Contexto de: <span className="text-muted-foreground">{episodeTitle}</span>
      </h4>

      {/* Theme */}
      {context.theme && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tema
          </p>
          <p className="text-sm">{context.theme}</p>
        </div>
      )}

      {/* Guests (guests[0] is co-host when present) */}
      {guests.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Participantes ({guests.length})
          </p>
          <ul className="text-sm space-y-1">
            {guests.map((guest, index) => (
              <li key={index}>
                {guest.name} - {guest.role} @ {guest.company}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
