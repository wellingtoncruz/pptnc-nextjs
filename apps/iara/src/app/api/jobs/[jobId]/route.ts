/**
 * GET /api/jobs/[jobId]
 *
 * Polled pelo cliente após iniciar um job assíncrono genérico
 * (POST `…?mode=async`). Cada request lê o doc do job uma vez via Firebase
 * Admin e retorna o snapshot do status atual.
 *
 * Coleção top-level (`podcasts/{podcastId}/jobs/{jobId}`), então o read precisa
 * só do jobId — sem parent. Polling (em vez de onSnapshot) mantém o frontend
 * livre do Firebase Web SDK + NEXT_PUBLIC_FIREBASE_* (que exigiriam build-time).
 *
 * @see lib/firebase/jobs-admin.ts (modelo do job)
 * @see app/api/wizard/jobs/[jobId]/route.ts (predecessor específico do Wizard)
 */
import { type NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getJob } from '@/lib/firebase/jobs-admin'

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
  if (!jobId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'jobId é obrigatório' } },
      { status: 400 }
    )
  }

  const job = await getJob(PODCAST_ID, jobId)
  if (!job) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Job não encontrado' } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    status: job.status,
    result: job.result,
    error: job.error,
    usage: job.usage,
  })
}
