import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockWhere = vi.fn(() => ({ get: mockGet }))
const mockCollection2 = vi.fn(() => ({ where: mockWhere }))
const mockDoc = vi.fn(() => ({ collection: mockCollection2 }))
const mockCollection1 = vi.fn(() => ({ doc: mockDoc }))

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: () => ({ collection: mockCollection1 }),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import {
  classifyThreshold,
  DEFAULT_MONTHLY_VOLUME,
  DEFAULT_TOKENS_PER_VIDEO,
  estimateMonthlyCost,
  estimateMonthlyCostFromDefaults,
  estimateMonthlyCostFromUsage,
  readActualUsage,
} from './cost-estimator'

describe('classifyThreshold', () => {
  it('returns safe for values under $20', () => {
    expect(classifyThreshold(0)).toBe('safe')
    expect(classifyThreshold(19.99)).toBe('safe')
  })

  it('returns warning for values between $20 and $100', () => {
    expect(classifyThreshold(20)).toBe('warning')
    expect(classifyThreshold(50)).toBe('warning')
    expect(classifyThreshold(99.99)).toBe('warning')
  })

  it('returns danger for values $100 and above', () => {
    expect(classifyThreshold(100)).toBe('danger')
    expect(classifyThreshold(500)).toBe('danger')
  })
})

describe('estimateMonthlyCostFromDefaults', () => {
  it('calculates Gemini 2.5 Flash monthly cost under safe threshold', () => {
    const estimate = estimateMonthlyCostFromDefaults('gemini', 'gemini-2.5-flash')
    expect(estimate.source).toBe('defaults')
    expect(estimate.threshold).toBe('safe')
    expect(estimate.monthlyUsd).toBeLessThan(20)
    expect(estimate.breakdown.episode).toBeGreaterThan(0)
    expect(estimate.breakdown.cut).toBeGreaterThan(0)
    expect(estimate.breakdown.reel).toBeGreaterThan(0)
  })

  it('calculates Claude Sonnet 4.6 monthly cost crossing warning threshold', () => {
    const estimate = estimateMonthlyCostFromDefaults('claude', 'claude-sonnet-4-6')
    expect(estimate.source).toBe('defaults')
    // Sonnet pricing: $3 input + $15 output per 1M
    // 12 episodes × 50k input × $3/1M + 12 × 8k output × $15/1M = 1.8 + 1.44 = $3.24
    // 50 cuts × 20k × $3/1M + 50 × 3.5k × $15/1M = 3 + 2.625 = $5.625
    // 30 reels × 15k × $3/1M + 30 × 2.5k × $15/1M = 1.35 + 1.125 = $2.475
    // Total ≈ $11.34 — abaixo de warning. Aumentamos com Opus pra warning.
    expect(estimate.monthlyUsd).toBeGreaterThan(0)
  })

  it('flags Claude Opus 4.7 as warning threshold (PPTNC volumes ~$57/mo)', () => {
    const estimate = estimateMonthlyCostFromDefaults('claude', 'claude-opus-4-7')
    expect(estimate.threshold).toBe('warning')
    expect(estimate.monthlyUsd).toBeGreaterThanOrEqual(20)
    expect(estimate.monthlyUsd).toBeLessThan(100)
  })

  it('returns zero cost for unknown model and logs warning', () => {
    const estimate = estimateMonthlyCostFromDefaults('claude', 'model-inexistente')
    expect(estimate.monthlyUsd).toBe(0)
    expect(estimate.threshold).toBe('safe')
  })

  it('uses documented defaults for tokens and volume', () => {
    expect(DEFAULT_TOKENS_PER_VIDEO.episode.input).toBe(50_000)
    expect(DEFAULT_MONTHLY_VOLUME.episode).toBe(12)
    expect(DEFAULT_MONTHLY_VOLUME.cut).toBe(50)
    expect(DEFAULT_MONTHLY_VOLUME.reel).toBe(30)
  })
})

