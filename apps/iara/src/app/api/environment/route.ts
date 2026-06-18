/**
 * GET /api/environment
 *
 * Expõe o ambiente de deploy ao cliente em RUNTIME (config.ts lê `ENVIRONMENT`).
 * Usado pela fase de Publicação do Wizard para desabilitar o botão "Publicar no
 * YouTube" fora de produção (trava de segurança — Epic 27 append).
 *
 * Runtime-only de propósito: não usar NEXT_PUBLIC_* (build-time, incompatível
 * com a config por env do Cloud Run). Mesmo princípio do FIRESTORE_DATABASE_ID.
 */
import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { ENVIRONMENT, IS_PRODUCTION } from '@/lib/firebase/config'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  return NextResponse.json({
    data: {
      environment: ENVIRONMENT,
      /** Publicação final no YouTube só é permitida em produção. */
      publishAllowed: IS_PRODUCTION,
    },
  })
}
