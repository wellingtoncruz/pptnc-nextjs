/**
 * GET /api/wizard/jobs/[jobId]?videoId=...
 *
 * Polled by the wizard orchestrator after starting an async phase
 * (POST /api/wizard/phase/[phase]?mode=async). Each request reads the job
 * doc once via Firebase Admin and returns the current status snapshot.
 *
 * Polling — rather than the Firestore client SDK + onSnapshot — keeps the
 * frontend free of the Firebase Web SDK + NEXT_PUBLIC_FIREBASE_* env vars
 * that would otherwise need to be baked into the build.
 *
 * @see lib/firebase/wizard-jobs-admin.ts for the job model
 */
import { type NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getWizardJob } from '@/lib/firebase/wizard-jobs-admin'

export const runtime = 'nodejs' // REQUIRED for firebase-admin

interface RouteContext {
  params: Promise<{ jobId: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { jobId } = await context.params
  const videoId = request.nextUrl.searchParams.get('videoId')

  if (!jobId || !videoId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'jobId e videoId são obrigatórios' } },
      { status: 400 }
    )
  }

  const job = await getWizardJob(PODCAST_ID, videoId, jobId)
  if (!job) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Job não encontrado' } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    id: job.id,
    videoId: job.videoId,
    phase: job.phase,
    status: job.status,
    result: job.result,
    error: job.error,
    usage: job.usage,
  })
}
