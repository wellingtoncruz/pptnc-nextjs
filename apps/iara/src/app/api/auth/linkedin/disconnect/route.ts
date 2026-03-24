/**
 * Disconnect LinkedIn OAuth — removes tokens and cancels pending posts.
 *
 * POST /api/auth/linkedin/disconnect
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAuth } from '@/lib/auth/require-admin'
import { cancelPublishTask } from '@/lib/cloud-tasks/scheduler'
import { PODCAST_ID } from '@/lib/firebase/config'
import {
  listScheduledPosts,
  updateScheduledPost,
} from '@/lib/firebase/scheduled-posts-admin'
import { deleteProviderTokens } from '@/lib/firebase/tokens'
import { log } from '@/lib/logger'

export async function POST() {
  const session = await auth()
  const authError = requireAuth(session)
  if (authError) return authError

  const userId = session!.user.id

  // Cancel all pending LinkedIn scheduled posts
  const { items } = await listScheduledPosts(PODCAST_ID, {
    status: 'scheduled',
    network: 'linkedin',
  })

  for (const post of items) {
    if (post.taskName) {
      await cancelPublishTask(post.taskName)
    }
    await updateScheduledPost(PODCAST_ID, post.id, {
      status: 'failed',
      error: 'LinkedIn desconectado pelo produtor',
    })
  }

  // Delete tokens
  await deleteProviderTokens(userId, 'linkedin')

  log('INFO', 'LinkedIn disconnected', {
    userId,
    cancelledPosts: items.length,
  })

  return NextResponse.json({ data: { success: true } })
}
