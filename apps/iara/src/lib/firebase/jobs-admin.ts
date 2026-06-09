/**
 * Jobs Admin — CRUD de jobs LLM assíncronos genéricos (Epic 27, fecha TD-14).
 *
 * Path: `podcasts/{podcastId}/jobs/{jobId}` (top-level no podcast).
 *
 * Usado pelo pipeline assíncrono genérico:
 * - Route handler cria um job pending, dispara `runJobInBackground`, retorna
 *   202 + jobId imediatamente p/ escapar do edge timeout (~60s) do Cloud Run.
 * - O worker de background atualiza o status conforme progride.
 * - O frontend faz polling em `GET /api/jobs/[jobId]` até status terminal.
 *
 * @see lib/firebase/wizard-jobs-admin.ts (predecessor específico do Wizard)
 */
import { Timestamp } from 'firebase-admin/firestore'

import { log } from '@/lib/logger'
import { JobCreateSchema, JobUpdateSchema } from '@/lib/schemas/job'
import type { Job, JobCreate, JobUpdate } from '@/types/job'

import { getAdminDb } from './admin'

function getJobsCollection(podcastId: string) {
  const db = getAdminDb()
  return db.collection('podcasts').doc(podcastId).collection('jobs')
}

/**
 * Cria um novo job em estado pending. Retorna o ID gerado.
 */
export async function createJob(podcastId: string, data: JobCreate): Promise<string> {
  const validated = JobCreateSchema.parse(data)

  const docRef = getJobsCollection(podcastId).doc()
  const now = Timestamp.now()

  await docRef.set({
    ...validated,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  })

  log('INFO', 'Job created', { jobId: docRef.id, type: validated.type })

  return docRef.id
}

/**
 * Atualiza um job (status, result, error, usage). `updatedAt` é setado automaticamente.
 */
export async function updateJob(
  podcastId: string,
  jobId: string,
  patch: JobUpdate
): Promise<void> {
  const validated = JobUpdateSchema.parse(patch)

  await getJobsCollection(podcastId).doc(jobId).update({
    ...validated,
    updatedAt: Timestamp.now(),
  })

  log('INFO', 'Job updated', {
    jobId,
    status: validated.status,
    hasResult: validated.result !== undefined,
    hasError: !!validated.error,
  })
}

/**
 * Lê um job. Retorna null quando não existe.
 */
export async function getJob(podcastId: string, jobId: string): Promise<Job | null> {
  const snap = await getJobsCollection(podcastId).doc(jobId).get()
  if (!snap.exists) return null

  const data = snap.data() as Omit<Job, 'id'>
  return { id: snap.id, ...data }
}
