/**
 * Wizard Jobs Admin — async LLM processing job CRUD.
 *
 * Path: `podcasts/{podcastId}/videos/{videoId}/wizardJobs/{jobId}`
 *
 * Used by the async wizard pipeline:
 * - Route handler creates a pending job, fires background processing,
 *   returns 202 + jobId immediately to bypass the Cloud Run domain
 *   mapping ~60s edge timeout.
 * - Background worker updates job status as it progresses.
 * - Frontend listens via Firestore onSnapshot to receive results.
 */
import { Timestamp } from 'firebase-admin/firestore'

import { log } from '@/lib/logger'
import { WizardJobCreateSchema, WizardJobUpdateSchema } from '@/lib/schemas/wizard-job'
import type { WizardJobCreate, WizardJobUpdate } from '@/types/wizard-job'

import { getAdminDb } from './admin'

function getWizardJobsCollection(podcastId: string, videoId: string) {
  const db = getAdminDb()
  return db
    .collection('podcasts').doc(podcastId)
    .collection('videos').doc(videoId)
    .collection('wizardJobs')
}

/**
 * Creates a new wizard job in pending state.
 * Returns the generated job document ID.
 */
export async function createWizardJob(
  podcastId: string,
  data: WizardJobCreate
): Promise<string> {
  const validated = WizardJobCreateSchema.parse(data)

  const docRef = getWizardJobsCollection(podcastId, validated.videoId).doc()
  const now = Timestamp.now()

  await docRef.set({
    ...validated,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  })

  log('INFO', 'Wizard job created', {
    jobId: docRef.id,
    videoId: validated.videoId,
    phase: validated.phase,
  })

  return docRef.id
}

/**
 * Updates an existing wizard job (status, result, error, usage).
 * `updatedAt` is set automatically.
 */
export async function updateWizardJob(
  podcastId: string,
  videoId: string,
  jobId: string,
  patch: WizardJobUpdate
): Promise<void> {
  const validated = WizardJobUpdateSchema.parse(patch)

  await getWizardJobsCollection(podcastId, videoId).doc(jobId).update({
    ...validated,
    updatedAt: Timestamp.now(),
  })

  log('INFO', 'Wizard job updated', {
    jobId,
    videoId,
    status: validated.status,
    hasResult: validated.result !== undefined,
    hasError: !!validated.error,
  })
}
