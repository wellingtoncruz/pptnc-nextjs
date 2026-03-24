/**
 * LinkedIn OAuth callback endpoint.
 *
 * Recovers userId from Firestore oauth-states collection (not from session
 * or cookies, which don't survive the cross-domain redirect from LinkedIn).
 *
 * GET /api/auth/linkedin/callback?code=...&state=...
 */

import { NextRequest, NextResponse } from 'next/server'

import { getAdminDb } from '@/lib/firebase/admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { saveProviderTokens } from '@/lib/firebase/tokens'
import {
  exchangeLinkedInCode,
  getLinkedInOrganizations,
  getLinkedInProfile,
  isOrganizationScope,
} from '@/lib/linkedin/auth'
import { log } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    log('WARN', 'LinkedIn OAuth denied or scope error', {
      error,
      errorDescription: request.nextUrl.searchParams.get('error_description'),
    })
    return NextResponse.redirect(new URL('/videos?view=settings&linkedin=error&reason=denied', request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/videos?view=settings&linkedin=error&reason=missing_params', request.url))
  }

  // Recover userId from Firestore oauth-states
  const db = getAdminDb()
  const stateRef = db
    .collection('podcasts')
    .doc(PODCAST_ID)
    .collection('oauth-states')
    .doc(state)

  const stateDoc = await stateRef.get()

  if (!stateDoc.exists) {
    log('WARN', 'LinkedIn OAuth state not found in Firestore (expired or invalid)')
    return NextResponse.redirect(new URL('/videos?view=settings&linkedin=error&reason=csrf', request.url))
  }

  const stateData = stateDoc.data()!
  const userId = stateData.userId as string

  // Check expiry
  const expiresAt = stateData.expiresAt?.toDate?.() || stateData.expiresAt
  if (expiresAt && new Date(expiresAt) < new Date()) {
    log('WARN', 'LinkedIn OAuth state expired', { userId })
    await stateRef.delete()
    return NextResponse.redirect(new URL('/videos?view=settings&linkedin=error&reason=csrf', request.url))
  }

  // Delete the state doc (one-time use)
  await stateRef.delete()

  try {
    const tokenResponse = await exchangeLinkedInCode(code)
    const expiresAt = Math.floor(Date.now() / 1000) + tokenResponse.expiresIn

    let metadata: Record<string, string>
    let displayName: string

    if (isOrganizationScope()) {
      const organizations = await getLinkedInOrganizations(tokenResponse.accessToken)

      if (organizations.length === 0) {
        log('WARN', 'No LinkedIn organizations found', { userId })
        return NextResponse.redirect(new URL('/videos?view=settings&linkedin=error&reason=no_org', request.url))
      }

      const org = organizations[0]
      metadata = { targetType: 'page', targetId: org.id, targetName: org.name }
      displayName = org.name
    } else {
      const profile = await getLinkedInProfile(tokenResponse.accessToken)
      metadata = { targetType: 'profile', targetId: profile.sub, targetName: profile.name }
      displayName = profile.name
    }

    await saveProviderTokens(userId, 'linkedin', {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      expiresAt,
      metadata,
    })

    log('INFO', 'LinkedIn OAuth completed successfully', {
      userId,
      targetType: metadata.targetType,
      targetName: metadata.targetName,
    })

    const encodedName = encodeURIComponent(displayName)
    return NextResponse.redirect(
      new URL(`/videos?view=settings&linkedin=success&name=${encodedName}`, request.url)
    )
  } catch (err) {
    log('ERROR', 'LinkedIn OAuth callback failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.redirect(new URL('/videos?view=settings&linkedin=error&reason=exchange_failed', request.url))
  }
}
