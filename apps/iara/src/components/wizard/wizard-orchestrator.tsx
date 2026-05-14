'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useLLMProcessing } from '@/contexts'
import { useWizard } from '@/hooks/use-wizard'
import { log } from '@/lib/logger'
import { runAsyncPhase } from '@/lib/wizard/run-async-phase'
import { buildCompleteYouTubeDescription } from '@/lib/youtube'
import type { Video, Guest } from '@/types/video'
import type { Phase1Response, Phase2Response, Phase3Response, Phase4Response, Phase5Response, Phase5BResponse, Phase6Response, Phase7Response } from '@/lib/llm'

import { TranscriptionLoader, type TranscriptionData } from './transcription-loader'
import { WizardLayout } from './wizard-layout'
import { Phase0ParentSelection } from './phases/phase-0-parent-selection'
import { Phase1Critique } from './phases/phase-1-critique'
import { Phase2EditCheck } from './phases/phase-2-edit-check'
import { Phase3Compliance } from './phases/phase-3-compliance'
import { Phase4Chapters } from './phases/phase-4-chapters'
import { Phase5Title } from './phases/phase-5-title'
import { Phase5BShortTitle } from './phases/phase-5b-short-title'
import { Phase6Description } from './phases/phase-6-description'
import { Phase7Tags } from './phases/phase-7-tags'
import { Phase8Publish } from './phases/phase-8-publish'
import { PhaseThumbnail } from './phases/phase-thumbnail'

