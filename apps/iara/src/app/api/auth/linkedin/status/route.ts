/**
 * LinkedIn connection status endpoint.
 *
 * Returns whether the current user has a valid LinkedIn token
 * and the connected organization name.
 *
 * GET /api/auth/linkedin/status
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAuth } from '@/lib/auth/require-admin'
import { getProviderTokensWithExpiry } from '@/lib/firebase/tokens'

export async function GET() {
  const session = await auth()
  const authError = requireAuth(session)
  if (authError) return authError

  // Check if LinkedIn OAuth is configured
  const isConfigured = !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.LINKEDIN_REDIRECT_URI)

  const tokens = await getProviderTokensWithExpiry(session!.user.id, 'linkedin')

  if (!tokens) {
    return NextResponse.json({
      data: {
        connected: false,
        configured: isConfigured,
      },
    })
  }

  return NextResponse.json({
    data: {
      connected: true,
      targetName: tokens.metadata?.targetName || null,
      targetId: tokens.metadata?.targetId || null,
      targetType: tokens.metadata?.targetType || null,
      expiresAt: tokens.expiresAt,
      needsRefresh: tokens.needsRefresh,
    },
  })
}
