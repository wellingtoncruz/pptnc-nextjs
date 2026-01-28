'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useWizard } from '@/hooks/use-wizard'
import { log } from '@/lib/logger'
import type { Video } from '@/types/video'
import type { Phase1Response } from '@/lib/llm'

import { WizardLayout } from './wizard-layout'
import { Phase1Critique } from './phases/phase-1-critique'

interface WizardOrchestratorProps {
  video: Video
  className?: string
}

/**
 * Orchestrator component for the wizard.
 *
 * This component is the main view when a video is selected.
 * Per processamento_video.md:
 * - Phase 1 opens automatically when video is selected
 * - LLM critique call happens IMMEDIATELY on video selection
 * - User navigates through phases via breadcrumb
 *
 * Responsibilities:
 * - Manages the wizard state via useWizard hook
 * - Initiates Phase 1 critique processing on mount (if not already done)
 * - Renders the appropriate phase component based on current phase
 */
export function WizardOrchestrator({
  video,
  className,
}: WizardOrchestratorProps) {
  const wizard = useWizard(video.id)
  const [videoData, setVideoData] = useState<Video>(video)
  const [critiqueResult, setCritiqueResult] = useState<Phase1Response | null>(null)

  // Track if critique processing has been initiated for this video
  const processingVideoIdRef = useRef<string | null>(null)

  // Keep video data in sync with prop
  useEffect(() => {
    setVideoData(video)
  }, [video])

  /**
   * Process Phase 1 critique via API.
   * Called by orchestrator, not by Phase1Critique component.
   */
  const processPhase1Critique = useCallback(async () => {
    log('INFO', 'Processing Phase 1 critique', { videoId: video.id })

    const spinnerId = wizard.addSpinner(1, 'Estou assistindo o episódio para te dar uma opinião sincera...')
    wizard.setPhaseLoading(1)

    try {
      const response = await fetch(`/api/wizard/phase/1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || 'Erro ao processar fase 1'
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const phase1Data = result.data as Phase1Response

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseData(1, phase1Data)
      wizard.addAlert(1, 'Crítica do Especialista', phase1Data.critique, 'success')
      setCritiqueResult(phase1Data)

      log('INFO', 'Phase 1 critique completed', { videoId: video.id })
    } catch (error) {
      wizard.removeSpinner(spinnerId)
      const message = error instanceof Error ? error.message : 'Erro ao processar crítica'
      wizard.setPhaseError(1, message)
      wizard.addAlert(1, 'Erro', message, 'error')
      log('ERROR', 'Phase 1 critique failed', { videoId: video.id, error: message })
    }
  }, [video.id, wizard])

  /**
   * Initialize Phase 1 on mount.
   *
   * Per processamento_video.md:
   * - If video.critique exists: display it immediately (no LLM call)
   * - If video.critique doesn't exist: call LLM immediately
   */
  useEffect(() => {
    // Skip if we've already processed this video
    if (processingVideoIdRef.current === video.id) {
      return
    }

    // Check if critique already exists on the video
    if (video.critique) {
      log('INFO', 'Phase 1 critique already exists, displaying', { videoId: video.id })

      // Mark as processed for this video
      processingVideoIdRef.current = video.id

      // Create Phase1Response from persisted critique
      const existingCritique: Phase1Response = {
        critique: video.critique,
        highlights: [],
        suggestions: [],
      }

      // Set phase as completed with existing data
      wizard.setPhaseData(1, existingCritique)
      wizard.addAlert(1, 'Crítica do Especialista', video.critique, 'success')
      setCritiqueResult(existingCritique)
      return
    }

    // No critique exists - process via LLM
    log('INFO', 'No critique found, initiating LLM processing', { videoId: video.id })
    processingVideoIdRef.current = video.id
    processPhase1Critique()
  }, [video.id, video.critique, wizard, processPhase1Critique])

  /**
   * Render the interactive panel content based on current phase.
   */
  const renderInteractivePanel = () => {
    switch (wizard.currentPhase) {
      case 1:
        return (
          <Phase1Critique
            wizard={wizard}
            video={videoData}
            critique={critiqueResult}
          />
        )
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
        // TODO: Implement other phases
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Fase {wizard.currentPhase} - Em desenvolvimento</p>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <WizardLayout
      wizard={wizard}
      interactivePanel={renderInteractivePanel()}
      className={className}
    />
  )
}
