'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { log } from '@/lib/logger'
import type { VideoSummary } from '@/types/video'
import type { NewsletterData } from '@/types/newsletter'
import type { NewsletterStatus } from '@/lib/newsletter/types'

import { NewsletterDraftPhase } from './newsletter-draft-phase'
import { NewsletterImagePhase } from './newsletter-image-phase'
import { NewsletterNewsPhase } from './newsletter-news-phase'
import { NewsletterPhaseNav } from './newsletter-phase-nav'
import { NewsletterReportPhase } from './newsletter-report-phase'

interface NewsletterWorkPanelProps {
  videoId: string
  video: VideoSummary
}

/**
 * Maps newsletter status to the active phase (1-4).
 */
function statusToPhase(status: NewsletterStatus | undefined): number {
  switch (status) {
    case 'draft': return 1
    case 'news_selected': return 2
    case 'image_ready': return 3
    case 'completed': return 4
    default: return 1 // idle or undefined
  }
}

/**
 * Maps newsletter status to the maximum reachable phase.
 */
function statusToMaxReachable(status: NewsletterStatus | undefined): number {
  switch (status) {
    case 'draft': return 2
    case 'news_selected': return 3
    case 'image_ready': return 4
    case 'completed': return 4
    default: return 1 // idle or undefined
  }
}

/**
 * Work panel for newsletter generation.
 * Displays phase navigation and renders the active phase component.
 */
export function NewsletterWorkPanel({ videoId, video }: NewsletterWorkPanelProps) {
  // Track effective status internally so child phases can update it
  const [effectiveStatus, setEffectiveStatus] = useState<NewsletterStatus | undefined>()
  const [newsletterData, setNewsletterData] = useState<NewsletterData | null>(null)
  const [defaultFormatPrompt, setDefaultFormatPrompt] = useState('')
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activePhase, setActivePhase] = useState(1)

  const effectiveStatusRef = useRef(effectiveStatus)
  effectiveStatusRef.current = effectiveStatus

  const maxReachablePhase = statusToMaxReachable(effectiveStatus)

  // Fetch real newsletter data + podcast format prompt on mount / videoId change
  useEffect(() => {
    setIsLoadingStatus(true)
    setFetchError(null)
    setEffectiveStatus(undefined)
    setNewsletterData(null)
    setActivePhase(1)

    Promise.all([
      fetch(`/api/videos/${videoId}/newsletter`)
        .then((res) => (res.ok ? res.json() : null)),
      fetch('/api/podcast')
        .then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([newsletterResult, podcastResult]) => {
        const data = newsletterResult?.data as NewsletterData | undefined
        if (data?.status) {
          setEffectiveStatus(data.status)
          setNewsletterData(data)
          setActivePhase(statusToMaxReachable(data.status))
        }
        const formatDescription = podcastResult?.data?.prompts?.episode?.newsletter?.format?.description
        if (formatDescription) {
          setDefaultFormatPrompt(formatDescription)
        }
      })
      .catch((err) => {
        log('ERROR', 'Failed to fetch newsletter status', { videoId, error: err })
        setFetchError('Falha ao carregar dados da newsletter. Verifique sua conexão.')
      })
      .finally(() => setIsLoadingStatus(false))
  }, [videoId])

  const handlePhaseChange = (phase: number) => {
    if (phase <= maxReachablePhase) {
      setActivePhase(phase)
    }
  }

  // Called by child phases when newsletter status changes (e.g., draft confirmed, news selected)
  const handleStatusChange = useCallback((newStatus: NewsletterStatus) => {
    const prevStatus = effectiveStatusRef.current
    const isRegression = prevStatus !== undefined && statusToPhase(newStatus) < statusToPhase(prevStatus)

    setEffectiveStatus(newStatus)
    // Regression: navigate to the phase that was just redone
    // Progression: advance to the newly unlocked phase
    setActivePhase(isRegression ? statusToPhase(newStatus) : statusToMaxReachable(newStatus))

    // Re-fetch newsletter data so downstream phases see invalidated state
    fetch(`/api/videos/${videoId}/newsletter`)
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (result?.data) setNewsletterData(result.data as NewsletterData)
      })
      .catch(() => { /* re-fetch failure is non-fatal; downstream phases use stale data */ })
  }, [videoId])

  if (isLoadingStatus) {
    return (
      <div data-testid="newsletter-work-panel-loading" className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div data-testid="newsletter-work-panel-error" className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <AlertCircle className="size-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{fetchError}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFetchError(null)
            setIsLoadingStatus(true)
            Promise.all([
              fetch(`/api/videos/${videoId}/newsletter`)
                .then((res) => (res.ok ? res.json() : null)),
              fetch('/api/podcast')
                .then((res) => (res.ok ? res.json() : null)),
            ])
              .then(([newsletterResult, podcastResult]) => {
                const data = newsletterResult?.data as NewsletterData | undefined
                if (data?.status) {
                  setEffectiveStatus(data.status)
                  setNewsletterData(data)
                  setActivePhase(statusToMaxReachable(data.status))
                }
                const formatDescription = podcastResult?.data?.prompts?.episode?.newsletter?.format?.description
                if (formatDescription) {
                  setDefaultFormatPrompt(formatDescription)
                }
              })
              .catch((err) => {
                log('ERROR', 'Failed to fetch newsletter status (retry)', { videoId, error: err })
                setFetchError('Falha ao carregar dados da newsletter. Verifique sua conexão.')
              })
              .finally(() => setIsLoadingStatus(false))
          }}
        >
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div data-testid="newsletter-work-panel" className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-5 py-3">
        <h2 className="text-lg font-semibold truncate">{video.title}</h2>
      </div>

      {/* Phase navigation */}
      <NewsletterPhaseNav
        currentPhase={activePhase}
        maxReachablePhase={maxReachablePhase}
        onPhaseChange={handlePhaseChange}
      />

      {/* Phase content */}
      {activePhase === 1 ? (
        <div className="flex-1 overflow-hidden">
          <NewsletterDraftPhase videoId={videoId} video={video} onStatusChange={handleStatusChange} />
        </div>
      ) : activePhase === 2 ? (
        <div className="flex-1 overflow-hidden">
          <NewsletterNewsPhase videoId={videoId} newsletterStatus={effectiveStatus ?? null} onStatusChange={handleStatusChange} />
        </div>
      ) : activePhase === 3 ? (
        <div className="flex-1 overflow-hidden">
          <NewsletterImagePhase videoId={videoId} newsletterStatus={effectiveStatus ?? null} onStatusChange={handleStatusChange} />
        </div>
      ) : activePhase === 4 && newsletterData ? (
        <div className="flex-1 overflow-hidden">
          <NewsletterReportPhase
            videoId={videoId}
            newsletterData={newsletterData}
            defaultFormatPrompt={defaultFormatPrompt}
            onStatusChange={handleStatusChange}
          />
        </div>
      ) : null}
    </div>
  )
}
