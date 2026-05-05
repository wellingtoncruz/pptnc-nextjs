/**
 * Wizard Jobs Client — frontend listener for async wizard job progress.
 *
 * Path: `podcasts/{podcastId}/videos/{videoId}/wizardJobs/{jobId}`
 *
 * Used by the wizard orchestrator to subscribe to job completion
 * after POSTing to the async phase endpoint.
 */
import { doc, onSnapshot } from 'firebase/firestore'

import { log } from '@/lib/logger'
import type { WizardJob, WizardJobStatus } from '@/types/wizard-job'

import { getDb } from './client'

/**
 * Public callback shape — receives the snapshot data each time the doc changes,
 * or null if the doc doesn't exist yet (transient race during creation).
 */
export type WizardJobSnapshot = {
  id: string
  videoId: string
  phase: WizardJob['phase']
  status: WizardJobStatus
  result?: unknown
  error?: { code: string; message: string; retryable?: boolean }
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

/**
 * Subscribes to a wizard job document. The callback fires once with current
 * state and again on every server-side update.
 *
 * Returns an unsubscribe function. Always call it on component unmount or
 * when switching jobs to avoid leaking listeners.
 */
export function subscribeToWizardJob(
  podcastId: string,
  videoId: string,
  jobId: string,
  onUpdate: (snapshot: WizardJobSnapshot | null) => void,
  onError?: (error: Error) => void
): () => void {
  const db = getDb()
  const ref = doc(
    db,
    'podcasts', podcastId,
    'videos', videoId,
    'wizardJobs', jobId
  )

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null)
        return
      }

      const data = snap.data()
      onUpdate({
        id: snap.id,
        videoId: data.videoId,
        phase: data.phase,
        status: data.status,
        result: data.result,
        error: data.error,
        usage: data.usage,
      })
    },
    (err) => {
      log('ERROR', 'Wizard job subscription error', {
        jobId,
        videoId,
        error: err.message,
      })
      onError?.(err)
    }
  )
}
