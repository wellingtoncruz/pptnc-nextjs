/**
 * Dismiss a scheduled post (hide from listing).
 *
 * PATCH /api/scheduled-posts/[postId]/dismiss
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAuth } from '@/lib/auth/require-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { updateScheduledPost } from '@/lib/firebase/scheduled-posts-admin'
import { log } from '@/lib/logger'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const session = await auth()
  const authError = requireAuth(session)
  if (authError) return authError

  const { postId } = await params

  await updateScheduledPost(PODCAST_ID, postId, { dismissed: true })

  log('INFO', 'Scheduled post dismissed', {
    postId,
    userId: session!.user.id,
  })

  return NextResponse.json({ data: { success: true } })
}
