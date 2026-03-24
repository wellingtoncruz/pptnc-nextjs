/**
 * LinkedIn OAuth authorization initiation endpoint.
 *
 * Generates CSRF state, stores state → userId mapping in Firestore,
 * and redirects the user to LinkedIn's authorization page.
 *
 * Uses Firestore instead of cookies because cookies may not survive
 * the cross-domain redirect chain (app → LinkedIn → app).
 *
 * GET /api/auth/linkedin/authorize
 */

import { randomBytes } from 'crypto'

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAuth } from '@/lib/auth/require-admin'
import { getAdminDb } from '@/lib/firebase/admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getLinkedInAuthorizationUrl } from '@/lib/linkedin/auth'
import { log } from '@/lib/logger'
import { FieldValue } from 'firebase-admin/firestore'

export async function GET() {
  const session = await auth()
  const authError = requireAuth(session)
  if (authError) return authError

  try {
    const state = randomBytes(32).toString('hex')
    const userId = session!.user.id

    // Store state → userId mapping in Firestore (TTL: 10 minutes)
    const db = getAdminDb()
    await db
      .collection('podcasts')
      .doc(PODCAST_ID)
      .collection('oauth-states')
      .doc(state)
      .set({
        userId,
        provider: 'linkedin',
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })

    const authorizationUrl = getLinkedInAuthorizationUrl(state)

    log('INFO', 'LinkedIn OAuth flow initiated', { userId })

    return NextResponse.redirect(authorizationUrl)
  } catch (error) {
    log('ERROR', 'Failed to initiate LinkedIn OAuth', {
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: { code: 'LINKEDIN_AUTH_ERROR', message: 'Failed to initiate LinkedIn authorization' } },
      { status: 500 }
    )
  }
}