interface WizardOrchestratorProps {
  video: Video
  className?: string
  /**
   * Optional podcast features. Used to gate phases conditionally — currently
   * only `thumbnailGeneration` (Epic 22 / Story 22.3a) which inserts the
   * Thumbnail phase between Tags and Publicar for episode and cut.
   */
  features?: { thumbnailGeneration?: boolean }
  /** Callback to refresh the video list when status changes (e.g., draft→ready, ready→sent) */
  onVideoStatusChange?: () => void
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
  features,
  onVideoStatusChange,
}: WizardOrchestratorProps) {
  const router = useRouter()
  const { startProcessing, stopProcessing } = useLLMProcessing()

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
  const [shortTitlesResult, setShortTitlesResult] = useState<Phase5BResponse | null>(null)
  const [shortTitlesError, setShortTitlesError] = useState<string | null>(null)
  const [descriptionResult, setDescriptionResult] = useState<Phase6Response | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [tagsResult, setTagsResult] = useState<Phase7Response | null>(null)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [phase8Error, setPhase8Error] = useState<string | null>(null)
  // Story 22.5 — status do upload da thumbnail. Independente do `isSent`.
  const [thumbnailStatus, setThumbnailStatus] = useState<
    'idle' | 'uploaded' | 'skipped' | 'failed'
  >('idle')
  const [thumbnailError, setThumbnailError] = useState<string | null>(null)

  // Track if processing has been initiated for this video (per phase)
  const processingVideoIdRef = useRef<string | null>(null)
  const phase2ProcessingRef = useRef<string | null>(null)
  const phase3ProcessingRef = useRef<string | null>(null)
  const phase4ProcessingRef = useRef<string | null>(null)
  const phase5ProcessingRef = useRef<string | null>(null)
  const phase5BProcessingRef = useRef<string | null>(null)
  const phase6ProcessingRef = useRef<string | null>(null)
  const phase7ProcessingRef = useRef<string | null>(null)

  // Track if revalidation is in progress for phases 5, 6, 7
  // These refs are set BEFORE any state changes to prevent race conditions
  // where the auto-processing effect might trigger during revalidation
  const isRevalidatingPhase5Ref = useRef(false)
  const isRevalidatingPhase5BRef = useRef(false)
  const isRevalidatingPhase6Ref = useRef(false)
  const isRevalidatingPhase7Ref = useRef(false)

  // Track if initial navigation has been done for this video
  const initialNavigationRef = useRef<string | null>(null)

  // Track if phases 2/3/4 were loaded from cache (need review confirmation)
  const [phase2FromCache, setPhase2FromCache] = useState(false)
  const [phase3FromCache, setPhase3FromCache] = useState(false)
  const [phase4FromCache, setPhase4FromCache] = useState(false)
  const [isConfirmingReview, setIsConfirmingReview] = useState(false)

  // CRITICAL: Track which video ID has ready data for phase auto-processing.
  // This prevents race conditions where effects run with stale data from a previous video.
  // Effects should NOT run until videoDataReadyFor === video.id.
  // Using video ID instead of boolean ensures we don't use stale "ready" state from previous video.
  const [videoDataReadyFor, setVideoDataReadyFor] = useState<string | null>(null)

  // Frontend LLM queue - ensures only one LLM call at a time
  // This prevents concurrent calls when multiple phases try to process simultaneously
  const llmQueueRef = useRef<Promise<void>>(Promise.resolve())

  /**
   * Enqueue an LLM processing function to run sequentially.
   * Returns a promise that resolves when the function completes.
   *
   * Bloqueia a troca de vídeo enquanto a chamada está em andamento
   * via LLMProcessingContext.
   */
  const enqueueLLMCall = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      // Use .catch() to ensure the queue always continues, even if previous task failed
      llmQueueRef.current = llmQueueRef.current
        .catch(() => {
          // Ignore errors from previous tasks - we want the queue to continue
        })
        .then(() => {
          startProcessing()
          return fn()
        })
        .then((result) => {
          stopProcessing()
          resolve(result)
        })
        .catch((error) => {
          stopProcessing()
          reject(error)
        })
    })
  }, [startProcessing, stopProcessing])

  // Track previous video ID to detect video changes
  const previousVideoIdRef = useRef<string | null>(null)

  // CRITICAL: Flag to indicate video is transitioning - blocks all auto-processing effects
  // This prevents race conditions where effects fire with stale state during video switch
  const isTransitioningRef = useRef(false)

  // Track the CURRENT video ID that effects should operate on
  // This is updated SYNCHRONOUSLY before any effects run
  const activeVideoIdRef = useRef<string>(video.id)

  // Keep video data in sync with prop and RESET ALL STATE when video changes
  useEffect(() => {
    const videoChanged = previousVideoIdRef.current !== null && previousVideoIdRef.current !== video.id

    if (videoChanged) {
      log('INFO', 'Video changed, resetting all wizard state', {
        previousVideoId: previousVideoIdRef.current,
        newVideoId: video.id,
      })

      // CRITICAL: Set transitioning flag FIRST to block other effects
      isTransitioningRef.current = true

      // Update active video ID synchronously
      activeVideoIdRef.current = video.id

      // Reset ALL phase results
      setCritiqueResult(null)
      setEditCheckResult(null)
      setEditCheckError(null)
      setComplianceResult(null)
      setComplianceError(null)
      setChaptersResult(null)
      setChaptersError(null)
      setTitlesResult(null)
      setTitlesError(null)
      setShortTitlesResult(null)
      setShortTitlesError(null)
      setDescriptionResult(null)
      setDescriptionError(null)
      setTagsResult(null)
      setTagsError(null)
      setIsSending(false)
      setIsSent(false)
      setPhase8Error(null)
      setThumbnailStatus('idle')
      setThumbnailError(null)

      // Reset cache flags
      setPhase2FromCache(false)
      setPhase3FromCache(false)
      setPhase4FromCache(false)
      setIsConfirmingReview(false)

      // CRITICAL: Mark video data as NOT ready until fresh fetch completes
      // This prevents auto-processing effects from running with stale data
      // Setting to null ensures effects won't run with stale "ready" state from previous video
      setVideoDataReadyFor(null)

      // Reset processing refs so new video can trigger LLM calls
      processingVideoIdRef.current = null
      phase2ProcessingRef.current = null
      phase3ProcessingRef.current = null
      phase4ProcessingRef.current = null
      phase5ProcessingRef.current = null
      phase5BProcessingRef.current = null
      phase6ProcessingRef.current = null
      phase7ProcessingRef.current = null

      // Reset other refs
      initialNavigationRef.current = null
      cachedDataLoadedRef.current = null
      freshDataFetchedRef.current = null

      // Reset revalidation flags
      isRevalidatingPhase5Ref.current = false
      isRevalidatingPhase5BRef.current = false
      isRevalidatingPhase6Ref.current = false
      isRevalidatingPhase7Ref.current = false

      // Note: wizard console is cleared automatically in useWizard when video changes

      // Sync video data with new video
      setVideoData(video)

      // CRITICAL: Clear transitioning flag after a microtask to allow React to batch updates
      // This ensures all state is reset before any auto-processing effects run
      queueMicrotask(() => {
        isTransitioningRef.current = false
      })
    } else if (previousVideoIdRef.current === null) {
      // First mount - set active video ID and sync video data
      activeVideoIdRef.current = video.id
      setVideoData(video)
    }
    // NOTE: We do NOT sync videoData when video prop changes but ID stays the same.
    // This preserves local optimistic updates (e.g., title selection in Phase 5)
    // while the API persists the change. The prop will eventually update with
    // the persisted value from Firestore.

    // Update tracking ref
    previousVideoIdRef.current = video.id
  }, [video])

  // Track if we've fetched fresh video data for this video
  const freshDataFetchedRef = useRef<string | null>(null)

  /**
   * Fetch fresh video data from Firestore on mount.
   *
   * This ensures we have the latest generated data (description, tags, etc.)
   * even if the video prop is stale from the cached list.
   *
   * Only runs once per video to avoid unnecessary API calls.
   */
  useEffect(() => {
    // Skip if we've already fetched for this video
    // NOTE: We intentionally do NOT check isTransitioningRef here because:
    // 1. freshDataFetchedRef already prevents duplicate fetches
    // 2. The transitioning flag is cleared via queueMicrotask which doesn't trigger re-render
    // 3. If we skip here, the fetch would never run when returning to a video
    if (freshDataFetchedRef.current === video.id) {
      return
    }

    freshDataFetchedRef.current = video.id

    const fetchFreshVideoData = async () => {
      try {
        const response = await fetch(`/api/videos/${video.id}`)
        if (!response.ok) {
          log('WARN', 'Failed to fetch fresh video data, using prop data', { videoId: video.id, status: response.status })
          // Only mark as ready if prop data has transcription
          const hasTranscription = video.transcriptionSRT && video.transcriptionTXT
          if (hasTranscription) {
            setVideoDataReadyFor(video.id)
          }
          return
        }

        const result = await response.json()
        const freshVideo = result.data

        if (!freshVideo) {
          log('WARN', 'No video data returned from API, using prop data', { videoId: video.id })
          // Only mark as ready if prop data has transcription
          const hasTranscription = video.transcriptionSRT && video.transcriptionTXT
          if (hasTranscription) {
            setVideoDataReadyFor(video.id)
          }
          return
        }

        // FONTE DE VERDADE: Firestore
        // Quando buscamos dados frescos, usamos diretamente como fonte de verdade.
        // Isso garante que o Smart Loading funcione corretamente para TODAS as fases.
        log('INFO', 'Updating videoData with fresh Firestore data', {
          videoId: video.id,
          hasData: {
            critique: !!freshVideo.critique,
            editingIssues: freshVideo.editingIssues !== undefined,
            riskAndCompliance: freshVideo.riskAndCompliance !== undefined,
            chapters: freshVideo.chapters?.length > 0,
            suggestedTitles: freshVideo.suggestedTitles?.length > 0,
            description: !!freshVideo.description,
            tags: freshVideo.tags?.length > 0,
            reviewedPhases: freshVideo.reviewedPhases?.length > 0,
          },
        })

        // Update videoData with fresh data from Firestore
        setVideoData(freshVideo)

        // Reset fromCache flags for phases that are already reviewed
        const reviewed = freshVideo.reviewedPhases || []
        if (reviewed.includes(2)) setPhase2FromCache(false)
        if (reviewed.includes(3)) setPhase3FromCache(false)
        if (reviewed.includes(4)) setPhase4FromCache(false)

        // Re-hydrate wizard with fresh data to update phase statuses
        // This ensures Smart Loading works correctly for all phases
        queueMicrotask(() => {
          wizard.hydrateFromVideoData(freshVideo)
        })

        // CRITICAL: Mark video data as ready AFTER fetch completes and state is updated
        // This allows auto-processing effects to run with fresh data
        // Using video.id ensures effects only run when ready for THIS specific video
        // BUT: Only set ready if transcription exists - otherwise TranscriptionLoader will set it after loading
        const hasTranscription = freshVideo.transcriptionSRT && freshVideo.transcriptionTXT
        if (hasTranscription) {
          setVideoDataReadyFor(video.id)
          log('INFO', 'Video data is now ready for auto-processing', { videoId: video.id })
        } else {
          log('INFO', 'Video missing transcription, deferring ready state until transcription loads', { videoId: video.id })
        }
      } catch (error) {
        log('ERROR', 'Error fetching fresh video data, using prop data', {
          videoId: video.id,
          error: error instanceof Error ? error.message : String(error),
        })
        // Only mark as ready if prop data has transcription
        const hasTranscription = video.transcriptionSRT && video.transcriptionTXT
        if (hasTranscription) {
          setVideoDataReadyFor(video.id)
        }
      }
    }

    fetchFreshVideoData()
  }, [video.id, wizard])

  /**
   * Handle review confirmation navigation on mount.
   * Only runs once when video loads (per video ID).
   *
   * Per Story 5.3 - Smart Loading:
   * - Navigation to first incomplete phase is handled by useWizard hydration
   * - This effect only handles the special case of review confirmation for phases 2, 3, and 4
   *
   * REGRA DOS DOIS CAMINHOS (Story 5.3 - DEFINITIVE FIX):
   * Uses videoData (fresh state) instead of video (stale prop) to check for data.
   * Also requires videoDataReadyFor to be true before running.
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before navigating
    // This ensures we're using fresh data from Firestore, not stale data from the prop
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Skip if we've already navigated for this video
    if (initialNavigationRef.current === video.id) {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      log('WARN', 'Skipping initial navigation - video mismatch', {
        activeVideoId: activeVideoIdRef.current,
        videoId: video.id,
      })
      return
    }

    initialNavigationRef.current = video.id

    // Check if phases 2, 3, and 4 have data but need review (using fresh videoData)
    const phase2CompletedInWizard = wizard.state.phases[2].status === 'completed'
    const phase2IsReviewed = (videoData.reviewedPhases?.includes(2) ?? false) || phase2CompletedInWizard
    const phase2HasData = videoData.editingIssues !== undefined
    const phase2NeedsReview = phase2HasData && !phase2IsReviewed

    const phase3CompletedInWizard = wizard.state.phases[3].status === 'completed'
    const phase3IsReviewed = (videoData.reviewedPhases?.includes(3) ?? false) || phase3CompletedInWizard
    const phase3HasData = videoData.riskAndCompliance !== undefined
    const phase3NeedsReview = phase3HasData && !phase3IsReviewed

    const phase4CompletedInWizard = wizard.state.phases[4].status === 'completed'
    const phase4IsReviewed = (videoData.reviewedPhases?.includes(4) ?? false) || phase4CompletedInWizard
    const phase4HasData = videoData.chapters !== undefined && videoData.chapters.length > 0
    const phase4NeedsReview = phase4HasData && !phase4IsReviewed

    // If phase 2 needs review and we're past it, go back to phase 2
    if (phase2NeedsReview && wizard.currentPhase > 2) {
      log('INFO', 'Auto-navigating to Phase 2 for review confirmation', {
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      setPhase2FromCache(true)
      wizard.setPhaseStatus(2, 'needs_review')
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
      wizard.setPhaseStatus(3, 'needs_review')
      wizard.goToPhase(3)
      return
    }

    // If phase 4 needs review and we're past it, go back to phase 4
    if (phase4NeedsReview && wizard.currentPhase > 4) {
      log('INFO', 'Auto-navigating to Phase 4 for review confirmation', {
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      setPhase4FromCache(true)
      wizard.setPhaseStatus(4, 'needs_review')
      wizard.goToPhase(4)
      return
    }

    // Mark phases as needs_review even if we're not past them yet
    // This ensures the breadcrumb shows the correct status
    if (phase2NeedsReview) {
      wizard.setPhaseStatus(2, 'needs_review')
    }
    if (phase3NeedsReview) {
      wizard.setPhaseStatus(3, 'needs_review')
    }
    if (phase4NeedsReview) {
      wizard.setPhaseStatus(4, 'needs_review')
    }
  }, [video.id, videoDataReadyFor, videoData, wizard])

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
   *
   * REGRA DOS DOIS CAMINHOS (Story 5.3 - DEFINITIVE FIX):
   * Uses videoData (fresh state) instead of video (stale prop) to check for data.
   * Also requires videoDataReadyFor to be true before running.
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before loading cached data
    // This ensures we're using fresh data from Firestore, not stale data from the prop
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Skip if we've already loaded for this video
    if (cachedDataLoadedRef.current === video.id) {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      log('WARN', 'Skipping cached data load - video mismatch', {
        activeVideoId: activeVideoIdRef.current,
        videoId: video.id,
      })
      return
    }

    cachedDataLoadedRef.current = video.id

    log('INFO', 'Loading cached data for all completed phases (from fresh videoData)', { videoId: video.id })

    // Phase 1: Critique - add alert and set state (using fresh videoData)
    if (videoData.critique) {
      const existingCritique: Phase1Response = {
        critique: videoData.critique,
        highlights: [],
        suggestions: [],
      }
      setCritiqueResult(existingCritique)
      wizard.addAlert(1, 'Crítica do Especialista', videoData.critique, 'success')
    }

    // Phase 2: Editing Issues (using fresh videoData)
    if (videoData.editingIssues !== undefined) {
      const existingEditCheck: Phase2Response = {
        hasIssues: videoData.editingIssues.length > 0,
        issues: videoData.editingIssues,
      }
      setEditCheckResult(existingEditCheck)
      wizard.addAlert(
        2,
        'Checagem de Edição',
        videoData.editingIssues.length > 0
          ? `${videoData.editingIssues.length} ponto(s) de atenção identificado(s)`
          : 'Nenhum problema de edição identificado',
        'success'
      )
    }

    // Phase 3: Compliance (using fresh videoData)
    if (videoData.riskAndCompliance !== undefined) {
      const existingCompliance: Phase3Response = {
        hasRisks: videoData.riskAndCompliance.length > 0,
        risks: videoData.riskAndCompliance.map(item => ({
          timestamp: item.timestamp,
          risk: item.risk,
          description: item.description,
        })),
      }
      setComplianceResult(existingCompliance)
      wizard.addAlert(
        3,
        'Riscos e Conformidade',
        videoData.riskAndCompliance.length > 0
          ? `${videoData.riskAndCompliance.length} risco(s) identificado(s)`
          : 'Nenhum risco de conformidade identificado',
        'success'
      )
    }

    // Phase 4: Chapters (using fresh videoData)
    if (videoData.chapters && videoData.chapters.length > 0) {
      const existingChapters: Phase4Response = {
        chapters: videoData.chapters.map(item => ({
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

    // Phase 5: Titles (using fresh videoData)
    if (videoData.suggestedTitles && videoData.suggestedTitles.length > 0) {
      const existingTitles: Phase5Response = {
        titles: videoData.suggestedTitles,
      }
      setTitlesResult(existingTitles)
      wizard.addAlert(5, 'Títulos', `${videoData.suggestedTitles.length} sugestão(ões) de título`, 'success')
    }

    // Phase 5B: Short Titles (using fresh videoData) - cut only
    if (videoData.videoType === 'cut' && videoData.suggestedShortTitles && videoData.suggestedShortTitles.length > 0) {
      const existingShortTitles: Phase5BResponse = {
        shortTitles: videoData.suggestedShortTitles,
      }
      setShortTitlesResult(existingShortTitles)
      wizard.addAlert(5, 'Títulos Curtos', `${videoData.suggestedShortTitles.length} sugestão(ões) de título curto`, 'success')
    }

    // Phase 6: Description (using fresh videoData)
    if (videoData.description && videoData.description.trim().length > 0) {
      const existingDescription: Phase6Response = {
        description: videoData.description,
      }
      setDescriptionResult(existingDescription)
      // Show a truncated preview of the description
      const preview = videoData.description.length > 100
        ? videoData.description.substring(0, 100) + '...'
        : videoData.description
      wizard.addAlert(6, 'Descrição', preview, 'success')
    }

    // Phase 7: Tags (using fresh videoData)
    if (videoData.tags && videoData.tags.length > 0) {
      const existingTags: Phase7Response = {
        tags: videoData.tags,
      }
      setTagsResult(existingTags)
      wizard.addAlert(7, 'Tags', `${videoData.tags.length} tag(s): ${videoData.tags.slice(0, 5).join(', ')}${videoData.tags.length > 5 ? '...' : ''}`, 'success')
    }
  }, [video.id, videoDataReadyFor, videoData, wizard])

  // Track if we've already transitioned to ready for this video
  const readyTransitionRef = useRef<string | null>(null)

  /**
   * CLIENT-SIDE AUTO-DRAFT: Mirror the server-side AUTO-DRAFT behavior.
   *
   * The server (videos-admin.ts:449-458) automatically transitions new → draft
   * when any phase saves data to Firestore. However, the phase save API responses
   * don't return the updated status, so videoData.status stays 'new' in the client.
   *
   * This effect detects when the wizard has advanced past the first phase (meaning
   * data was saved to the server, triggering server-side AUTO-DRAFT) and mirrors
   * the transition locally. This ensures the AUTO-READY effect below can properly
   * detect 'draft' status and transition to 'ready' at Phase 8.
   */
  useEffect(() => {
    if (videoData.status !== 'new') return
    if (videoDataReadyFor !== video.id) return

    // First phase: episode starts at 1, cut/reel start at 0
    const firstPhase = video.videoType === 'episode' ? 1 : 0

    // If wizard has advanced past the first phase, data was saved → server did AUTO-DRAFT
    if (wizard.currentPhase === firstPhase) return

    log('INFO', 'Client-side AUTO-DRAFT: mirroring server new → draft transition', {
      videoId: video.id,
      currentPhase: wizard.currentPhase,
    })
    setVideoData(prev => prev.status === 'new' ? { ...prev, status: 'draft' } : prev)
  }, [wizard.currentPhase, videoData.status, videoDataReadyFor, video.id, video.videoType])

  /**
   * AUTO-READY: When the wizard reaches Phase 8, automatically transition
   * the video status to 'ready' if not already ready/sending/sent.
   *
   * This runs when:
   * - Current phase is 8
   * - Video data is ready
   * - Status is 'draft' (eligible for transition)
   * - We haven't already transitioned this video
   *
   * Depends on CLIENT-SIDE AUTO-DRAFT above to ensure videoData.status is
   * properly synced to 'draft' before this effect evaluates the guard.
   */
  useEffect(() => {
    // Only run when on Phase 8
    if (wizard.currentPhase !== 8) {
      return
    }

    // Wait for fresh video data
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Skip if already transitioned for this video
    if (readyTransitionRef.current === video.id) {
      return
    }

    // Only transition if status is 'draft'
    // Don't transition if already 'ready', 'sending', 'sent', or still 'new'
    if (videoData.status !== 'draft') {
      return
    }

    readyTransitionRef.current = video.id

    log('INFO', 'Auto-transitioning video status to ready (Phase 8 reached)', {
      videoId: video.id,
      previousStatus: videoData.status,
    })

    // Update status to 'ready' via API
    fetch(`/api/videos/${video.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready' }),
    })
      .then((response) => {
        if (response.ok) {
          setVideoData((prev) => ({ ...prev, status: 'ready' }))
          onVideoStatusChange?.()
          log('INFO', 'Video status updated to ready', { videoId: video.id })
        } else {
          log('WARN', 'Failed to update video status to ready', { videoId: video.id })
        }
      })
      .catch((error) => {
        log('ERROR', 'Error updating video status to ready', {
          videoId: video.id,
          error: error instanceof Error ? error.message : String(error),
        })
      })
  }, [wizard.currentPhase, video.id, videoDataReadyFor, videoData.status, onVideoStatusChange])

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
      const phase1Data = await runAsyncPhase<Phase1Response>({
        phase: 1,
        videoId: video.id,
        pollIntervalMs: 10_000,
      })

      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 1 result discarded — video switched', { jobVideoId: video.id })
        return
      }

      wizard.removeSpinner(spinnerId)
      // Don't call setPhaseData here - it would mark phase as completed
      // Phase 1 should only be completed when user clicks "Avançar" with all criteria met
      // (theme + guests + critique) per processamento_video.md
      wizard.setPhaseStatus(1, 'pending')
      wizard.addAlert(1, 'Crítica do Especialista', phase1Data.critique, 'success')
      setCritiqueResult(phase1Data)

      log('INFO', 'Phase 1 critique completed', { videoId: video.id })
    } catch (error) {
      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 1 error discarded — video switched', { jobVideoId: video.id })
        return
      }
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
   *
   * REGRA DOS DOIS CAMINHOS (Story 5.3 - DEFINITIVE FIX):
   * Uses videoData (fresh state) instead of video (stale prop) to check for data.
   * Also requires videoDataReadyFor to be true before running.
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before auto-processing
    // This prevents effects from running with stale data from the video prop
    if (videoDataReadyFor !== video.id) {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      return
    }

    // Skip if we've already processed this video
    if (processingVideoIdRef.current === video.id) {
      return
    }

    // CAMINHO 1 - SMART LOAD: Check if critique already exists (using fresh videoData, not stale video prop)
    if (videoData.critique) {
      log('INFO', 'Phase 1: Smart load - critique exists', { videoId: video.id })

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

    // CAMINHO 2 - LLM CALL: No critique exists and we're on Phase 1 - process via LLM
    log('INFO', 'Phase 1: LLM call - no critique found', { videoId: video.id })
    processingVideoIdRef.current = video.id
    enqueueLLMCall(processPhase1Critique)
  }, [video.id, videoDataReadyFor, videoData.critique, wizard, wizard.currentPhase, processPhase1Critique, enqueueLLMCall])

  /**
   * Process Phase 2 editing check via API.
   * Called automatically when entering Phase 2.
   */
  const processPhase2EditCheck = useCallback(async () => {
    log('INFO', 'Processing Phase 2 edit check', { videoId: video.id })

    setEditCheckError(null)

    const spinnerId = wizard.addSpinner(2, 'Verificando se existem falhas de edição perceptíveis...')
    wizard.setPhaseLoading(2)

    try {
      const phase2Data = await runAsyncPhase<Phase2Response>({
        phase: 2,
        videoId: video.id,
        pollIntervalMs: 10_000,
      })

      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 2 result discarded — video switched', { jobVideoId: video.id })
        return
      }

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(2, 'needs_review')
      setPhase2FromCache(true)
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
      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 2 error discarded — video switched', { jobVideoId: video.id })
        return
      }
      const message = error instanceof Error ? error.message : 'Erro ao verificar edição'
      wizard.removeSpinner(spinnerId)
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
   *
   * REGRA DOS DOIS CAMINHOS (Story 5.3 - DEFINITIVE FIX):
   * Uses videoData (fresh state) instead of video (stale prop) to check for data.
   * Also requires videoDataReadyFor to be true before running.
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before auto-processing
    // This prevents effects from running with stale data from the video prop
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Only process when on phase 2
    if (wizard.currentPhase !== 2) {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      log('WARN', 'Skipping Phase 2 auto-processing - video mismatch', {
        activeVideoId: activeVideoIdRef.current,
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      return
    }

    // Skip if already processing or processed this video
    if (phase2ProcessingRef.current === video.id) {
      return
    }

    // CAMINHO 1 - SMART LOAD: Check if editingIssues already exist (using fresh videoData, not stale video prop)
    if (videoData.editingIssues !== undefined) {
      log('INFO', 'Phase 2: Smart load - editingIssues exist', { videoId: video.id })
      phase2ProcessingRef.current = video.id

      // Mark as loaded from cache (needs review confirmation if not already reviewed)
      const isReviewed = videoData.reviewedPhases?.includes(2) ?? false
      const needsReview = !isReviewed
      setPhase2FromCache(needsReview)
      if (needsReview) {
        wizard.setPhaseStatus(2, 'needs_review')
      }

      // State and alert already handled by cached data effect
      return
    }

    // CAMINHO 2 - LLM CALL: No editingIssues exist - process via LLM
    log('INFO', 'Phase 2: LLM call - no editingIssues found', { videoId: video.id })
    phase2ProcessingRef.current = video.id
    enqueueLLMCall(processPhase2EditCheck)
  }, [wizard.currentPhase, video.id, videoDataReadyFor, videoData.editingIssues, videoData.reviewedPhases, wizard, processPhase2EditCheck, enqueueLLMCall])

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
      const phase3Data = await runAsyncPhase<Phase3Response>({
        phase: 3,
        videoId: video.id,
        pollIntervalMs: 10_000,
      })

      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 3 result discarded — video switched', { jobVideoId: video.id })
        return
      }

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(3, 'needs_review')
      setPhase3FromCache(true)
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
      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 3 error discarded — video switched', { jobVideoId: video.id })
        return
      }
      const message = error instanceof Error ? error.message : 'Erro ao verificar compliance'
      wizard.removeSpinner(spinnerId)
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
   *
   * REGRA DOS DOIS CAMINHOS (Story 5.3 - DEFINITIVE FIX):
   * Uses videoData (fresh state) instead of video (stale prop) to check for data.
   * Also requires videoDataReadyFor to be true before running.
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before auto-processing
    // This prevents effects from running with stale data from the video prop
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Only process when on phase 3
    if (wizard.currentPhase !== 3) {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      log('WARN', 'Skipping Phase 3 auto-processing - video mismatch', {
        activeVideoId: activeVideoIdRef.current,
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      return
    }

    // Skip if already processing or processed this video
    if (phase3ProcessingRef.current === video.id) {
      return
    }

    // CAMINHO 1 - SMART LOAD: Check if riskAndCompliance already exist (using fresh videoData, not stale video prop)
    if (videoData.riskAndCompliance !== undefined) {
      log('INFO', 'Phase 3: Smart load - riskAndCompliance exist', { videoId: video.id })
      phase3ProcessingRef.current = video.id

      // Mark as loaded from cache (needs review confirmation if not already reviewed)
      const isReviewed = videoData.reviewedPhases?.includes(3) ?? false
      const needsReview = !isReviewed
      setPhase3FromCache(needsReview)
      if (needsReview) {
        wizard.setPhaseStatus(3, 'needs_review')
      }

      // State and alert already handled by cached data effect
      return
    }

    // CAMINHO 2 - LLM CALL: No riskAndCompliance exist - process via LLM
    log('INFO', 'Phase 3: LLM call - no riskAndCompliance found', { videoId: video.id })
    phase3ProcessingRef.current = video.id
    enqueueLLMCall(processPhase3Compliance)
  }, [wizard.currentPhase, video.id, videoDataReadyFor, videoData.riskAndCompliance, videoData.reviewedPhases, wizard, processPhase3Compliance, enqueueLLMCall])

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
      const phase4Data = await runAsyncPhase<Phase4Response>({
        phase: 4,
        videoId: video.id,
        pollIntervalMs: 10_000,
      })

      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 4 result discarded — video switched', { jobVideoId: video.id })
        return
      }

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(4, 'needs_review')
      setPhase4FromCache(true)

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
      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 4 error discarded — video switched', { jobVideoId: video.id })
        return
      }
      const message = error instanceof Error ? error.message : 'Erro ao gerar capítulos'
      wizard.removeSpinner(spinnerId)
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
   *
   * NOTE: No review-blocking here. Phases are only blocked if empty/not processed.
   * Validation of all phases happens only in Phase 8 before sending to YouTube.
   *
   * REGRA DOS DOIS CAMINHOS (Story 5.3 - DEFINITIVE FIX):
   * Uses videoData (fresh state) instead of video (stale prop) to check for data.
   * Also requires videoDataReadyFor to be true before running.
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before auto-processing
    // This prevents effects from running with stale data from the video prop
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Only process when on phase 4
    if (wizard.currentPhase !== 4) {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      log('WARN', 'Skipping Phase 4 auto-processing - video mismatch', {
        activeVideoId: activeVideoIdRef.current,
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      return
    }

    // Skip if already processing or processed this video
    if (phase4ProcessingRef.current === video.id) {
      return
    }

    // CAMINHO 1 - SMART LOAD: Check if chapters already exist (using fresh videoData, not stale video prop)
    if (videoData.chapters !== undefined && videoData.chapters.length > 0) {
      log('INFO', 'Phase 4: Smart load - chapters exist', { videoId: video.id, count: videoData.chapters.length })
      phase4ProcessingRef.current = video.id

      // Mark as loaded from cache (needs review confirmation if not already reviewed)
      const isReviewed = videoData.reviewedPhases?.includes(4) ?? false
      const needsReview = !isReviewed
      setPhase4FromCache(needsReview)
      if (needsReview) {
        wizard.setPhaseStatus(4, 'needs_review')
      }

      // State and alert already handled by cached data effect
      return
    }

    // CAMINHO 2 - LLM CALL: No chapters exist - process via LLM
    log('INFO', 'Phase 4: LLM call - no chapters found', { videoId: video.id })
    phase4ProcessingRef.current = video.id
    enqueueLLMCall(processPhase4Chapters)
  }, [wizard.currentPhase, video.id, videoDataReadyFor, videoData.chapters, videoData.reviewedPhases, wizard, processPhase4Chapters, enqueueLLMCall])

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
      const phase5Data = await runAsyncPhase<Phase5Response>({
        phase: 5,
        videoId: video.id,
        body: additionalContext ? { additionalContext } : undefined,
        pollIntervalMs: 5_000,
      })

      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 5 result discarded — video switched', { jobVideoId: video.id })
        return
      }

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
      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 5 error discarded — video switched', { jobVideoId: video.id })
        return
      }
      const message = error instanceof Error ? error.message : 'Erro ao gerar titulos'
      wizard.removeSpinner(spinnerId)
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
   * REGRA DOS DOIS CAMINHOS (Story 5.3 - DEFINITIVE FIX):
   * Uses videoData (fresh state) instead of video (stale prop) to check for data.
   * Also requires videoDataReadyFor to be true before running.
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before auto-processing
    // This prevents effects from running with stale data from the video prop
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Only process when on phase 5
    if (wizard.currentPhase !== 5) {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      log('WARN', 'Skipping Phase 5 auto-processing - video mismatch', {
        activeVideoId: activeVideoIdRef.current,
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      return
    }

    // CRITICAL: Skip if revalidation is in progress
    // This prevents double LLM calls when user clicks "Gerar novos títulos"
    if (isRevalidatingPhase5Ref.current) {
      log('INFO', 'Skipping Phase 5 auto-processing - revalidation in progress', { videoId: video.id })
      return
    }

    // Skip if already processing or processed this video
    if (phase5ProcessingRef.current === video.id) {
      return
    }

    // CAMINHO 1 - SMART LOAD: Check if suggestedTitles exist (using fresh videoData, not stale video prop)
    if (videoData.suggestedTitles && videoData.suggestedTitles.length > 0) {
      log('INFO', 'Phase 5: Smart load - suggestedTitles exist', { videoId: video.id, count: videoData.suggestedTitles.length })
      phase5ProcessingRef.current = video.id
      // State and alert handled by cached data effect
      return
    }

    // CAMINHO 2 - LLM CALL: No suggestedTitles exist - process via LLM
    log('INFO', 'Phase 5: LLM call - no suggestedTitles found', { videoId: video.id })
    phase5ProcessingRef.current = video.id
    enqueueLLMCall(() => processPhase5Titles())
  }, [wizard.currentPhase, video.id, videoDataReadyFor, videoData.suggestedTitles, processPhase5Titles, enqueueLLMCall])

  /**
   * Handle title selection from Phase 5.
   * Persists the selected title to the video document.
   *
   * SEO interdependency: When title changes, description and tags need to be regenerated.
   *
   * NOTE: Uses optimistic UI update - title updates immediately in header,
   * then persists to API asynchronously.
   */
  const handleTitleSelect = useCallback(async (title: string) => {
    log('INFO', 'Title selected', { videoId: video.id, title })

    // Get previous title BEFORE updating state (for SEO interdependency check)
    const previousTitle = videoData.title
    const titleChanged = title !== previousTitle

    // OPTIMISTIC UPDATE: Update local video data immediately for responsive UI
    setVideoData(prev => ({ ...prev, title }))

    // Mark phase 5 as completed when title is selected
    wizard.setPhaseStatus(5, 'completed')

    // SEO interdependency: If title changed, invalidate description and tags
    if (titleChanged) {
      log('INFO', 'Title changed, invalidating phases 6 and 7', { videoId: video.id, oldTitle: previousTitle, newTitle: title })

      // Clear description and tags results so they regenerate when entering those phases
      setDescriptionResult(null)
      setTagsResult(null)
      phase6ProcessingRef.current = null
      phase7ProcessingRef.current = null

      // CRITICAL: Also clear videoData.description and videoData.tags
      // Otherwise the auto-processing effects will try to Smart Load with stale data
      setVideoData(prev => ({ ...prev, description: undefined, tags: undefined }))

      // Invalidate phases 6, 7, 8 in wizard state
      wizard.invalidateFromPhase(5)
    }

    try {
      // Persist the selected title via API (async, after UI already updated)
      const response = await fetch(`/api/videos/${video.id}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar titulo')
      }

      log('INFO', 'Title persisted successfully', { videoId: video.id, title })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar titulo'
      log('ERROR', 'Failed to persist title', { videoId: video.id, error: message })
      wizard.addAlert(5, 'Erro', message, 'error')
      // Revert optimistic update on error
      setVideoData(prev => ({ ...prev, title: previousTitle }))
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

      // CRITICAL: Also clear videoData.description and videoData.tags
      // Otherwise the auto-processing effects will try to Smart Load with stale data
      setVideoData(prev => ({ ...prev, description: undefined, tags: undefined }))

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
   * Process Phase 5B short titles via API.
   * Called automatically when entering Phase 5B (cut videos only).
   * Can also be called with additionalContext for revalidation.
   */
  const processPhase5BShortTitles = useCallback(async (additionalContext?: string) => {
    log('INFO', 'Processing Phase 5B short titles', { videoId: video.id, hasAdditionalContext: !!additionalContext })

    // Clear previous error state on retry
    setShortTitlesError(null)

    const spinnerId = wizard.addSpinner(5, 'Gerando sugestoes de titulo curto para thumbnail...')

    try {
      const phase5BData = await runAsyncPhase<Phase5BResponse>({
        phase: '5b',
        videoId: video.id,
        body: additionalContext ? { additionalContext } : undefined,
        pollIntervalMs: 5_000,
      })

      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 5B result discarded — video switched', { jobVideoId: video.id })
        return
      }

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(5, 'completed')
      wizard.addAlert(
        5,
        'Titulos Curtos',
        'Escolha o melhor titulo curto para a thumbnail.',
        'success'
      )
      setShortTitlesResult(phase5BData)

      log('INFO', 'Phase 5B short titles completed', {
        videoId: video.id,
        shortTitleCount: phase5BData.shortTitles.length,
      })
    } catch (error) {
      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 5B error discarded — video switched', { jobVideoId: video.id })
        return
      }
      const message = error instanceof Error ? error.message : 'Erro ao gerar titulos curtos'
      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(5, 'completed')
      wizard.addAlert(5, 'Erro', message, 'error')
      setShortTitlesError(message)
      log('ERROR', 'Phase 5B short titles failed', { videoId: video.id, error: message })
    }
  }, [video.id, wizard])

  /**
   * Auto-process Phase 5B when entering it (cut videos only).
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before auto-processing
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Only process for cut videos on phase 5B
    // Cast needed because wizard.currentPhase is typed as WizardPhase (1-8),
    // but can be '5B' at runtime for cut videos
    if ((wizard.currentPhase as unknown as string) !== '5B' || video.videoType !== 'cut') {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      return
    }

    // CRITICAL: Skip if revalidation is in progress
    if (isRevalidatingPhase5BRef.current) {
      log('INFO', 'Skipping Phase 5B auto-processing - revalidation in progress', { videoId: video.id })
      return
    }

    // Skip if already processing or processed this video
    if (phase5BProcessingRef.current === video.id) {
      return
    }

    // CAMINHO 1 - SMART LOAD: Check if suggestedShortTitles exist
    if (videoData.suggestedShortTitles && videoData.suggestedShortTitles.length > 0) {
      log('INFO', 'Phase 5B: Smart load - suggestedShortTitles exist', { videoId: video.id, count: videoData.suggestedShortTitles.length })
      phase5BProcessingRef.current = video.id
      return
    }

    // CAMINHO 2 - LLM CALL: No suggestedShortTitles exist - process via LLM
    log('INFO', 'Phase 5B: LLM call - no suggestedShortTitles found', { videoId: video.id })
    phase5BProcessingRef.current = video.id
    enqueueLLMCall(() => processPhase5BShortTitles())
  }, [wizard.currentPhase, video.id, video.videoType, videoDataReadyFor, videoData.suggestedShortTitles, processPhase5BShortTitles, enqueueLLMCall])

  /**
   * Handle short title selection from Phase 5B.
   * Persists the selected short title to the video document.
   *
   * Note: Phase 5B is independent - no SEO cascade to phases 6/7.
   */
  const handleShortTitleSelect = useCallback(async (shortTitle: string) => {
    log('INFO', 'Short title selected', { videoId: video.id, shortTitle })

    // OPTIMISTIC UPDATE: Update local video data immediately for responsive UI
    setVideoData(prev => ({ ...prev, shortTitle }))

    try {
      // Persist the selected short title via API (async, after UI already updated)
      const response = await fetch(`/api/videos/${video.id}/short-title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortTitle }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar titulo curto')
      }

      log('INFO', 'Short title persisted successfully', { videoId: video.id, shortTitle })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar titulo curto'
      log('ERROR', 'Failed to persist short title', { videoId: video.id, error: message })
      wizard.addAlert(5, 'Erro', message, 'error')
      // Revert optimistic update on error
      setVideoData(prev => ({ ...prev, shortTitle: undefined }))
    }
  }, [video.id, wizard])

  /**
   * Handle revalidation request from Phase 5B.
   * Phase 5B is independent - no cascade to phases 6/7.
   */
  const handleRevalidatePhase5B = useCallback(async (additionalContext: string) => {
    log('INFO', 'Revalidating Phase 5B', { videoId: video.id, additionalContext })

    // CRITICAL: Set revalidation flag FIRST, before any state changes
    isRevalidatingPhase5BRef.current = true

    try {
      // Clear old result immediately to show loading state
      setShortTitlesResult(null)

      // Set processing ref to prevent auto-processing effect from triggering
      phase5BProcessingRef.current = video.id

      // Call LLM with additional context (enqueued to prevent concurrent calls)
      await enqueueLLMCall(() => processPhase5BShortTitles(additionalContext))
    } finally {
      // Clear revalidation flag after processing completes (success or error)
      isRevalidatingPhase5BRef.current = false
    }
  }, [video.id, processPhase5BShortTitles, enqueueLLMCall])

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
      const phase6Data = await runAsyncPhase<Phase6Response>({
        phase: 6,
        videoId: video.id,
        body: additionalContext ? { additionalContext } : undefined,
        pollIntervalMs: 5_000,
      })

      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 6 result discarded — video switched', { jobVideoId: video.id })
        return
      }

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(6, 'completed')
      wizard.addAlert(
        6,
        'Descricao',
        'Confira a descricao e faca os ajustes se necessario:',
        'success'
      )
      setDescriptionResult(phase6Data)

      setVideoData(prev => ({ ...prev, description: phase6Data.description }))

      log('INFO', 'Phase 6 description generation completed', {
        videoId: video.id,
        descriptionLength: phase6Data.description.length,
      })
    } catch (error) {
      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 6 error discarded — video switched', { jobVideoId: video.id })
        return
      }
      const message = error instanceof Error ? error.message : 'Erro ao gerar descricao'
      wizard.removeSpinner(spinnerId)
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
   *
   * REGRA DOS DOIS CAMINHOS (Story 5.3 - DEFINITIVE FIX):
   * Uses videoData (fresh state) instead of video (stale prop) to check for data.
   * Also requires videoDataReadyFor to be true before running.
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before auto-processing
    // This prevents effects from running with stale data from the video prop
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Only process when on phase 6
    if (wizard.currentPhase !== 6) {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      log('WARN', 'Skipping Phase 6 auto-processing - video mismatch', {
        activeVideoId: activeVideoIdRef.current,
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      return
    }

    // CRITICAL: Skip if revalidation is in progress
    // This prevents double LLM calls when user clicks "Gerar nova descrição"
    if (isRevalidatingPhase6Ref.current) {
      log('INFO', 'Skipping Phase 6 auto-processing - revalidation in progress', { videoId: video.id })
      return
    }

    // Skip if already processing or processed this video
    if (phase6ProcessingRef.current === video.id) {
      return
    }

    // CAMINHO 1 - SMART LOAD: Check if description exists (using fresh videoData, not stale video prop)
    if (videoData.description && videoData.description.trim().length > 0) {
      log('INFO', 'Phase 6: Smart load - description exists', { videoId: video.id, length: videoData.description.length })
      phase6ProcessingRef.current = video.id
      // State and alert handled by cached data effect
      return
    }

    // CAMINHO 2 - LLM CALL: No description exists - process via LLM
    log('INFO', 'Phase 6: LLM call - no description found', { videoId: video.id })
    phase6ProcessingRef.current = video.id
    enqueueLLMCall(processPhase6Description)
  }, [wizard.currentPhase, video.id, videoDataReadyFor, videoData.description, processPhase6Description, enqueueLLMCall])

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

        // CRITICAL: Also clear videoData.tags
        // Otherwise the auto-processing effect will try to Smart Load with stale data
        setVideoData(prev => ({ ...prev, tags: undefined }))

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

      // CRITICAL: Also clear videoData.tags
      // Otherwise the auto-processing effect will try to Smart Load with stale data
      setVideoData(prev => ({ ...prev, tags: undefined }))

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
      const phase7Data = await runAsyncPhase<Phase7Response>({
        phase: 7,
        videoId: video.id,
        body: additionalContext ? { additionalContext } : undefined,
        pollIntervalMs: 5_000,
      })

      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 7 result discarded — video switched', { jobVideoId: video.id })
        return
      }

      wizard.removeSpinner(spinnerId)
      wizard.setPhaseStatus(7, 'completed')
      wizard.addAlert(
        7,
        'Tags',
        'Adicione e remova tags conforme necessario.',
        'success'
      )
      setTagsResult(phase7Data)

      setVideoData(prev => ({ ...prev, tags: phase7Data.tags }))

      log('INFO', 'Phase 7 tags generation completed', {
        videoId: video.id,
        tagCount: phase7Data.tags.length,
      })
    } catch (error) {
      if (activeVideoIdRef.current !== video.id) {
        log('WARN', 'Phase 7 error discarded — video switched', { jobVideoId: video.id })
        return
      }
      const message = error instanceof Error ? error.message : 'Erro ao gerar tags'
      wizard.removeSpinner(spinnerId)
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
   *
   * REGRA DOS DOIS CAMINHOS (Story 5.3 - DEFINITIVE FIX):
   * Uses videoData (fresh state) instead of video (stale prop) to check for data.
   * Also requires videoDataReadyFor to be true before running.
   */
  useEffect(() => {
    // CRITICAL: Skip during video transition to prevent race conditions
    if (isTransitioningRef.current) {
      return
    }

    // CRITICAL: Wait for fresh video data to be loaded before auto-processing
    // This prevents effects from running with stale data from the video prop
    if (videoDataReadyFor !== video.id) {
      return
    }

    // Only process when on phase 7
    if (wizard.currentPhase !== 7) {
      return
    }

    // CRITICAL: Verify we're operating on the correct video
    if (activeVideoIdRef.current !== video.id) {
      log('WARN', 'Skipping Phase 7 auto-processing - video mismatch', {
        activeVideoId: activeVideoIdRef.current,
        videoId: video.id,
        currentPhase: wizard.currentPhase,
      })
      return
    }

    // CRITICAL: Skip if revalidation is in progress
    // This prevents double LLM calls when user clicks "Gerar novas tags"
    if (isRevalidatingPhase7Ref.current) {
      log('INFO', 'Skipping Phase 7 auto-processing - revalidation in progress', { videoId: video.id })
      return
    }

    // Skip if already processing or processed this video
    if (phase7ProcessingRef.current === video.id) {
      return
    }

    // CAMINHO 1 - SMART LOAD: Check if tags exist (using fresh videoData, not stale video prop)
    if (videoData.tags && videoData.tags.length > 0) {
      log('INFO', 'Phase 7: Smart load - tags exist', { videoId: video.id, count: videoData.tags.length })
      phase7ProcessingRef.current = video.id
      // State and alert handled by cached data effect
      return
    }

    // CAMINHO 2 - LLM CALL: No tags exist - process via LLM
    log('INFO', 'Phase 7: LLM call - no tags found', { videoId: video.id })
    phase7ProcessingRef.current = video.id
    enqueueLLMCall(processPhase7Tags)
  }, [wizard.currentPhase, video.id, videoDataReadyFor, videoData.tags, processPhase7Tags, enqueueLLMCall])

  /**
   * Handle chapter title change from Phase 4.
   * Persists the updated chapters to the video document.
   */
  const handleChapterChange = useCallback(async (index: number, newTitle: string) => {
    log('INFO', 'Chapter title changed', { videoId: video.id, index, newTitle })

    // Get current chapters from chaptersResult or videoData
    const currentChapters = chaptersResult?.chapters ?? videoData.chapters ?? []
    if (index < 0 || index >= currentChapters.length) {
      log('ERROR', 'Invalid chapter index', { videoId: video.id, index, total: currentChapters.length })
      throw new Error('Indice de capitulo invalido')
    }

    // Create updated chapters array
    const updatedChapters = currentChapters.map((ch, i) =>
      i === index ? { ...ch, title: newTitle } : ch
    )

    try {
      // Persist the chapters via API
      const response = await fetch(`/api/videos/${video.id}/chapters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapters: updatedChapters }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar capitulo')
      }

      // Update local video data and chaptersResult
      setVideoData(prev => ({ ...prev, chapters: updatedChapters }))
      setChaptersResult(prev => prev ? { ...prev, chapters: updatedChapters } : null)

      log('INFO', 'Chapter persisted successfully', { videoId: video.id, index })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar capitulo'
      log('ERROR', 'Failed to persist chapter', { videoId: video.id, index, error: message })
      throw error // Re-throw to let EditableText handle rollback
    }
  }, [video.id, chaptersResult, videoData.chapters])

  /**
   * Handle title change from VideoHeader (editable title).
   * Persists the updated title to the video document.
   *
   * @see Story 10-7 - Editable title
   */
  const handleTitleChange = useCallback(async (newTitle: string) => {
    log('INFO', 'Title changed', { videoId: video.id, newTitle })

    try {
      const response = await fetch(`/api/videos/${video.id}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar titulo')
      }

      // Update local video data
      setVideoData(prev => ({ ...prev, title: newTitle }))

      log('INFO', 'Title persisted successfully', { videoId: video.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar titulo'
      log('ERROR', 'Failed to persist title', { videoId: video.id, error: message })
      throw error // Re-throw to let EditableText handle rollback
    }
  }, [video.id])

  /**
   * Handle short title change from VideoShortTitle (editable short title).
   * Persists the updated short title to the video document.
   *
   * @see Story 10-7 - Editable short title
   */
  const handleShortTitleChange = useCallback(async (newShortTitle: string) => {
    log('INFO', 'Short title changed', { videoId: video.id, newShortTitle })

    try {
      const response = await fetch(`/api/videos/${video.id}/short-title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortTitle: newShortTitle }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar titulo curto')
      }

      // Update local video data
      setVideoData(prev => ({ ...prev, shortTitle: newShortTitle }))

      log('INFO', 'Short title persisted successfully', { videoId: video.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar titulo curto'
      log('ERROR', 'Failed to persist short title', { videoId: video.id, error: message })
      throw error // Re-throw to let EditableText handle rollback
    }
  }, [video.id])

  /**
   * Handle suggested title edit from Phase 5.
   * Persists the updated suggested title to the video document.
   *
   * @see Story 10-7 - Editable suggested titles
   */
  const handleSuggestedTitleEdit = useCallback(async (index: number, newTitle: string) => {
    log('INFO', 'Suggested title edited', { videoId: video.id, index, newTitle })

    try {
      const response = await fetch(`/api/videos/${video.id}/suggested-titles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, title: newTitle }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar titulo sugerido')
      }

      const result = await response.json()

      // Update local video data with the new suggestedTitles array
      setVideoData(prev => ({
        ...prev,
        suggestedTitles: result.data.suggestedTitles,
      }))

      log('INFO', 'Suggested title persisted successfully', { videoId: video.id, index })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar titulo sugerido'
      log('ERROR', 'Failed to persist suggested title', { videoId: video.id, index, error: message })
      throw error // Re-throw to let EditableText handle rollback
    }
  }, [video.id])

  /**
   * Handle suggested short title edit from Phase 5B.
   * Persists the updated suggested short title to the video document.
   *
   * @see Story 10-7 - Editable suggested short titles
   */
  const handleSuggestedShortTitleEdit = useCallback(async (index: number, newShortTitle: string) => {
    log('INFO', 'Suggested short title edited', { videoId: video.id, index, newShortTitle })

    try {
      const response = await fetch(`/api/videos/${video.id}/suggested-short-titles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, shortTitle: newShortTitle }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao salvar titulo curto sugerido')
      }

      const result = await response.json()

      // Update local video data with the new suggestedShortTitles array
      setVideoData(prev => ({
        ...prev,
        suggestedShortTitles: result.data.suggestedShortTitles,
      }))

      log('INFO', 'Suggested short title persisted successfully', { videoId: video.id, index })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar titulo curto sugerido'
      log('ERROR', 'Failed to persist suggested short title', { videoId: video.id, index, error: message })
      throw error // Re-throw to let EditableText handle rollback
    }
  }, [video.id])

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
   *
   * VALIDATION: Before sending, validates that all required phases are complete
   * and phases 2 and 3 have been reviewed if they contain data.
   */
  const handleSendToYouTube = useCallback(async () => {
    log('INFO', 'Sending video to YouTube', { videoId: video.id })

    // Clear previous errors / status
    setPhase8Error(null)
    setThumbnailStatus('idle')
    setThumbnailError(null)

    // VALIDATION: Check if phases 2 and 3 need review confirmation
    const phase2HasData = video.editingIssues !== undefined
    const phase3HasData = video.riskAndCompliance !== undefined
    const phase2Reviewed = videoData.reviewedPhases?.includes(2) ?? false
    const phase3Reviewed = videoData.reviewedPhases?.includes(3) ?? false

    const unreviewedPhases: number[] = []
    if (phase2HasData && !phase2Reviewed) {
      unreviewedPhases.push(2)
    }
    if (phase3HasData && !phase3Reviewed) {
      unreviewedPhases.push(3)
    }

    if (unreviewedPhases.length > 0) {
      const phaseNames = unreviewedPhases.map(p => p === 2 ? 'Checagem de Edição' : 'Riscos e Conformidade')
      const message = `Antes de publicar, você precisa revisar: ${phaseNames.join(' e ')}`
      setPhase8Error(message)
      wizard.addAlert(8, 'Revisão Pendente', message, 'warning')
      log('WARN', 'Cannot send to YouTube - phases need review', { videoId: video.id, unreviewedPhases })
      return
    }

    // VALIDATION: Check required fields
    if (!videoData.title?.trim()) {
      setPhase8Error('O título do vídeo é obrigatório')
      wizard.addAlert(8, 'Dados Incompletos', 'O título do vídeo é obrigatório', 'warning')
      return
    }

    setIsSending(true)

    const spinnerId = wizard.addSpinner(8, 'Enviando metadados para o YouTube...')

    try {
      // Fetch podcast settings to get youtubeFooter and podcast name
      let youtubeFooter = ''
      let podcastName = ''
      try {
        const podcastResponse = await fetch('/api/podcast')
        if (podcastResponse.ok) {
          const podcastData = await podcastResponse.json()
          youtubeFooter = podcastData.data?.youtubeFooter || ''
          podcastName = podcastData.data?.name || ''
        }
      } catch {
        // Silently ignore - podcast settings are optional for publish
      }

      // Build title with podcast suffix
      const finalTitle = podcastName
        ? `${videoData.title} | ${podcastName}`
        : videoData.title

      // For cuts/reels, fetch parent episode data for footer placeholder resolution
      // (e.g., {{video.spotifyUrl}} should resolve from the parent episode)
      let placeholderVideo = videoData
      if (videoData.parentEpisodeId && (videoData.videoType === 'cut' || videoData.videoType === 'reel')) {
        try {
          const parentResponse = await fetch(`/api/videos/${videoData.parentEpisodeId}`)
          if (parentResponse.ok) {
            const parentResult = await parentResponse.json()
            if (parentResult.data) {
              placeholderVideo = parentResult.data
            }
          }
        } catch {
          // Fallback to current video data if parent fetch fails
        }
      }

      // Build complete description with all sections
      const finalDescription = buildCompleteYouTubeDescription({
        description: videoData.description || '',
        guests: videoData.guests,
        chapters: videoData.chapters,
        youtubeFooter,
        video: placeholderVideo,
      })

      const response = await fetch(`/api/youtube/videos/${video.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: finalTitle,
          description: finalDescription,
          tags: videoData.tags || [],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Erro ao enviar para o YouTube')
      }

      // Story 22.5 — upload da thumbnail customizada. Não-bloqueante: se falhar,
      // os metadados continuam publicados e a UI sinaliza claramente. Vídeos
      // legacy (storageThumbnailUrl base64) retornam `uploaded: false` sem erro.
      try {
        const thumbResponse = await fetch(`/api/youtube/videos/${video.id}/thumbnail`, {
          method: 'POST',
        })
        if (thumbResponse.ok) {
          const thumbData = await thumbResponse.json().catch(() => ({}))
          if (thumbData?.data?.uploaded === true) {
            setThumbnailStatus('uploaded')
          } else {
            setThumbnailStatus('skipped')
            log('INFO', 'Thumbnail upload skipped (no cloud storage URL or legacy base64)', {
              videoId: video.id,
              reason: thumbData?.data?.reason,
            })
          }
        } else {
          const thumbError = await thumbResponse.json().catch(() => ({}))
          const message = thumbError?.error?.message ?? 'Falha desconhecida no upload da thumbnail.'
          setThumbnailStatus('failed')
          setThumbnailError(message)
          log('WARN', 'Thumbnail upload failed (non-blocking)', {
            videoId: video.id,
            status: thumbResponse.status,
            message,
          })
        }
      } catch (thumbErr) {
        const message = thumbErr instanceof Error ? thumbErr.message : 'Erro inesperado.'
        setThumbnailStatus('failed')
        setThumbnailError(message)
        log('WARN', 'Thumbnail upload threw (non-blocking)', { videoId: video.id, message })
      }

      // Update video status to 'sent' in Firestore
      await fetch(`/api/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      })

      wizard.removeSpinner(spinnerId)
      setIsSending(false)
      setIsSent(true)
      wizard.addAlert(
        8,
        'Publicado!',
        'Os metadados foram atualizados no YouTube com sucesso.',
        'success'
      )

      // Update local video data status and refresh video list
      setVideoData(prev => ({ ...prev, status: 'sent' }))
      onVideoStatusChange?.()

      // Open YouTube Studio in a new tab
      window.open(`https://studio.youtube.com/video/${video.id}/edit`, '_blank')

      log('INFO', 'Video sent to YouTube successfully', { videoId: video.id })
    } catch (error) {
      wizard.removeSpinner(spinnerId)
      setIsSending(false)
      const message = error instanceof Error ? error.message : 'Erro ao enviar para o YouTube'
      setPhase8Error(message)
      wizard.addAlert(8, 'Erro', message, 'error')
      log('ERROR', 'Failed to send video to YouTube', { videoId: video.id, error: message })
    }
  }, [video.id, video.editingIssues, video.riskAndCompliance, videoData, wizard, onVideoStatusChange])

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
  const handleConfirmReview = useCallback(async (phase: 2 | 3 | 4) => {
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

      // Clear the "from cache" flag and mark as completed
      if (phase === 2) {
        setPhase2FromCache(false)
      } else if (phase === 3) {
        setPhase3FromCache(false)
      } else {
        setPhase4FromCache(false)
      }
      wizard.setPhaseStatus(phase, 'completed')

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
  // Handler for Phase 0 parent selection (cut/reel only)
  const handleParentSelected = useCallback(
    (parentEpisodeId: string, inheritedData: { guests: Video['guests']; theme: string }) => {
      // Update local video data with inherited fields
      setVideoData((prev) => ({
        ...prev,
        parentEpisodeId,
        guests: inheritedData.guests,
        theme: inheritedData.theme,
      }))

      log('INFO', 'Parent episode selected', {
        videoId: video.id,
        parentEpisodeId,
        videoType: video.videoType,
      })
    },
    [video.id, video.videoType]
  )

  const interactivePanel = useMemo(() => {
    // Phase 0 is only for cut and reel videos
    // Cast needed because wizard.currentPhase is typed as WizardPhase (1-8),
    // but can be 0 at runtime for cut/reel videos
    if ((wizard.currentPhase as number) === 0 && (video.videoType === 'cut' || video.videoType === 'reel')) {
      return (
        <Phase0ParentSelection
          wizard={wizard}
          video={videoData}
          onParentSelected={handleParentSelected}
        />
      )
    }

    // Phase 5B is only for cut videos (short title for thumbnails)
    // Cast needed because wizard.currentPhase is typed as WizardPhase (1-8),
    // but can be '5B' at runtime for cut videos
    if ((wizard.currentPhase as unknown as string) === '5B' && video.videoType === 'cut') {
      return (
        <Phase5BShortTitle
          wizard={wizard}
          video={videoData}
          shortTitlesResult={shortTitlesResult}
          error={shortTitlesError}
          onRetry={() => {
            // Reset processing ref to allow retry
            phase5BProcessingRef.current = null
            enqueueLLMCall(() => processPhase5BShortTitles())
          }}
          onRevalidate={handleRevalidatePhase5B}
          onShortTitleSelect={handleShortTitleSelect}
          onSuggestedShortTitleEdit={handleSuggestedShortTitleEdit}
        />
      )
    }

    // Phase 'THUMB' — Epic 22 / Story 22.3 (sub-stories 22.3a..22.3g). Gated
    // by podcast.features.thumbnailGeneration and only inserted into the
    // wizard flow for episode/cut via getPhasesForVideoTypeWithFeatures.
    // Cast needed because wizard.currentPhase is typed as WizardPhase (1-8),
    // but can be 'THUMB' at runtime. 22.3c wires the advance handler that
    // marks THUMB completed and navigates to Publicar (8).
    if ((wizard.currentPhase as unknown as string) === 'THUMB') {
      return (
        <PhaseThumbnail
          video={videoData}
          selectedThumbnailUrl={videoData.storageThumbnailUrl}
          onAdvance={(payload) => {
            // Story 22.3g: PhaseThumbnail já persistiu a URL final via POST /select.
            // Atualizamos o videoData local pra que Phase 8 leia o URL correto sem
            // depender de um novo fetch — o storage Firestore já está coerente.
            setVideoData((prev) => ({ ...prev, storageThumbnailUrl: payload.newStorageUrl }))
            wizard.completePhaseAndAdvance('THUMB', {}, features)
          }}
        />
      )
    }

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
            isFromCache={phase4FromCache}
            isReviewed={videoData.reviewedPhases?.includes(4) ?? false}
            onConfirmReview={() => handleConfirmReview(4)}
            isConfirmingReview={isConfirmingReview}
            onChapterChange={handleChapterChange}
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
            onSuggestedTitleEdit={handleSuggestedTitleEdit}
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
            features={features}
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
            thumbnailStatus={thumbnailStatus}
            thumbnailError={thumbnailError}
          />
        )
      default:
        return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Core dependency - phase changes should trigger re-render
    wizard.currentPhase,
    // Video type for conditional rendering of Phase 0
    video.videoType,
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
    shortTitlesResult,
    shortTitlesError,
    descriptionResult,
    descriptionError,
    tagsResult,
    tagsError,
    isSending,
    isSent,
    phase8Error,
    phase2FromCache,
    phase3FromCache,
    phase4FromCache,
    isConfirmingReview,
    // Callbacks
    handleParentSelected,
    handleContextChange,
    handleConfirmReview,
    handleChapterChange,
    handleRevalidatePhase5,
    handleTitleSelect,
    handleRevalidatePhase5B,
    handleShortTitleSelect,
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
    processPhase5BShortTitles,
    processPhase6Description,
    processPhase7Tags,
  ])

  // Check if transcription is missing (Story 5.6 - Transcrição On-Demand)
  // Show TranscriptionLoader BEFORE the wizard if transcription is not available
  const needsTranscription = !videoData.transcriptionSRT || !videoData.transcriptionTXT

  if (needsTranscription) {
    return (
      <TranscriptionLoader
        video={videoData}
        onSuccess={(transcriptionData: TranscriptionData) => {
          // Update videoData with the transcription directly
          // This avoids the loop caused by router.refresh() not updating local state
          log('INFO', 'Transcription loaded, updating video data', { videoId: videoData.id })
          setVideoData(prev => ({
            ...prev,
            transcriptionSRT: transcriptionData.transcriptionSRT,
            transcriptionTXT: transcriptionData.transcriptionTXT,
          }))
          // CRITICAL: Now that transcription is loaded, mark data as ready for auto-processing
          // This was deferred earlier because transcription was missing
          setVideoDataReadyFor(videoData.id)
          log('INFO', 'Video data now ready for auto-processing after transcription load', { videoId: videoData.id })
        }}
        onCancel={() => {
          log('INFO', 'Transcription loading cancelled', { videoId: videoData.id })
          router.push('/videos')
        }}
      />
    )
  }

  return (
    <WizardLayout
      wizard={wizard}
      video={videoData}
      interactivePanel={interactivePanel}
      onTitleChange={handleTitleChange}
      onShortTitleChange={handleShortTitleChange}
      features={features}
      className={className}
    />
  )
}
