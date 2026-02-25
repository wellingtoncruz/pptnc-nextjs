import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAuth } from '@/lib/auth/require-admin'
import { getSocialNetworks } from '@/lib/firebase/social-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  const authError = requireAuth(session)
  if (authError) return authError

  try {
    const networks = await getSocialNetworks()
    return NextResponse.json({ data: networks })
  } catch (error) {
    log('ERROR', 'Failed to fetch social networks', { error })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao carregar redes sociais' } },
      { status: 500 }
    )
  }
}
