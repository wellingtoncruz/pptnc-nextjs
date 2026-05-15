/**
 * Spike Story 23.1 / AC1 — Validação de compatibilidade Turbopack.
 *
 * ⚠️ ONE-OFF — APAGAR antes de mergear em main. Não é código de produção.
 *
 * Existe apenas pra validar que `@anthropic-ai/vertex-sdk` v0.16.0 importa
 * e executa corretamente quando o Next.js 16 é rodado em modo dev
 * (Turbopack). Se essa rota responder 200 em `pnpm dev`, AC1 passa.
 * Se o dev server quebrar com erro de bundling, R1 confirmado e precisamos
 * de fallback (REST direta).
 *
 * Uso:
 *   1. `pnpm --filter iara dev`
 *   2. Em outro terminal: `curl http://localhost:3000/api/spike-claude`
 *   3. Resposta `{ ok: true, ... }` = AC1 PASS
 *      Erro de build/runtime = AC1 FAIL
 *
 * Não passa por auth — é spike, host local apenas. Endpoint deve ser
 * removido (junto com o script) antes do epic real iniciar.
 */
import { NextResponse } from 'next/server'
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'

export const runtime = 'nodejs'

export async function GET() {
  const projectId = process.env.GCP_PROJECT_ID || 'pptnc-stage'
  const region = process.env.ANTHROPIC_REGION || 'us-east5'
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

  try {
    const client = new AnthropicVertex({ projectId, region })
    const response = await client.messages.create({
      model,
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Responda apenas: ok' }],
    })
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
    return NextResponse.json({
      ok: true,
      ac1: 'PASS — Turbopack bundling + SDK runtime + Vertex AI call all worked',
      model,
      region,
      projectId,
      response: text,
      usage: response.usage,
    })
  } catch (error) {
    const e = error as { status?: number; message?: string; name?: string }
    return NextResponse.json(
      {
        ok: false,
        ac1: 'FAIL — see error',
        likelyAllowlistOr403: e.status === 403 || e.status === 404,
        errorName: e.name,
        errorMessage: e.message ?? String(error),
        errorStatus: e.status,
      },
      { status: 500 }
    )
  }
}
