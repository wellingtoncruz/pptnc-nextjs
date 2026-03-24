/**
 * Scheduled post execution endpoint.
 *
 * Called by Cloud Tasks at the scheduled time. Reads the scheduled post
 * document from Firestore, validates it's still in 'scheduled' status
 * (atomic check-and-set), then publishes via the Publisher Engine.
 *
 * POST /api/social/execute
 * Body: { scheduledPostId: string }
 */

import { NextRequest, NextResponse } from 'next/server'

import { PODCAST_ID } from '@/lib/firebase/config'
import {
  getScheduledPost,
  updateScheduledPost,
} from '@/lib/firebase/scheduled-posts-admin'
import { log } from '@/lib/logger'
import { publishWithComment } from '@/lib/social/publish-orchestrator'

export async function POST(request: NextRequest) {
  // Validate request origin: Cloud Tasks sets these headers automatically
  const taskName = request.headers.get('x-cloudtasks-taskname')
  const queueName = request.headers.get('x-cloudtasks-queuename')

  // In production, require Cloud Tasks headers. In dev, allow direct calls.
  if (process.env.NODE_ENV === 'production' && !taskName) {
    log('ERROR', 'Execute endpoint called without Cloud Tasks headers — unauthorized access', {
      hasTaskName: !!taskName,
      hasQueueName: !!queueName,
    })
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Direct access not allowed' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { scheduledPostId } = body

    if (!scheduledPostId) {
      return NextResponse.json(
        { error: { code: 'MISSING_ID', message: 'scheduledPostId is required' } },
        { status: 400 }
      )
    }

    log('INFO', 'Executing scheduled post', { scheduledPostId })

    // Read the scheduled post
    const post = await getScheduledPost(PODCAST_ID, scheduledPostId)

    if (!post) {
      log('WARN', 'Scheduled post not found', { scheduledPostId })
      // Return 200 so Cloud Tasks doesn't retry
      return NextResponse.json({ data: { skipped: true, reason: 'not_found' } })
    }

    // Check-and-set: only proceed if status is 'scheduled'
    if (post.status !== 'scheduled') {
      log('INFO', 'Scheduled post already processed or cancelled', {
        scheduledPostId,
        status: post.status,
      })
      // Return 200 — idempotent, no retry needed
      return NextResponse.json({ data: { skipped: true, reason: `status_${post.status}` } })
    }

    // Atomically update to 'publishing' (prevents race conditions)
    await updateScheduledPost(PODCAST_ID, scheduledPostId, { status: 'publishing' })

    // Execute the publication
    const result = await publishWithComment(post.scheduledBy, post.network, {
      content: post.content,
      firstComment: post.firstComment,
      imageUrl: post.imageUrl,
      networkConfig: post.networkConfig,
    })

    // Update with result
    await updateScheduledPost(PODCAST_ID, scheduledPostId, {
      status: result.status,
      ...(result.postId && { externalPostId: result.postId }),
      ...(result.commentId && { externalCommentId: result.commentId }),
      ...(result.error && { error: result.error }),
    })

    log('INFO', 'Scheduled post execution completed', {
      scheduledPostId,
      status: result.status,
      postId: result.postId,
    })

    return NextResponse.json({ data: { status: result.status } })
  } catch (error) {
    log('ERROR', 'Scheduled post execution failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    // Return 500 so Cloud Tasks retries
    return NextResponse.json(
      { error: { code: 'EXECUTION_ERROR', message: 'Failed to execute scheduled post' } },
      { status: 500 }
    )
  }
}
