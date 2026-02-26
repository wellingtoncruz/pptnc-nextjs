/**
 * API route for fetching LLM debug logs.
 *
 * GET: Returns logs ordered by createdAt desc with pagination.
 *
 * Query params:
 * - limit: number (default: 100, max: 200)
 *
 * Returns:
 * - Success: { data: { logs: LlmLog[] } }
 * - Error: { error: { code: string, message: string } }
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth/require-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getLlmLogs } from '@/lib/firebase/llm-log-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const adminCheck = requireAdmin(session)
  if (!adminCheck.authorized) {
    return adminCheck.response
  }

  try {
    const { searchParams } = request.nextUrl
    const limitParam = searchParams.get('limit')
    const limit = Math.min(Math.max(parseInt(limitParam || '100', 10) || 100, 1), 200)

    const result = await getLlmLogs(PODCAST_ID, { limit })

    log('INFO', 'LLM logs API response', { count: result.logs.length, limit })

    return NextResponse.json({
      data: {
        logs: result.logs,
      },
    })
  } catch (error) {
    log('ERROR', 'Failed to fetch LLM logs', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao buscar logs' } },
      { status: 500 }
    )
  }
}
