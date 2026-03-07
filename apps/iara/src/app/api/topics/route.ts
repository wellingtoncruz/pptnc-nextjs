/**
 * GET /api/topics
 *
 * Returns the list of available topic names for the podcast.
 * Used by Phase 7 to populate the topics dropdown.
 *
 * @see Story 20.1 — Topic categorization via LLM
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { listTopicNames } from '@/lib/firebase/topics-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  try {
    const topics = await listTopicNames(PODCAST_ID)

    return NextResponse.json({
      data: { topics },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to fetch topics', {
      podcastId: PODCAST_ID,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao carregar tópicos' } },
      { status: 500 }
    )
  }
}
