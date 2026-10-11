import { describe, expect, it } from 'vitest'

import { ALL_TEXT_MODEL_IDS } from './models'
import { calculateCallCostUsd, getModelPricing } from './pricing'

describe('pricing', () => {
  // Modelo sem preço custa "zero" em silêncio — foi o que aconteceu com os
  // Gemini 3.1/3.5/3.6 na tabela do provider até out/2026.
  it('todo modelo de texto do catálogo tem preço', () => {
    for (const id of ALL_TEXT_MODEL_IDS) {
      expect(getModelPricing(id), id).toBeDefined()
    }
  })

  it('calcula o custo de uma chamada pelo preço por 1M tokens', () => {
    // Sonnet 5: $2/$10 → 3.531 in + 744 out (chamada real de descrição).
    expect(calculateCallCostUsd('claude-sonnet-5', { promptTokens: 3531, completionTokens: 744 }))
      .toBeCloseTo(0.014502, 6)
    // Gemini 2.5 Flash: $0,30/$2,50 (a tabela antiga do provider dava $0,075/$0,30).
    expect(calculateCallCostUsd('gemini-2.5-flash', { promptTokens: 1_000_000, completionTokens: 1_000_000 }))
      .toBeCloseTo(2.8, 6)
  })

  it('Haiku 5.5 muda de faixa acima de 100 mil tokens de prompt', () => {
    expect(calculateCallCostUsd('claude-haiku-5-5', { promptTokens: 100_000, completionTokens: 10_000 }))
      .toBeCloseTo(0.015, 6)
    expect(calculateCallCostUsd('claude-haiku-5-5', { promptTokens: 100_001, completionTokens: 10_000 }))
      .toBeCloseTo(0.0750005, 6)
  })

  it('ID legado é cobrado como o sucessor; modelo desconhecido custa 0', () => {
    expect(getModelPricing('gemini-2.0-flash')).toEqual(getModelPricing('gemini-2.5-flash-lite'))
    expect(calculateCallCostUsd('modelo-inexistente', { promptTokens: 1000, completionTokens: 1000 })).toBe(0)
  })
})
