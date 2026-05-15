/**
 * LLM Provider Factory — Epic 23 / Story 23.4 (parte).
 *
 * Resolve o provider apropriado a partir da configuração do podcast.
 * Decisão é tomada **por chamada**, não por podcast: o resolver consulta
 * `podcast.llmConfig.provider` (ou env var override) a cada `getLLMProvider()`,
 * permitindo que mudanças no Settings tomem efeito sem restart.
 *
 * Hierarquia de resolução:
 *   1. `process.env.LLM_PROVIDER_OVERRIDE` — escape hatch pra debugging
 *      (forçar Gemini ou Claude independente da config do podcast)
 *   2. `podcast.llmConfig.provider` — escolha do produtor via Settings
 *   3. Default `'gemini'` — provider seguro de fallback
 *
 * @see types.ts (interface)
 * @see gemini-provider.ts (default)
 * @see anthropic-provider.ts (alternativa Claude)
 */

import type { Podcast } from '@/types/podcast'

import { getAnthropicProvider } from './anthropic-provider'
import { getGeminiProvider } from './gemini-provider'
import type { LLMProvider } from './types'

/**
 * Tipo mínimo aceito pelo factory — só precisa do campo `provider` opcional.
 * Aceita `Podcast` inteiro ou objeto parcial.
 */
type ProviderConfig = { llmConfig?: { provider?: 'gemini' | 'claude' } } | undefined

/**
 * Retorna o provider correto pra o podcast em questão. Singleton por
 * provider (cada `getXxxProvider()` é singleton internamente).
 *
 * Lazy — se Anthropic estiver configurado mas API key faltar, o erro
 * só dispara no momento da chamada `generateText`, não aqui.
 */
export function getLLMProvider(podcast?: ProviderConfig): LLMProvider {
  const override = process.env.LLM_PROVIDER_OVERRIDE
  const configured = podcast?.llmConfig?.provider
  const effective = (override as 'gemini' | 'claude' | undefined) || configured || 'gemini'

  if (effective === 'claude') {
    return getAnthropicProvider()
  }
  return getGeminiProvider()
}

/**
 * Helper pra exports que precisam do nome textual sem instanciar.
 * Útil pra logging antes de chamar `getLLMProvider`.
 */
export function resolveProviderName(podcast?: ProviderConfig): 'gemini' | 'claude' {
  const override = process.env.LLM_PROVIDER_OVERRIDE
  const configured = podcast?.llmConfig?.provider
  return (override as 'gemini' | 'claude' | undefined) || configured || 'gemini'
}

export type { Podcast }
