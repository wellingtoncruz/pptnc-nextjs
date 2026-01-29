'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useWizard } from '@/hooks/use-wizard'
import { log } from '@/lib/logger'
import { phaseNeedsReviewConfirmation } from '@/lib/wizard'
import { buildDescriptionWithChapters } from '@/lib/youtube'
import type { Video, Guest } from '@/types/video'
import type { Phase1Response, Phase2Response, Phase3Response, Phase4Response, Phase5Response, Phase6Response, Phase7Response } from '@/lib/llm'

import { WizardLayout } from './wizard-layout'
import { Phase1Critique } from './phases/phase-1-critique'
import { Phase2EditCheck } from './phases/phase-2-edit-check'
import { Phase3Compliance } from './phases/phase-3-compliance'
import { Phase4Chapters } from './phases/phase-4-chapters'
import { Phase5Title } from './phases/phase-5-title'
import { Phase6Description } from './phases/phase-6-description'
import { Phase7Tags } from './phases/phase-7-tags'
import { Phase8Publish } from './phases/phase-8-publish'

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
  // Pass video data to useWizard for synchronous hydration on initialization
  // This ensures wizard state is correct from the first render
  const wizard = useWizard(video.id, video)
  const [videoData, setVideoData] = useState<Video>(video)
  const [critiqueResult, setCritiqueResult] = useState<Phase1Response | null>(null)
  const [editCheckResult, setEditCheckResult] = useState<Phase2Response | null>(null)
  const [editCheckError, setEditCheckError] = useState<string | null>(null)
  const [complianceResult, setComplianceResult] = useState<Phase3Response | null>(null)
  const [complianceError, setComplianceError] = useState<string | null>(null)
  const [chaptersResult, setChaptersResult] = useState<Phase4Response | null>(null)
  const [chaptersError, setChaptersError] = useState<string | null>(null)
  const [titlesResult, setTitlesResult] = useState<Phase5Response | null>(null)
  const [titlesError, setTitlesError] = useState<string | null>(null)
  const [descriptionResult, setDescriptionResult] = useState<Phase6Response | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [tagsResult, setTagsResult] = useState<Phase7Response | null>(null)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [phase8Error, setPhase8Error] = useState<string | null>(null)

  // Track if processing has been initiated for this video (per phase)
  const processingVideoIdRef = useRef<string | null>(null)
  const phase2ProcessingRef = useRef<string | null>(null)
  const phase3ProcessingRef = useRef<string | null>(null)
  const phase4ProcessingRef = useRef<string | null>(null)
  const phase5ProcessingRef = useRef<string | null>(null)
  const phase6ProcessingRef = useRef<string | null>(null)
  const phase7ProcessingRef = useRef<string | null>(null)

  // Track if revalidation is in progress for phases 5, 6, 7
  // These refs are set BEFORE any state changes to prevent race conditions
  // where the auto-processing effect might trigger during revalidation
  const isRevalidatingPhase5Ref = useRef(false)
  const isRevalidatingPhase6Ref = useRef(false)
  const isRevalidatingPhase7Ref = useRef(false)

  // Track if initial navigation has been done for this video
  const initialNavigationRef = useRef<string | null>(null)

  // Track if phases 2/3 were loaded from cache (need review confirmation)
  const [phase2FromCache, setPhase2FromCache] = useState(false)
  const [phase3FromCache, setPhase3FromCache] = useState(false)
  const [isConfirmingReview, setIsConfirmingReview] = useState(false)

  // Frontend LLM queue - ensures only one LLM call at a time
  // This prevents concurrent calls when multiple phases try to process simultaneously
  const llmQueueRef = useRef<Promise<void>>(Promise.resolve())

  /**
   * Enqueue an LLM processing function to run sequentially.
   * Returns a promise that resolves when the function completes.
   */
  const enqueueLLMCall = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      llmQueueRef.current = llmQueueRef.current
        .then(() => fn())
        .then(resolve)
        .catch(reject)
    })
  }, [])

  // Keep video data in sync with prop and reset cache flags when video changes
  useEffect(() => {
    setVideoData(video)
    // Reset cache flags when switching videos to avoid stale state
    setPhase2FromCache(false)
    setPhase3FromCache(false)
  }, [video])

  /**
   * Handle review confirmation navigation on mount.
   * Only runs once when video loads (per video ID).
   *
   * Per Story 5.3 - Smart Loading:
   * - Navigation to first incomplete phase is handled by useWizard hydration
   * - This effect only handles the special case of review confirmation for phases 2 and 3
   */
  useEffect(() => {
    // Skip if we've already navigated for this video
    if (initialNavigationRef.current === video.id) {
      return
    }
    initialNavigationRef.current = video.id

    // Check if phases 2 and 3 have data but need review
    const phase2NeedsReview = phaseNeedsReviewConfirmation(video, 2)
    const phase3NeedsReview = phaseNeedsReviewConfirmation(video, 3)

    // If phase 2 needs review and we're past it, go back to phase 2
    if (phase2NeedsReview && wizard.currentPhase > 2) {
      log('INFO', 'Auto-navigating to Phase 2 for review confirmation', {
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      setPhase2FromCache(true)
      wizard.goToPhase(2)
      return
    }

    // If phase 3 needs review and we're past it, go back to phase 3
    if (phase3NeedsReview && wizard.currentPhase > 3) {
      log('INFO', 'Auto-navigating to Phase 3 for review confirmation', {
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      setPhase3FromCache(true)
      wizard.goToPhase(3)
      return
    }
  }, [video, wizard])

  // Track if we've loaded cached data for this video
  const cachedDataLoadedRef = useRef<string | null>(null)

  /**
   * Load cached data from all completed phases into state and console.
   * This runs once per video on mount to populate the console with
   * results from phases that were completed previously.
   *
   * IMPORTANT: All alerts are added in phase order (1-7) to ensure
   * consistent display in the console. Individual phase effects should NOT
   * add alerts for cached data - only for newly processed data.
   */
  useEffect(() => {
    // Skip if we've already loaded for this video
    if (cachedDataLoadedRef.current === video.id) {
      return
    }
    cachedDataLoadedRef.current = video.id

    log('INFO', 'Loading cached data for all completed phases', { videoId: video.id })

    // Phase 1: Critique - add alert and set state
    if (video.critique) {
      const existingCritique: Phase1Response = {
        critique: video.critique,
        highlights: [],
        suggestions: [],
      }
      setCritiqueResult(existingCritique)
      wizard.addAlert(1, 'Crítica do Especialista', video.critique, 'success')
    }

    // Phase 2: Editing Issues
    if (video.editingIssues !== undefined) {
      const existingEditCheck: Phase2Response = {
        hasIssues: video.editingIssues.length > 0,
        issues: video.editingIssues,
      }
      setEditCheckResult(existingEditCheck)
      wizard.addAlert(
        2,
        'Checagem de Edição',
        video.editingIssues.length > 0
          ? `${video.editingIssues.length} ponto(s) de atenção identificado(s)`
          : 'Nenhum problema de edição identificado',
        'success'
      )
    }

    // Phase 3: Compliance
    if (video.riskAndCompliance !== undefined) {
      const existingCompliance: Phase3Response = {
        hasRisks: video.riskAndCompliance.length > 0,
        risks: video.riskAndCompliance.map(item => ({
          timestamp: item.timestamp,
          risk: item.risk,
          description: item.description,
        })),
      }
      setComplianceResult(existingCompliance)
      wizard.addAlert(
        3,
        'Riscos e Conformidade',
        video.riskAndCompliance.length > 0
          ? `${video.riskAndCompliance.length} risco(s) identificado(s)`
          : 'Nenhum risco de conformidade identificado',
        'success'
      )
    }

    // Phase 4: Chapters
    if (video.chapters && video.chapters.length > 0) {
      const existingChapters: Phase4Response = {
        chapters: video.chapters.map(item => ({
          timestamp: item.timestamp,
          title: item.title,
        })),
      }
      setChaptersResult(existingChapters)
      const chaptersText = existingChapters.chapters
        .map(c => `${c.timestamp} ${c.title}`)
        .join('\n')
      wizard.addAlert(4, 'Capítulos', chaptersText, 'success')
    }

    // Phase 5: Titles
    if (video.suggestedTitles && video.suggestedTitles.length > 0) {
      const existingTitles: Phase5Response = {
        titles: video.suggestedTitles,
      }
      setTitlesResult(existingTitles)
      wizard.addAlert(5, 'Títulos', `${video.suggestedTitles.length} sugestão(ões) de título`, 'success')
    }

    // Phase 6: Description
    if (video.description && video.description.trim().length > 0) {
      const existingDescription: Phase6Response = {
        description: video.description,
      }
      setDescriptionResult(existingDescription)
      // Show a truncated preview of the description
      const preview = video.description.length > 100
        ? video.description.substring(0, 100) + '...'
        : video.description
      wizard.addAlert(6, 'Descrição', preview, 'success')
    }

    // Phase 7: Tags
    if (video.tags && video.tags.length > 0) {
      const existingTags: Phase7Response = {
        tags: video.tags,
      }
      setTagsResult(existingTags)
      wizard.addAlert(7, 'Tags', `${video.tags.length} tag(s): ${video.tags.slice(0, 5).join(', ')}${video.tags.length > 5 ? '...' : ''}`, 'success')
    }
  }, [video, wizard])

  /**
   * Handle context changes from Phase1Critique.
   * Updates local video state so data persists when navigating between phases.
   */
  const handleContextChange = useCallback((context: { theme?: string; guests?: Guest[] }) => {
    setVideoData(prev => ({
      ...prev,
      theme: context.theme ?? prev.theme,
      guests: context.guests ?? prev.guests,
    }))
    log('INFO', 'Video context updated in orchestrator', { videoId: video.id, context })
  }, [video.id])

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
      // Don't call setPhaseData here - it would mark phase as completed
      // Phase 1 should only be completed when user clicks "Avançar" with all criteria met
      // (theme + guests + critique) per processamento_video.md
      wizard.setPhaseStatus(1, 'pending')
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
   *
   * NOTE: Cached data alerts are handled by the cachedDataLoadedRef effect
   * to ensure proper ordering in the console.
   */
  useEffect(() => {
    // Skip if we've already processed this video
    if (processingVideoIdRef.current === video.id) {
      return
    }

    // Check if critique already exists on the video
    if (video.critique) {
      log('INFO', 'Phase 1 critique already exists, skipping (handled by cached data effect)', { videoId: video.id })

      // Mark as processed for this video
      processingVideoIdRef.current = video.id

      // State is already set by cached data effect, no need to duplicate
      // Alert is also added by cached data effect in proper order
      return
    }

    // Only auto-process Phase 1 if we're actually on Phase 1
    // If user is on a later phase (e.g., restored from localStorage), don't auto-trigger LLM
    if (wizard.currentPhase !== 1) {
      log('INFO', 'Skipping Phase 1 auto-processing - not on Phase 1', {
        videoId: video.id,
        currentPhase: wizard.currentPhase
      })
      return
    }

    // No critique exists and we're on Phase 1 - process via LLM (enqueued to prevent concurrent calls)
    log('INFO', 'No critique found, initiating LLM processing', { videoId: video.id })
    processingVideoIdRef.current = video.id
    enqueueLLMCall(processPhase1Critique)
  }, [video.id, video.critique, wizard, wizard.currentPhase, processPhase1Critique, enqueueLLMCall])

  /**
   * Process Phase 2 editing check via API.
   * Called automatically when entering Phase 2.
   */
  const processPhase2EditCheck = useCallback(async () => {
    log('INFO', 'Processing Phase 2 edit check', { videoId: video.id })

    // Clear previous error state on retry
    setEditCheckError(null)

    const spinnerId = wizard.addSpinner(2, 'Verificando se existem falhas de edição perceptíveis...')
    wizard.setPhaseLoading(2)

    try {
      const response = await fetch(`/api/wizard/phase/2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || 'Erro ao processar fase 2'
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const phase2Data = result.data as Phase2Response

      wizard.removeSpinner(spinnerId)
      // Don't mark as completed yet - phase completes when user clicks "Avançar"
      wizard.setPhaseStatus(2, 'pending')
      wizard.addAlert(
        2,
        'Checagem de Edição',
        'Verifique acima se existem trechos que você deveria verificar. Obs: Nada substitui a revisão humana, ok?',
        'success'
      )
      setEditCheckResult(phase2Data)

      log('INFO', 'Phase 2 edit check completed', {
        videoId: video.id,
        hasIssues: phase2Data.hasIssues,
        issueCount: phase2Data.issues.length,
      })
    } catch (error) {
      wizard.removeSpinner(spinnerId)
      const message = error instanceof Error ? error.message : 'Erro ao verificar edição'
      wizard.setPhaseError(2, message)
      wizard.addAlert(2, 'Erro', message, 'error')
      setEditCheckError(message)
      log('ERROR', 'Phase 2 edit check failed', { videoId: video.id, error: message })
    }
  }, [video.id, wizard])

  /**
   * Auto-process Phase 2 when entering it.
   *
   * Per processamento_video.md, Phase 2 processes automatically.
   * Only triggers once per video (tracked via phase2ProcessingRef).
   */
  useEffect(() => {
    // Only process when on phase 2
    if (wizard.currentPhase !== 2) {
      return
    }

    // Skip if already processing or processed this video
    if (phase2ProcessingRef.current === video.id) {
      return
    }

    // Skip if editingIssues already exist on the video (previously processed)
    if (video.editingIssues !== undefined) {
      log('INFO', 'Phase 2 editing issues already exist, skipping (handled by cached data effect)', { videoId: video.id })
      phase2ProcessingRef.current = video.id

      // Mark as loaded from cache (needs review confirmation if not already reviewed)
      const needsReview = !video.reviewedPhases?.includes(2)
      setPhase2FromCache(needsReview)

      // State and alert already handled by cached data effect
      return
    }

    // Process via LLM (enqueued to prevent concurrent calls)
    log('INFO', 'No edit check found, initiating LLM processing for Phase 2', { videoId: video.id })
    phase2ProcessingRef.current = video.id
    enqueueLLMCall(processPhase2EditCheck)
  }, [wizard.currentPhase, video.id, video.editingIssues, wizard, processPhase2EditCheck, enqueueLLMCall])

  /**
   * Process Phase 3 compliance check via API.
   * Called automatically when entering Phase 3.
   */
  const processPhase3Compliance = useCallback(async () => {
    log('INFO', 'Processing Phase 3 compliance check', { videoId: video.id })

    // Clear previous error state on retry
    setComplianceError(null)

    const spinnerId = wizard.addSpinner(3, 'Verificando se existem pontos polêmicos ou riscos de conformidade...')
    wizard.setPhaseLoading(3)

    try {
      const response = await fetch(`/api/wizard/phase/3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || 'Erro ao processar fase 3'
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const phase3Data = result.data as Phase3Response

      wizard.removeSpinner(spinnerId)
      // Don't mark as completed yet - phase completes when user clicks "Avançar"
      wizard.setPhaseStatus(3, 'pending')
      wizard.addAlert(
        3,
        'Riscos e Conformidade',
        'Verifique acima se existem trechos que você deveria verificar.',
        'success'
      )
      setComplianceResult(phase3Data)

      log('INFO', 'Phase 3 compliance check completed', {
        videoId: video.id,
        hasRisks: phase3Data.hasRisks,
        riskCount: phase3Data.risks.length,
      })
    } catch (error) {
      wizard.removeSpinner(spinnerId)
      const message = error instanceof Error ? error.message : 'Erro ao verificar compliance'
      wizard.setPhaseError(3, message)
      wizard.addAlert(3, 'Erro', message, 'error')
      setComplianceError(message)
      log('ERROR', 'Phase 3 compliance check failed', { videoId: video.id, error: message })
    }
  }, [video.id, wizard])

  /**
   * Auto-process Phase 3 when entering it.
   *
   * Per processamento_video.md, Phase 3 processes automatically.
   * Only triggers once per video (tracked via phase3ProcessingRef).
   */
  useEffect(() => {
    // Only process when on phase 3
    if (wizard.currentPhase !== 3) {
      return
    }

    // Skip if phase 2 needs review - navigation will redirect back
    // This prevents race condition where LLM triggers before navigation takes effect
    if (phaseNeedsReviewConfirmation(video, 2)) {
      log('INFO', 'Skipping Phase 3 auto-processing - Phase 2 needs review', { videoId: video.id })
      return
    }

    // Skip if already processing or processed this video
    if (phase3ProcessingRef.current === video.id) {
      return
    }

    // Skip if riskAndCompliance already exist on the video (previously processed)
    if (video.riskAndCompliance !== undefined) {
      log('INFO', 'Phase 3 compliance data already exists, skipping (handled by cached data effect)', { videoId: video.id })
      phase3ProcessingRef.current = video.id

      // Mark as loaded from cache (needs review confirmation if not already reviewed)
      const needsReview = !video.reviewedPhases?.includes(3)
      setPhase3FromCache(needsReview)

      // State and alert already handled by cached data effect
      return
    }

    // Process via LLM (enqueued to prevent concurrent calls)
    log('INFO', 'No compliance check found, initiating LLM processing for Phase 3', { videoId: video.id })
    phase3ProcessingRef.current = video.id
    enqueueLLMCall(processPhase3Compliance)
  }, [wizard.currentPhase, video.id, video.riskAndCompliance, wizard, processPhase3Compliance, enqueueLLMCall])

  /**
   * Process Phase 4 chapters generation via API.
   * Called automatically when entering Phase 4.
   */
  const processPhase4Chapters = useCallback(async () => {
    log('INFO', 'Processing Phase 4 chapters generation', { videoId: video.id })

    // Clear previous error state on retry
    setChaptersError(null)

    const spinnerId = wizard.addSpinner(4, 'Fazendo a separação de capítulos...')
    wizard.setPhaseLoading(4)

    try {
      const response = await fetch(`/api/wizard/phase/4`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || 'Erro ao processar fase 4'
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const phase4Data = result.data as Phase4Response

      wizard.removeSpinner(spinnerId)
      // Don't mark as completed yet - phase completes when user clicks "Avançar"
      wizard.setPhaseStatus(4, 'pending')

      // Format chapters for console alert
      const chaptersText = phase4Data.chapters
        .map(c => `${c.timestamp} ${c.title}`)
        .join('\n')
      wizard.addAlert(4, 'Capítulos', chaptersText, 'success')
      setChaptersResult(phase4Data)

      // Update videoData with chapters (persisted by API route)
      setVideoData(prev => ({ ...prev, chapters: phase4Data.chapters }))

      log('INFO', 'Phase 4 chapters generation completed', {
        videoId: video.id,
        chapterCount: phase4Data.chapters.length,
      })
    } catch (error) {
      wizard.removeSpinner(spinnerId)
      const message = error instanceof Error ? error.message : 'Erro ao gerar capítulos'
      wizard.setPhaseError(4, message)
      wizard.addAlert(4, 'Erro', message, 'error')
      setChaptersError(message)
      log('ERROR', 'Phase 4 chapters generation failed', { videoId: video.id, error: message })
    }
  }, [video.id, wizard])

  /**
   * Auto-process Phase 4 when entering it.
   *
   * Per processamento_video.md, Phase 4 processes automatically.
   * Only triggers once per video (tracked via phase4ProcessingRef).
   */
  useEffect(() => {
    // Only process when on phase 4
    if (wizard.currentPhase !== 4) {
      return
    }

    // Skip if earlier phases need review - navigation will redirect back
    // This prevents race condition where LLM triggers before navigation takes effect
    if (phaseNeedsReviewConfirmation(video, 2) || phaseNeedsReviewConfirmation(video, 3)) {
      log('INFO', 'Skipping Phase 4 auto-processing - earlier phase needs review', { videoId: video.id })
      return
    }

    // Skip if already processing or processed this video
    if (phase4ProcessingRef.current === video.id) {
      return
    }

    // Skip if chapters already exist on the video (previously processed)
    if (video.chapters !== undefined && video.chapters.length > 0) {
      log('INFO', 'Phase 4 chapters already exist, skipping (handled by cached data effect)', { videoId: video.id })
      phase4ProcessingRef.current = video.id

      // State and alert already handled by cached data effect
      return
    }

    // Process via LLM (enqueued to prevent concurrent calls)
    log('INFO', 'No chapters found, initiating LLM processing for Phase 4', { videoId: video.id })
    phase4ProcessingRef.current = video.id
    enqueueLLMCall(processPhase4Chapters)
  }, [wizard.currentPhase, video.id, video.chapters, wizard, processPhase4Chapters, enqueueLLMCall])

  /**
   * Process Phase 5 title suggestions via API.
   * Called automatically when entering Phase 5.
   * Can also be called with additionalContext for revalidation.
   */
  const processPhase5Titles = useCallback(async (additionalContext?: string) => {
    log('INFO', 'Processing Phase 5 title suggestions', { videoId: video.id, hasAdditionalContext: !!additionalContext })

    // Clear previous error state on retry
    setTitlesError(null)

    const spinnerId = wizard.addSpinner(5, 'Pensando em boas sugestoes de titulo...')
    wizard.setPhaseLoading(5)

    try {
      const response = await fetch(`/api/wizard/phase/5`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: video.id,
          additionalContext,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || 'Erro ao processar fase 5'
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const phase5Data = result.data as Phase5Response

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(5, 'pending')
      wizard.addAlert(
        5,
        'Titulos',
        'Escolha o melhor titulo para o video, ou me de uma dica para eu poder ajudar melhor.',
        'success'
      )
      setTitlesResult(phase5Data)

      log('INFO', 'Phase 5 title suggestions completed', {
        videoId: video.id,
        titleCount: phase5Data.titles.length,
      })
    } catch (error) {
      wizard.removeSpinner(spinnerId)
      const message = error instanceof Error ? error.message : 'Erro ao gerar titulos'
      wizard.setPhaseError(5, message)
      wizard.addAlert(5, 'Erro', message, 'error')
      setTitlesError(message)
      log('ERROR', 'Phase 5 title suggestions failed', { videoId: video.id, error: message })
    }
  }, [video.id, wizard])

  /**
   * Auto-process Phase 5 when entering it.
   *
   * Per processamento_video.md, Phase 5 processes automatically.
   * Only triggers once per video (tracked via phase5ProcessingRef).
   *
   * Smart loading: If suggestedTitles already exist, use them instead of calling LLM.
   */
  useEffect(() => {
    // Only process when on phase 5
    if (wizard.currentPhase !== 5) {
      return
    }

    // CRITICAL: Skip if revalidation is in progress
    // This prevents double LLM calls when user clicks "Gerar novos títulos"
    if (isRevalidatingPhase5Ref.current) {
      log('INFO', 'Skipping Phase 5 auto-processing - revalidation in progress', { videoId: video.id })
      return
    }

    // Skip if earlier phases need review - navigation will redirect back
    if (phaseNeedsReviewConfirmation(video, 2) || phaseNeedsReviewConfirmation(video, 3)) {
      log('INFO', 'Skipping Phase 5 auto-processing - earlier phase needs review', { videoId: video.id })
      return
    }

    // Skip if already processing or processed this video
    if (phase5ProcessingRef.current === video.id) {
      return
    }

    // Smart loading: Check if suggestedTitles already exist
    if (video.suggestedTitles && video.suggestedTitles.length > 0) {
      log('INFO', 'Phase 5 suggested titles already exist, skipping (handled by cached data effect)', { videoId: video.id })
      phase5ProcessingRef.current = video.id

      // State and alert already handled by cached data effect
      return
    }

    // No suggestedTitles exist - process via LLM
    // Enqueued to prevent concurrent calls
    log('INFO', 'Initiating LLM processing for Phase 5', { videoId: video.id })
    phase5ProcessingRef.current = video.id
    enqueueLLMCall(processPhase5Titles)
  }, [wizard.currentPhase, video.id, video.suggestedTitles, wizard, processPhase5Titles, enqueueLLMCall])

  /**
   * Handle title selection from Phase 5.
   * Persists the selected title to the video document.
   *
   * SEO interdependency: When title changes, description and tags need to be regenerated.
   */
  const handleTitleSelect = useCallback(async (title: string) => {
    log('INFO', 'Title selected', { videoId: video.id, title })

    // Check if title actually changed (SEO interdependency)
    const titleChanged = title !== videoData.title

    try {
      // Persist the selected title via API
      const response = await fetch(`/api/videos/${video.id}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar titulo')
      }

      // Update local video data
      setVideoData(prev => ({ ...prev, title }))

      // SEO interdependency: If title changed, invalidate description and tags
      if (titleChanged) {
        log('INFO', 'Title changed, invalidating phases 6 and 7', { videoId: video.id, oldTitle: videoData.title, newTitle: title })

        // Clear description and tags results so they regenerate when entering those phases
        setDescriptionResult(null)
        setTagsResult(null)
        phase6ProcessingRef.current = null
        phase7ProcessingRef.current = null

        // Invalidate phases 6, 7, 8 in wizard state
        wizard.invalidateFromPhase(5)
      }

      log('INFO', 'Title persisted successfully', { videoId: video.id, title })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar titulo'
      log('ERROR', 'Failed to persist title', { videoId: video.id, error: message })
      wizard.addAlert(5, 'Erro', message, 'error')
    }
  }, [video.id, videoData.title, wizard])

  /**
   * Handle revalidation request from Phase 5.
   * Marks phases 6 and 7 for revalidation and calls LLM with additional context.
   */
  const handleRevalidatePhase5 = useCallback(async (additionalContext: string) => {
    log('INFO', 'Revalidating Phase 5', { videoId: video.id, additionalContext })

    // CRITICAL: Set revalidation flag FIRST, before any state changes
    // This prevents the auto-processing effect from triggering during re-renders
    isRevalidatingPhase5Ref.current = true

    try {
      // Clear old result immediately to show loading state and disable Avançar
      setTitlesResult(null)

      // Mark subsequent phases for revalidation (invalidates 6, 7, 8)
      wizard.invalidateFromPhase(5)

      // Clear description and tags results (SEO interdependency)
      setDescriptionResult(null)
      setTagsResult(null)
      phase6ProcessingRef.current = null
      phase7ProcessingRef.current = null

      // Set processing ref to prevent auto-processing effect from triggering
      phase5ProcessingRef.current = video.id

      // Call LLM with additional context (enqueued to prevent concurrent calls)
      await enqueueLLMCall(() => processPhase5Titles(additionalContext))
    } finally {
      // Clear revalidation flag after processing completes (success or error)
      isRevalidatingPhase5Ref.current = false
    }
  }, [video.id, wizard, processPhase5Titles, enqueueLLMCall])

  /**
   * Process Phase 6 description generation via API.
   * Called automatically when entering Phase 6.
   * Can also be called with additionalContext for revalidation.
   */
  const processPhase6Description = useCallback(async (additionalContext?: string) => {
    log('INFO', 'Processing Phase 6 description generation', { videoId: video.id, hasAdditionalContext: !!additionalContext })

    // Clear previous error state on retry
    setDescriptionError(null)

    const spinnerId = wizard.addSpinner(6, 'Calculando uma descricao otimizada para voce...')
    wizard.setPhaseLoading(6)

    try {
      const response = await fetch(`/api/wizard/phase/6`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: video.id,
          additionalContext,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || 'Erro ao processar fase 6'
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const phase6Data = result.data as Phase6Response

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(6, 'pending')
      wizard.addAlert(
        6,
        'Descricao',
        'Confira a descricao e faca os ajustes se necessario:',
        'success'
      )
      setDescriptionResult(phase6Data)

      log('INFO', 'Phase 6 description generation completed', {
        videoId: video.id,
        descriptionLength: phase6Data.description.length,
      })
    } catch (error) {
      wizard.removeSpinner(spinnerId)
      const message = error instanceof Error ? error.message : 'Erro ao gerar descricao'
      wizard.setPhaseError(6, message)
      wizard.addAlert(6, 'Erro', message, 'error')
      setDescriptionError(message)
      log('ERROR', 'Phase 6 description generation failed', { videoId: video.id, error: message })
    }
  }, [video.id, wizard])

  /**
   * Auto-process Phase 6 when entering it.
   *
   * Per processamento_video.md, Phase 6 processes automatically.
   * Only triggers once per video (tracked via phase6ProcessingRef).
   */
  useEffect(() => {
    // Only process when on phase 6
    if (wizard.currentPhase !== 6) {
      return
    }

    // CRITICAL: Skip if revalidation is in progress
    // This prevents double LLM calls when user clicks "Gerar nova descrição"
    if (isRevalidatingPhase6Ref.current) {
      log('INFO', 'Skipping Phase 6 auto-processing - revalidation in progress', { videoId: video.id })
      return
    }

    // Skip if earlier phases need review - navigation will redirect back
    if (phaseNeedsReviewConfirmation(video, 2) || phaseNeedsReviewConfirmation(video, 3)) {
      log('INFO', 'Skipping Phase 6 auto-processing - earlier phase needs review', { videoId: video.id })
      return
    }

    // Skip if already processing or processed this video
    if (phase6ProcessingRef.current === video.id) {
      return
    }

    // For Phase 6, we always need to call LLM to get description
    // Enqueued to prevent concurrent calls
    log('INFO', 'Initiating LLM processing for Phase 6', { videoId: video.id })
    phase6ProcessingRef.current = video.id
    enqueueLLMCall(processPhase6Description)
  }, [wizard.currentPhase, video.id, video, processPhase6Description, enqueueLLMCall])

  /**
   * Handle description change from Phase 6.
   * Persists the description to the video document.
   *
   * SEO interdependency: When description changes from LLM-generated version, tags need regeneration.
   */
  const handleDescriptionChange = useCallback(async (description: string) => {
    log('INFO', 'Description changed', { videoId: video.id, descriptionLength: description.length })

    // Check if description differs from LLM-generated version (SEO interdependency)
    const originalDescription = descriptionResult?.description ?? ''
    const descriptionChanged = description !== originalDescription && originalDescription.length > 0

    try {
      // Persist the description via API
      const response = await fetch(`/api/videos/${video.id}/description`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar descricao')
      }

      // Update local video data
      setVideoData(prev => ({ ...prev, description }))

      // SEO interdependency: If description changed from LLM version, invalidate tags
      if (descriptionChanged) {
        log('INFO', 'Description changed from LLM version, invalidating phase 7', { videoId: video.id })

        // Clear tags result so they regenerate when entering phase 7
        setTagsResult(null)
        phase7ProcessingRef.current = null

        // Invalidate phases 7, 8 in wizard state
        wizard.invalidateFromPhase(6)
      }

      log('INFO', 'Description persisted successfully', { videoId: video.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar descricao'
      log('ERROR', 'Failed to persist description', { videoId: video.id, error: message })
      wizard.addAlert(6, 'Erro', message, 'error')
    }
  }, [video.id, descriptionResult?.description, wizard])

  /**
   * Handle revalidation request from Phase 6.
   * Marks phase 7 for revalidation and calls LLM with additional context.
   */
  const handleRevalidatePhase6 = useCallback(async (additionalContext: string) => {
    log('INFO', 'Revalidating Phase 6', { videoId: video.id, additionalContext })

    // CRITICAL: Set revalidation flag FIRST, before any state changes
    // This prevents the auto-processing effect from triggering during re-renders
    isRevalidatingPhase6Ref.current = true

    try {
      // Clear old result immediately to show loading state and disable Avançar
      setDescriptionResult(null)

      // Mark subsequent phases for revalidation (invalidates 7, 8)
      wizard.invalidateFromPhase(6)

      // Clear tags result (SEO interdependency)
      setTagsResult(null)
      phase7ProcessingRef.current = null

      // Set processing ref to prevent auto-processing effect from triggering
      phase6ProcessingRef.current = video.id

      // Call LLM with additional context (enqueued to prevent concurrent calls)
      await enqueueLLMCall(() => processPhase6Description(additionalContext))
    } finally {
      // Clear revalidation flag after processing completes (success or error)
      isRevalidatingPhase6Ref.current = false
    }
  }, [video.id, wizard, processPhase6Description, enqueueLLMCall])

  /**
   * Process Phase 7 tags generation via API.
   * Called automatically when entering Phase 7.
   * Can also be called with additionalContext for revalidation.
   */
  const processPhase7Tags = useCallback(async (additionalContext?: string) => {
    log('INFO', 'Processing Phase 7 tags generation', { videoId: video.id, hasAdditionalContext: !!additionalContext })

    // Clear previous error state on retry
    setTagsError(null)

    const spinnerId = wizard.addSpinner(7, 'Pensando nas melhores tags para o video...')
    wizard.setPhaseLoading(7)

    try {
      const response = await fetch(`/api/wizard/phase/7`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: video.id,
          additionalContext,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || 'Erro ao processar fase 7'
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const phase7Data = result.data as Phase7Response

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(7, 'pending')
      wizard.addAlert(
        7,
        'Tags',
        'Adicione e remova tags conforme necessario.',
        'success'
      )
      setTagsResult(phase7Data)

      log('INFO', 'Phase 7 tags generation completed', {
        videoId: video.id,
        tagCount: phase7Data.tags.length,
      })
    } catch (error) {
      wizard.removeSpinner(spinnerId)
      const message = error instanceof Error ? error.message : 'Erro ao gerar tags'
      wizard.setPhaseError(7, message)
      wizard.addAlert(7, 'Erro', message, 'error')
      setTagsError(message)
      log('ERROR', 'Phase 7 tags generation failed', { videoId: video.id, error: message })
    }
  }, [video.id, wizard])

  /**
   * Auto-process Phase 7 when entering it.
   *
   * Per processamento_video.md, Phase 7 processes automatically.
   * Only triggers once per video (tracked via phase7ProcessingRef).
   */
  useEffect(() => {
    // Only process when on phase 7
    if (wizard.currentPhase !== 7) {
      return
    }

    // CRITICAL: Skip if revalidation is in progress
    // This prevents double LLM calls when user clicks "Gerar novas tags"
    if (isRevalidatingPhase7Ref.current) {
      log('INFO', 'Skipping Phase 7 auto-processing - revalidation in progress', { videoId: video.id })
      return
    }

    // Skip if earlier phases need review - navigation will redirect back
    if (phaseNeedsReviewConfirmation(video, 2) || phaseNeedsReviewConfirmation(video, 3)) {
      log('INFO', 'Skipping Phase 7 auto-processing - earlier phase needs review', { videoId: video.id })
      return
    }

    // Skip if already processing or processed this video
    if (phase7ProcessingRef.current === video.id) {
      return
    }

    // For Phase 7, we always need to call LLM to get tags
    // Enqueued to prevent concurrent calls
    log('INFO', 'Initiating LLM processing for Phase 7', { videoId: video.id })
    phase7ProcessingRef.current = video.id
    enqueueLLMCall(processPhase7Tags)
  }, [wizard.currentPhase, video.id, video, processPhase7Tags, enqueueLLMCall])

  /**
   * Handle tags change from Phase 7.
   * Persists the tags to the video document.
   */
  const handleTagsChange = useCallback(async (tags: string[]) => {
    log('INFO', 'Tags changed', { videoId: video.id, tagCount: tags.length })

    try {
      // Persist the tags via API
      const response = await fetch(`/api/videos/${video.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar tags')
      }

      // Update local video data
      setVideoData(prev => ({ ...prev, tags }))

      log('INFO', 'Tags persisted successfully', { videoId: video.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar tags'
      log('ERROR', 'Failed to persist tags', { videoId: video.id, error: message })
      wizard.addAlert(7, 'Erro', message, 'error')
    }
  }, [video.id, wizard])

  /**
   * Handle revalidation request from Phase 7.
   * Calls LLM with additional context (no subsequent phases to mark).
   */
  const handleRevalidatePhase7 = useCallback(async (additionalContext: string) => {
    log('INFO', 'Revalidating Phase 7', { videoId: video.id, additionalContext })

    // CRITICAL: Set revalidation flag FIRST, before any state changes
    // This prevents the auto-processing effect from triggering during re-renders
    isRevalidatingPhase7Ref.current = true

    try {
      // Clear old result immediately to show loading state and disable Avançar
      setTagsResult(null)

      // No subsequent phases to mark (Phase 7 is the last LLM phase)
      // But invalidate phase 8 so it requires re-send
      wizard.invalidateFromPhase(7)

      // Set processing ref to prevent auto-processing effect from triggering
      phase7ProcessingRef.current = video.id

      // Call LLM with additional context (enqueued to prevent concurrent calls)
      await enqueueLLMCall(() => processPhase7Tags(additionalContext))
    } finally {
      // Clear revalidation flag after processing completes (success or error)
      isRevalidatingPhase7Ref.current = false
    }
  }, [video.id, wizard, processPhase7Tags, enqueueLLMCall])

  /**
   * Handle send to YouTube from Phase 8.
   * Calls the YouTube API to update video metadata.
   */
  const handleSendToYouTube = useCallback(async () => {
    log('INFO', 'Sending video to YouTube', { videoId: video.id })

    // Clear previous error
    setPhase8Error(null)
    setIsSending(true)

    const spinnerId = wizard.addSpinner(8, 'Enviando metadados para o YouTube...')

    try {
      // Build description with chapters at the beginning using utility
      const finalDescription = buildDescriptionWithChapters(
        videoData.description || '',
        videoData.chapters || []
      )

      const response = await fetch(`/api/youtube/videos/${video.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: videoData.title,
          description: finalDescription,
          tags: videoData.tags || [],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao enviar para o YouTube')
      }

      wizard.removeSpinner(spinnerId)
      setIsSending(false)
      setIsSent(true)
      wizard.addAlert(
        8,
        'Publicado!',
        'Os metadados foram atualizados no YouTube com sucesso.',
        'success'
      )

      // Update video data status
      setVideoData(prev => ({ ...prev, status: 'sent' }))

      log('INFO', 'Video sent to YouTube successfully', { videoId: video.id })
    } catch (error) {
      wizard.removeSpinner(spinnerId)
      setIsSending(false)
      const message = error instanceof Error ? error.message : 'Erro ao enviar para o YouTube'
      setPhase8Error(message)
      wizard.addAlert(8, 'Erro', message, 'error')
      log('ERROR', 'Failed to send video to YouTube', { videoId: video.id, error: message })
    }
  }, [video.id, videoData, wizard])

  /**
   * Handle retry after Phase 8 error.
   */
  const handleRetryPhase8 = useCallback(() => {
    setPhase8Error(null)
    handleSendToYouTube()
  }, [handleSendToYouTube])

  /**
   * Handle review confirmation for phases 2 and 3.
   * Persists the phase to reviewedPhases array in Firestore.
   */
  const handleConfirmReview = useCallback(async (phase: 2 | 3) => {
    log('INFO', 'Confirming review for phase', { videoId: video.id, phase })
    setIsConfirmingReview(true)

    try {
      const response = await fetch(`/api/videos/${video.id}/reviewed-phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao confirmar revisao')
      }

      // Update local video data with the confirmed phase (avoid duplicates)
      setVideoData(prev => {
        const currentPhases = prev.reviewedPhases || []
        if (currentPhases.includes(phase)) {
          return prev // Already reviewed, no change needed
        }
        return {
          ...prev,
          reviewedPhases: [...currentPhases, phase],
        }
      })

      // Clear the "from cache" flag for this phase
      if (phase === 2) {
        setPhase2FromCache(false)
      } else {
        setPhase3FromCache(false)
      }

      log('INFO', 'Review confirmed', { videoId: video.id, phase })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao confirmar revisao'
      log('ERROR', 'Failed to confirm review', { videoId: video.id, phase, error: message })
      wizard.addAlert(phase, 'Erro', message, 'error')
    } finally {
      setIsConfirmingReview(false)
    }
  }, [video.id, wizard])

  /**
   * Check if video is already sent (from initial video data).
   */
  useEffect(() => {
    if (video.status === 'sent') {
      setIsSent(true)
    }
  }, [video.status])

  /**
   * Render the interactive panel content based on current phase.
   * Using useMemo to ensure React detects phase changes and re-renders.
   */
  const interactivePanel = useMemo(() => {
    switch (wizard.currentPhase) {
      case 1:
        return (
          <Phase1Critique
            wizard={wizard}
            video={videoData}
            critique={critiqueResult}
            onContextChange={handleContextChange}
          />
        )
      case 2:
        return (
          <Phase2EditCheck
            wizard={wizard}
            video={videoData}
            editCheckResult={editCheckResult}
            error={editCheckError}
            onRetry={() => {
              // Reset processing ref to allow retry
              phase2ProcessingRef.current = null
              enqueueLLMCall(processPhase2EditCheck)
            }}
            isFromCache={phase2FromCache}
            isReviewed={videoData.reviewedPhases?.includes(2) ?? false}
            onConfirmReview={() => handleConfirmReview(2)}
            isConfirmingReview={isConfirmingReview}
          />
        )
      case 3:
        return (
          <Phase3Compliance
            wizard={wizard}
            video={videoData}
            complianceResult={complianceResult}
            error={complianceError}
            onRetry={() => {
              // Reset processing ref to allow retry
              phase3ProcessingRef.current = null
              enqueueLLMCall(processPhase3Compliance)
            }}
            isFromCache={phase3FromCache}
            isReviewed={videoData.reviewedPhases?.includes(3) ?? false}
            onConfirmReview={() => handleConfirmReview(3)}
            isConfirmingReview={isConfirmingReview}
          />
        )
      case 4:
        return (
          <Phase4Chapters
            wizard={wizard}
            video={videoData}
            chaptersResult={chaptersResult}
            error={chaptersError}
            onRetry={() => {
              // Reset processing ref to allow retry
              phase4ProcessingRef.current = null
              enqueueLLMCall(processPhase4Chapters)
            }}
          />
        )
      case 5:
        return (
          <Phase5Title
            wizard={wizard}
            video={videoData}
            titlesResult={titlesResult}
            error={titlesError}
            onRetry={() => {
              // Reset processing ref to allow retry
              phase5ProcessingRef.current = null
              enqueueLLMCall(processPhase5Titles)
            }}
            onRevalidate={handleRevalidatePhase5}
            onTitleSelect={handleTitleSelect}
          />
        )
      case 6:
        return (
          <Phase6Description
            wizard={wizard}
            video={videoData}
            descriptionResult={descriptionResult}
            error={descriptionError}
            onRetry={() => {
              // Reset processing ref to allow retry
              phase6ProcessingRef.current = null
              enqueueLLMCall(processPhase6Description)
            }}
            onRevalidate={handleRevalidatePhase6}
            onDescriptionChange={handleDescriptionChange}
          />
        )
      case 7:
        return (
          <Phase7Tags
            wizard={wizard}
            video={videoData}
            tagsResult={tagsResult}
            error={tagsError}
            onRetry={() => {
              // Reset processing ref to allow retry
              phase7ProcessingRef.current = null
              enqueueLLMCall(processPhase7Tags)
            }}
            onRevalidate={handleRevalidatePhase7}
            onTagsChange={handleTagsChange}
          />
        )
      case 8:
        return (
          <Phase8Publish
            video={videoData}
            isSending={isSending}
            isSent={isSent}
            error={phase8Error}
            onSend={handleSendToYouTube}
            onRetry={handleRetryPhase8}
          />
        )
      default:
        return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Core dependency - phase changes should trigger re-render
    wizard.currentPhase,
    // Phase-specific data
    wizard,
    videoData,
    critiqueResult,
    editCheckResult,
    editCheckError,
    complianceResult,
    complianceError,
    chaptersResult,
    chaptersError,
    titlesResult,
    titlesError,
    descriptionResult,
    descriptionError,
    tagsResult,
    tagsError,
    isSending,
    isSent,
    phase8Error,
    phase2FromCache,
    phase3FromCache,
    isConfirmingReview,
    // Callbacks
    handleContextChange,
    handleConfirmReview,
    handleRevalidatePhase5,
    handleTitleSelect,
    handleRevalidatePhase6,
    handleDescriptionChange,
    handleRevalidatePhase7,
    handleTagsChange,
    handleSendToYouTube,
    handleRetryPhase8,
    enqueueLLMCall,
    processPhase2EditCheck,
    processPhase3Compliance,
    processPhase4Chapters,
    processPhase5Titles,
    processPhase6Description,
    processPhase7Tags,
  ])

  return (
    <WizardLayout
      wizard={wizard}
      video={videoData}
      interactivePanel={interactivePanel}
      className={className}
    />
  )
}
