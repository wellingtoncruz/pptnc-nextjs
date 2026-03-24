/**
 * Scheduled posts API routes.
 *
 * POST /api/scheduled-posts — Create a new scheduled post
 * GET  /api/scheduled-posts — List scheduled posts with filters
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAuth } from '@/lib/auth/require-admin'
import { createPublishTask } from '@/lib/cloud-tasks/scheduler'
import { PODCAST_ID } from '@/lib/firebase/config'
import {
  createScheduledPost,
  listScheduledPosts,
  updateScheduledPost,
} from '@/lib/firebase/scheduled-posts-admin'
import { log } from '@/lib/logger'
import { ScheduledPostCreateSchema } from '@/lib/schemas/scheduled-post'
import type { ScheduledPostStatus } from '@/types/scheduled-post'

export async function POST(request: NextRequest) {
  const session = await auth()
  const authError = requireAuth(session)
  if (authError) return authError

  try {
    const body = await request.json()

    // Override scheduledBy with authenticated user
    const input = {
      ...body,
      scheduledBy: session!.user.id,
    }

    // Validate
    const parsed = ScheduledPostCreateSchema.safeParse(input)
    if (!parsed.success) {
      log('WARN', 'Scheduled post validation failed', {
        issues: parsed.error.issues,
        input: JSON.stringify(input),
      })
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Dados inválidos', issues: parsed.error.issues } },
        { status: 400 }
      )
    }

    // Create Firestore document
    const postId = await createScheduledPost(PODCAST_ID, parsed.data)

    // Create Cloud Task
    const taskName = await createPublishTask(postId, parsed.data.scheduledAt)

    // Save taskName back to the document
    await updateScheduledPost(PODCAST_ID, postId, { taskName })

    log('INFO', 'Scheduled post created via API', {
      postId,
      network: parsed.data.network,
      scheduledAt: parsed.data.scheduledAt,
      userId: session!.user.id,
    })

    return NextResponse.json({ data: { id: postId } }, { status: 201 })
  } catch (error) {
    log('ERROR', 'Failed to create scheduled post', {
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: { code: 'CREATE_ERROR', message: 'Erro ao criar agendamento' } },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  const authError = requireAuth(session)
  if (authError) return authError

  const { searchParams } = request.nextUrl
  const sourceId = searchParams.get('sourceId') || undefined
  const network = searchParams.get('network') || undefined
  const status = searchParams.get('status') || undefined
  const cursor = searchParams.get('cursor') || undefined
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined

  const result = await listScheduledPosts(PODCAST_ID, {
    sourceType: sourceId ? undefined : undefined,
    network,
    status: status as ScheduledPostStatus | undefined,
    cursor,
    limit,
  })

  // If sourceId filter was requested, filter in-memory
  // (Firestore composite index would be needed otherwise)
  if (sourceId) {
    result.items = result.items.filter((item) => item.sourceId === sourceId)
  }

  return NextResponse.json({ data: result })
}
