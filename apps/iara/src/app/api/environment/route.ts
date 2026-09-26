/**
 * GET /api/environment
 *
 * Expõe o ambiente de deploy ao cliente em RUNTIME (config.ts lê `ENVIRONMENT`).
 * Usado pela fase de Publicação do Wizard para desabilitar o botão "Publicar no
 * YouTube" fora de produção (Epic 27 append) ou com `features.youtubePublish`
 * desligada pelo admin (set/2026) — ver `lib/youtube/publish-gate.ts`.
 *
 * Runtime-only de propósito: não usar NEXT_PUBLIC_* (build-time, incompatível
 * com a config por env do Cloud Run). Mesmo princípio do FIRESTORE_DATABASE_ID.
 */
import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { ENVIRONMENT } from '@/lib/firebase/config'
import { getYoutubePublishGate } from '@/lib/youtube/publish-gate'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const gate = await getYoutubePublishGate()
  return NextResponse.json({
    data: {
      environment: ENVIRONMENT,
      /** Publicação final no YouTube: PRD E `features.youtubePublish` ligada. */
      publishAllowed: gate.allowed,
      /** Por que não publica — a UI mostra este texto; `null` quando libera. */
      publishBlockedReason: gate.allowed ? null : gate.message,
    },
  })
}
