/**
 * Runs a wizard phase via the async pipeline:
 *
 *   1. POST /api/wizard/phase/{phase}?mode=async  →  202 + jobId
 *   2. Poll GET /api/wizard/jobs/{jobId} until terminal status
 *   3. Return the typed result, or throw with the error message
 *
 * Bypasses the Cloud Run domain-mapping ~60s edge timeout: the LLM work runs
 * in the background while each poll is a sub-second request well under any
 * edge timeout. Polling interval is per-phase (longer phases use 10s to
 * reduce Firestore read costs; shorter phases use 5s for snappier UX).
 *
 * @see app/api/wizard/phase/[phase]/route.ts (and 5b/route.ts) for the async branch
 * @see lib/wizard/poll-job.ts for the polling implementation
 */
import type { LLMPhaseId } from '@/lib/wizard'

import { pollWizardJob } from './poll-job'

interface RunAsyncPhaseOptions {
  /**
   * Phase identifier. Phases 1-7 share /api/wizard/phase/[phase]; '5b' has
   * its own dedicated route.
   */
  phase: LLMPhaseId | 'short-title'
  videoId: string
  /**
   * Extra request body fields. `videoId` is added automatically.
   * Phases 5/5b/6/7 may pass `additionalContext` for revalidation.
   * Phases 5/6/7 may pass `previousPhaseData` for the SEO chain.
   */
  body?: Record<string, unknown>
  /** Polling interval in ms — 10000 for phases 1-4, 5000 for 5/5b/6/7. */
  pollIntervalMs: number
  signal?: AbortSignal
}

/**
 * Throws Error with the human-readable message on failure (HTTP error,
 * job-level failure, or aborted signal).
 */
export async function runAsyncPhase<T>({
  phase,
  videoId,
  body,
  pollIntervalMs,
  signal,
}: RunAsyncPhaseOptions): Promise<T> {
  const phaseSegment = String(phase)

  const response = await fetch(`/api/wizard/phase/${phaseSegment}?mode=async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, ...(body ?? {}) }),
    signal,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(
      errorBody?.error?.message || `Erro ao iniciar fase ${phaseSegment}`
    )
  }

  const { jobId } = await response.json() as { jobId: string }

  const outcome = await pollWizardJob({ jobId, videoId, intervalMs: pollIntervalMs, signal })

  if (outcome.status === 'failed') {
    throw new Error(outcome.error.message)
  }

  return outcome.result as T
}
