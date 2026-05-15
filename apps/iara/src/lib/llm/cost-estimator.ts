import { getAdminDb } from '@/lib/firebase/admin'
import { log } from '@/lib/logger'
import type { LLMProviderId } from './models'

/**
 * Pricing por modelo (USD por 1M tokens). Replicado dos providers pra evitar
 * dependência circular — quando um provider mudar pricing, atualizar aqui também.
 */
const PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  // Gemini
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash-lite': { input: 0.05, output: 0.2 },
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.5-flash-lite': { input: 0.05, output: 0.2 },
  'gemini-2.5-pro': { input: 1.25, output: 5 },
  'gemini-3.1-pro-preview': { input: 2, output: 10 },
  'gemini-3-flash-preview': { input: 0.1, output: 0.4 },
  'gemini-3.1-flash-lite-preview': { input: 0.05, output: 0.2 },
  // Claude
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

/**
 * Defaults documentados — tokens médios por vídeo somando todas as fases.
 * Episode = fases 1-7; Cut = fases 0,5,5B,6,7; Reel = fases 0,5,6,7.
 *
 * Valores derivados de observação típica PPTNC. Quando há histórico real
 * (`llm-logs` últimos 30 dias), o estimator usa medições ao invés desses.
 */
export const DEFAULT_TOKENS_PER_VIDEO: Record<'episode' | 'cut' | 'reel', { input: number; output: number }> = {
  episode: { input: 50_000, output: 8_000 },
  cut: { input: 20_000, output: 3_500 },
  reel: { input: 15_000, output: 2_500 },
}

/**
 * Volume típico mensal de PPTNC: ~22 vídeos/semana. Distribuição estimada
 * usada quando não há histórico real pra extrapolar.
 */
export const DEFAULT_MONTHLY_VOLUME: Record<'episode' | 'cut' | 'reel', number> = {
  episode: 12,
  cut: 50,
  reel: 30,
}

export type CostThreshold = 'safe' | 'warning' | 'danger'

export interface CostBreakdown {
  episode: number
  cut: number
  reel: number
}

export interface CostEstimate {
  monthlyUsd: number
  threshold: CostThreshold
  breakdown: CostBreakdown
  source: 'defaults' | 'actual'
  /** Quantos vídeos por tipo no histórico (quando source='actual'). */
  sampleSize?: Record<'episode' | 'cut' | 'reel', number>
}

export function classifyThreshold(monthlyUsd: number): CostThreshold {
  if (monthlyUsd >= 100) return 'danger'
  if (monthlyUsd >= 20) return 'warning'
  return 'safe'
}

function costForVideoTokens(
  tokens: { input: number; output: number },
  pricing: { input: number; output: number }
): number {
  return (tokens.input / 1_000_000) * pricing.input + (tokens.output / 1_000_000) * pricing.output
}

/**
 * Estima custo mensal baseado em defaults documentados. Use quando não há
 * histórico de uso real no llm-logs.
 */
export function estimateMonthlyCostFromDefaults(
  provider: LLMProviderId,
  model: string
): CostEstimate {
  const pricing = PRICING_USD_PER_M[model]
  if (!pricing) {
    log('WARN', 'Cost estimator: pricing desconhecido para o modelo', { provider, model })
    return {
      monthlyUsd: 0,
      threshold: 'safe',
      breakdown: { episode: 0, cut: 0, reel: 0 },
      source: 'defaults',
    }
  }

  const breakdown: CostBreakdown = {
    episode: costForVideoTokens(DEFAULT_TOKENS_PER_VIDEO.episode, pricing) * DEFAULT_MONTHLY_VOLUME.episode,
    cut: costForVideoTokens(DEFAULT_TOKENS_PER_VIDEO.cut, pricing) * DEFAULT_MONTHLY_VOLUME.cut,
    reel: costForVideoTokens(DEFAULT_TOKENS_PER_VIDEO.reel, pricing) * DEFAULT_MONTHLY_VOLUME.reel,
  }
  const monthlyUsd = breakdown.episode + breakdown.cut + breakdown.reel

  return {
    monthlyUsd,
    threshold: classifyThreshold(monthlyUsd),
    breakdown,
    source: 'defaults',
  }
}

