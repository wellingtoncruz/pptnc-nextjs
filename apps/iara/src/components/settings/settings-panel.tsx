'use client'

import { useEffect, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsPageClient } from './settings-page-client'
import type { SerializedPodcast } from '@/types/podcast'

/**
 * Settings panel for the detail view.
 * Fetches podcast data and renders settings forms.
 */
export function SettingsPanel() {
  const [podcast, setPodcast] = useState<SerializedPodcast | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPodcast() {
      try {
        const response = await fetch('/api/podcast')
        if (!response.ok) {
          throw new Error('Erro ao carregar configurações')
        }
        const data = await response.json()
        setPodcast(data.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setIsLoading(false)
      }
    }

    fetchPodcast()
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex h-14 items-center border-b border-border px-6">
          <h2 className="text-lg font-semibold">Configurações</h2>
        </div>
        <div className="flex-1 p-6 space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (error || !podcast) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background text-center">
        <p className="text-destructive">{error || 'Podcast não encontrado'}</p>
      </div>
    )
  }

  return (
    <div data-testid="settings-panel" className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-6">
        <h2 className="text-lg font-semibold">Configurações</h2>
      </div>
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-6">
          <SettingsPageClient podcast={podcast} />
        </div>
      </ScrollArea>
    </div>
  )
}
