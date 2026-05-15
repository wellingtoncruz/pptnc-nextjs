/**
 * Spike Story 23.1 / AC1 — Validação de compatibilidade Turbopack.
 *
 * ⚠️ ONE-OFF — APAGAR antes de mergear em main. Não é código de produção.
 *
 * Decisão Wellington 2026-05-15: usar Anthropic API direta em vez de Vertex AI.
 * Existe apenas pra validar que `@anthropic-ai/sdk` v0.96.0 importa e
 * executa em Next.js 16 + Turbopack. Se essa rota responder 200 em `pnpm
 * dev`, AC1 passa.
 *
 * Uso:
 *   1. Adiciona `ANTHROPIC_API_KEY=sk-ant-api03-...` em `.env.local`
 *   2. `pnpm --filter iara dev`
 *   3. Outro terminal: `curl http://localhost:3000/api/spike-claude`
 *   4. `{ ok: true, ... }` = AC1 PASS
 */
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, ac1: 'BLOCKED — ANTHROPIC_API_KEY ausente em .env.local' },
      { status: 500 }
    )
  }

  try {
    const client = new Anthropic({ apiKey })
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
      ac1: 'PASS — Turbopack bundling + Anthropic SDK runtime + API call all worked',
      model,
      response: text,
      usage: response.usage,
    })
  } catch (error) {
    const e = error as { status?: number; message?: string; name?: string }
    return NextResponse.json(
      {
        ok: false,
        ac1: 'FAIL — see error',
        likelyAuth: e.status === 401,
        likelyRateLimit: e.status === 429,
        errorName: e.name,
        errorMessage: e.message ?? String(error),
        errorStatus: e.status,
      },
      { status: 500 }
    )
  }
}