interface UsageStats {
  tokensByType: Record<'episode' | 'cut' | 'reel', { input: number; output: number }>
  videosByType: Record<'episode' | 'cut' | 'reel', Set<string>>
  daysCovered: number
}

/**
 * Lê llm-logs dos últimos N dias e agrega tokens por videoType. Retorna `null`
 * se não há histórico suficiente (zero logs).
 */
export async function readActualUsage(
  podcastId: string,
  days: number = 30
): Promise<UsageStats | null> {
  const db = getAdminDb()
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const snapshot = await db
    .collection('podcasts').doc(podcastId)
    .collection('llmLogs')
    .where('createdAt', '>=', cutoff)
    .get()

  if (snapshot.empty) return null

  const stats: UsageStats = {
    tokensByType: {
      episode: { input: 0, output: 0 },
      cut: { input: 0, output: 0 },
      reel: { input: 0, output: 0 },
    },
    videosByType: {
      episode: new Set(),
      cut: new Set(),
      reel: new Set(),
    },
    daysCovered: days,
  }

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const videoType = data.videoType as 'episode' | 'cut' | 'reel' | undefined
    const usage = data.usage as { promptTokens?: number; completionTokens?: number } | undefined
    if (!videoType || !usage) continue
    if (!stats.tokensByType[videoType]) continue

    stats.tokensByType[videoType].input += usage.promptTokens ?? 0
    stats.tokensByType[videoType].output += usage.completionTokens ?? 0
    if (data.videoId) stats.videosByType[videoType].add(data.videoId)
  }

  return stats
}

/**
 * Estima custo mensal extrapolando do histórico real. Se um videoType não tem
 * histórico, cai pro default daquele tipo.
 */
export function estimateMonthlyCostFromUsage(
  provider: LLMProviderId,
  model: string,
  stats: UsageStats
): CostEstimate {
  const pricing = PRICING_USD_PER_M[model]
  if (!pricing) {
    return estimateMonthlyCostFromDefaults(provider, model)
  }

  const monthRatio = 30 / stats.daysCovered
  const breakdown: CostBreakdown = { episode: 0, cut: 0, reel: 0 }
  const sampleSize: Record<'episode' | 'cut' | 'reel', number> = { episode: 0, cut: 0, reel: 0 }

  for (const type of ['episode', 'cut', 'reel'] as const) {
    const videoCount = stats.videosByType[type].size
    sampleSize[type] = videoCount

    if (videoCount === 0) {
      // Fallback pro default deste tipo
      breakdown[type] =
        costForVideoTokens(DEFAULT_TOKENS_PER_VIDEO[type], pricing) * DEFAULT_MONTHLY_VOLUME[type]
      continue
    }

    const periodCost = costForVideoTokens(stats.tokensByType[type], pricing)
    breakdown[type] = periodCost * monthRatio
  }

  const monthlyUsd = breakdown.episode + breakdown.cut + breakdown.reel

  return {
    monthlyUsd,
    threshold: classifyThreshold(monthlyUsd),
    breakdown,
    source: 'actual',
    sampleSize,
  }
}

/**
 * Estima custo mensal preferindo histórico real quando disponível.
 */
export async function estimateMonthlyCost(
  provider: LLMProviderId,
  model: string,
  podcastId: string
): Promise<CostEstimate> {
  try {
    const stats = await readActualUsage(podcastId, 30)
    if (stats) {
      return estimateMonthlyCostFromUsage(provider, model, stats)
    }
  } catch (error) {
    log('WARN', 'Cost estimator: falhou ao ler histórico, usando defaults', {
      podcastId,
      error: error instanceof Error ? error.message : 'unknown',
    })
  }
  return estimateMonthlyCostFromDefaults(provider, model)
}
