/**
 * Cancel a scheduled post.
 *
 * Deletes the Cloud Task and updates the Firestore document status to 'cancelled'.
 * Only works for posts in 'scheduled' status.
 *
 * POST /api/scheduled-posts/[postId]/cancel
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAuth } from '@/lib/auth/require-admin'
import { cancelPublishTask } from '@/lib/cloud-tasks/scheduler'
import { PODCAST_ID } from '@/lib/firebase/config'
import {
  getScheduledPost,
  updateScheduledPost,
} from '@/lib/firebase/scheduled-posts-admin'
import { log } from '@/lib/logger'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const session = await auth()
  const authError = requireAuth(session)
  if (authError) return authError

  const { postId } = await params

  const post = await getScheduledPost(PODCAST_ID, postId)

  if (!post) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Agendamento não encontrado' } },
      { status: 404 }
    )
  }

  if (post.status !== 'scheduled') {
    return NextResponse.json(
      { error: { code: 'INVALID_STATUS', message: `Não é possível cancelar um agendamento com status "${post.status}"` } },
      { status: 400 }
    )
  }

  // Delete Cloud Task
  if (post.taskName) {
    await cancelPublishTask(post.taskName)
  }

  // Update status
  await updateScheduledPost(PODCAST_ID, postId, { status: 'cancelled' })

  log('INFO', 'Scheduled post cancelled', {
    postId,
    userId: session!.user.id,
  })

  return NextResponse.json({ data: { success: true } })
}
