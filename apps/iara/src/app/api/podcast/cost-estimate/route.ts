import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { estimateMonthlyCost } from '@/lib/llm/cost-estimator'
import type { LLMProviderId } from '@/lib/llm/models'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider') as LLMProviderId | null
  const model = searchParams.get('model')

  if (!provider || (provider !== 'gemini' && provider !== 'claude')) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Provider inválido' } },
      { status: 400 }
    )
  }
  if (!model) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Model obrigatório' } },
      { status: 400 }
    )
  }

  try {
    const estimate = await estimateMonthlyCost(provider, model, PODCAST_ID)
    return NextResponse.json({ data: estimate })
  } catch (error) {
    log('ERROR', 'Falha ao estimar custo', {
      provider,
      model,
      error: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao estimar custo' } },
      { status: 500 }
    )
  }
}