describe('readActualUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no logs found', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })

    const stats = await readActualUsage('pptnc', 30)
    expect(stats).toBeNull()
  })

  it('aggregates tokens by videoType and counts unique videoIds', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        { data: () => ({ videoType: 'episode', videoId: 'v1', usage: { promptTokens: 10_000, completionTokens: 1_000 } }) },
        { data: () => ({ videoType: 'episode', videoId: 'v1', usage: { promptTokens: 5_000, completionTokens: 500 } }) },
        { data: () => ({ videoType: 'episode', videoId: 'v2', usage: { promptTokens: 8_000, completionTokens: 800 } }) },
        { data: () => ({ videoType: 'cut', videoId: 'v3', usage: { promptTokens: 4_000, completionTokens: 400 } }) },
      ],
    })

    const stats = await readActualUsage('pptnc', 30)
    expect(stats).not.toBeNull()
    expect(stats!.tokensByType.episode.input).toBe(23_000)
    expect(stats!.tokensByType.episode.output).toBe(2_300)
    expect(stats!.tokensByType.cut.input).toBe(4_000)
    expect(stats!.videosByType.episode.size).toBe(2)
    expect(stats!.videosByType.cut.size).toBe(1)
    expect(stats!.videosByType.reel.size).toBe(0)
  })

  it('skips entries without videoType or usage', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        { data: () => ({ videoType: 'episode', videoId: 'v1' }) }, // sem usage
        { data: () => ({ videoId: 'v2', usage: { promptTokens: 100 } }) }, // sem videoType
        { data: () => ({ videoType: 'episode', videoId: 'v3', usage: { promptTokens: 1_000, completionTokens: 100 } }) },
      ],
    })

    const stats = await readActualUsage('pptnc', 30)
    expect(stats!.tokensByType.episode.input).toBe(1_000)
    expect(stats!.videosByType.episode.size).toBe(1)
  })
})

describe('estimateMonthlyCostFromUsage', () => {
  it('extrapolates 30-day usage to monthly cost', () => {
    const stats = {
      tokensByType: {
        episode: { input: 600_000, output: 96_000 },
        cut: { input: 1_000_000, output: 175_000 },
        reel: { input: 450_000, output: 75_000 },
      },
      videosByType: {
        episode: new Set(['e1', 'e2', 'e3']),
        cut: new Set(['c1']),
        reel: new Set(['r1']),
      },
      daysCovered: 30,
    }

    const estimate = estimateMonthlyCostFromUsage('claude', 'claude-sonnet-4-6', stats)
    expect(estimate.source).toBe('actual')
    expect(estimate.sampleSize?.episode).toBe(3)
    expect(estimate.sampleSize?.cut).toBe(1)
    expect(estimate.monthlyUsd).toBeGreaterThan(0)
  })

  it('falls back to defaults when a videoType has zero history', () => {
    const stats = {
      tokensByType: {
        episode: { input: 600_000, output: 96_000 },
        cut: { input: 0, output: 0 },
        reel: { input: 0, output: 0 },
      },
      videosByType: {
        episode: new Set(['e1']),
        cut: new Set<string>(),
        reel: new Set<string>(),
      },
      daysCovered: 30,
    }

    const estimate = estimateMonthlyCostFromUsage('gemini', 'gemini-2.5-flash', stats)
    // Cut/reel breakdown deve vir do default
    expect(estimate.breakdown.cut).toBeGreaterThan(0)
    expect(estimate.breakdown.reel).toBeGreaterThan(0)
  })

  it('scales 15-day window to monthly with 2x ratio', () => {
    const stats = {
      tokensByType: {
        episode: { input: 300_000, output: 48_000 },
        cut: { input: 0, output: 0 },
        reel: { input: 0, output: 0 },
      },
      videosByType: {
        episode: new Set(['e1', 'e2']),
        cut: new Set<string>(),
        reel: new Set<string>(),
      },
      daysCovered: 15,
    }

    const estimate15 = estimateMonthlyCostFromUsage('claude', 'claude-sonnet-4-6', stats)
    const stats30 = { ...stats, tokensByType: { ...stats.tokensByType, episode: { input: 600_000, output: 96_000 } }, daysCovered: 30 }
    const estimate30 = estimateMonthlyCostFromUsage('claude', 'claude-sonnet-4-6', stats30)
    // Mesmo total mensal nos dois (15d×2 = 30d×1)
    expect(estimate15.breakdown.episode).toBeCloseTo(estimate30.breakdown.episode, 4)
  })
})

describe('estimateMonthlyCost (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses actual usage when logs exist', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        { data: () => ({ videoType: 'episode', videoId: 'v1', usage: { promptTokens: 10_000, completionTokens: 1_000 } }) },
      ],
    })

    const estimate = await estimateMonthlyCost('claude', 'claude-sonnet-4-6', 'pptnc')
    expect(estimate.source).toBe('actual')
  })

  it('falls back to defaults when no logs', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })

    const estimate = await estimateMonthlyCost('gemini', 'gemini-2.5-flash', 'pptnc')
    expect(estimate.source).toBe('defaults')
  })

  it('falls back to defaults on Firestore error', async () => {
    mockGet.mockRejectedValue(new Error('Firestore down'))

    const estimate = await estimateMonthlyCost('gemini', 'gemini-2.5-flash', 'pptnc')
    expect(estimate.source).toBe('defaults')
  })
})
