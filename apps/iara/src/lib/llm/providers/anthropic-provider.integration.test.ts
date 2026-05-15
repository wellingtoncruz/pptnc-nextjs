/**
 * Integration tests pra AnthropicProvider — batem na API Anthropic real e
 * gastam tokens. Gated por env var pra não rodar em CI.
 *
 * Pré-requisitos:
 *   - ANTHROPIC_API_KEY em .env.local (ou exportado no shell)
 *   - CLAUDE_INTEGRATION_TESTS=true
 *
 * Como rodar:
 *   CLAUDE_INTEGRATION_TESTS=true ANTHROPIC_API_KEY=sk-ant-... \
 *     npx vitest run src/lib/llm/providers/anthropic-provider.integration.test.ts
 *
 * Custo: cada teste consome ~50-200 tokens com Haiku 4.5 ($1/$5 per 1M),
 * total ~$0.001 por suite run.
 */

import { describe, expect, it } from 'vitest'

import { AnthropicProvider } from './anthropic-provider'

const INTEGRATION = process.env.CLAUDE_INTEGRATION_TESTS === 'true'

describe.skipIf(!INTEGRATION)('AnthropicProvider integration (real API)', () => {
  it('generateText retorna texto + usage + custo > 0 com Haiku', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY não configurada — integration tests requerem credencial real')
    }

    const provider = new AnthropicProvider()
    const result = await provider.generateText({
      systemPrompt: 'Você responde em JSON: {"ok": true}',
      userPrompt: 'Confirme.',
      model: 'claude-haiku-4-5-20251001', // mais barato
    })

    expect(result.text).toBeTruthy()
    expect(result.text.length).toBeGreaterThan(0)
    expect(result.usage.promptTokens).toBeGreaterThan(0)
    expect(result.usage.completionTokens).toBeGreaterThan(0)
    expect(result.usage.totalTokens).toBe(result.usage.promptTokens + result.usage.completionTokens)
    expect(result.estimatedCostUsd).toBeGreaterThan(0)
    expect(result.modelUsed).toContain('claude-haiku')
    expect(result.latencyMs).toBeGreaterThan(0)
  }, 30_000)

  it('estimateTokens retorna número proporcional ao tamanho do texto', async () => {
    const provider = new AnthropicProvider()
    const short = await provider.estimateTokens('curto')
    const long = await provider.estimateTokens('este texto é muito mais longo e deve ter mais tokens estimados que o anterior por uma boa margem')

    expect(short).toBeGreaterThan(0)
    expect(long).toBeGreaterThan(short)
  })

  it('rejeita com LLMError para model inválido', async () => {
    const provider = new AnthropicProvider()
    await expect(
      provider.generateText({
        systemPrompt: 'Sistema',
        userPrompt: 'User',
        model: 'claude-modelo-que-nao-existe',
      }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/API_ERROR|INVALID_RESPONSE/),
    })
  }, 30_000)
})
