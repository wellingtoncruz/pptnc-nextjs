/**
 * Preço dos modelos de texto (USD por 1M tokens) — fonte ÚNICA.
 *
 * Até out/2026 havia três cópias (estimador + um por provider) "para evitar
 * dependência circular". A do Gemini ficou com os preços de maio: o
 * `gemini-2.5-flash` custava 4x menos no custo por chamada do que no painel, e
 * os modelos 3.1/3.5/3.6 saíam com custo zero. Este módulo não importa nada
 * além do catálogo, então não há ciclo.
 *
 * **Auditado em 2026-10-11** contra a doc da Anthropic e a página de preços do
 * Vertex (coluna **Global** — default do Vertex; regional custa +10%).
 *
 * **Preço vigente, inclusive promocional** (decisão do Wellington, 11/10/2026;
 * antes valia o preço cheio). Revisar em **2027-01-01**: Gemini 3.6/3.7/3.8
 * Flash sobem de $0,75/$3,75 para $1,50/$7,50.
 */
import { resolveTextModelId } from './models'

export interface ModelPricing {
  input: number
  output: number
  /** Prompts acima de `aboveTokens` pagam esta faixa na chamada inteira. */
  longContext?: { aboveTokens: number; input: number; output: number }
}

const PRICING_USD_PER_M: Record<string, ModelPricing> = {
  // ── Gemini (Vertex AI, endpoint global) ──
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-pro': { input: 1.25, output: 10, longContext: { aboveTokens: 200_000, input: 2.5, output: 15 } },
  'gemini-3.1-pro-preview': { input: 2, output: 12, longContext: { aboveTokens: 200_000, input: 4, output: 18 } },
  'gemini-3-flash-preview': { input: 0.5, output: 3 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.7-flash': { input: 0.75, output: 3.75 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  // ── Claude (Anthropic API direta) ──
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  // $2/$10 nasceu promocional e virou o preço padrão (o aumento de set/2026 foi cancelado).
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, longContext: { aboveTokens: 100_000, input: 0.5, output: 2.5 } },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

/** Preço do modelo; IDs legados são resolvidos para o sucessor. */
export function getModelPricing(model: string): ModelPricing | undefined {
  return PRICING_USD_PER_M[resolveTextModelId(model)]
}

/** Custo de UMA chamada. Modelo fora da tabela devolve 0. */
export function calculateCallCostUsd(
  model: string,
  usage: { promptTokens: number; completionTokens: number }
): number {
  const pricing = getModelPricing(model)
  if (!pricing) return 0
  const tier =
    pricing.longContext && usage.promptTokens > pricing.longContext.aboveTokens ? pricing.longContext : pricing
  return (usage.promptTokens / 1_000_000) * tier.input + (usage.completionTokens / 1_000_000) * tier.output
}
