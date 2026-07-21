import { describe, it, expect } from 'vitest'

import {
  AVAILABLE_TEXT_MODELS,
  AVAILABLE_IMAGE_MODELS,
  TEXT_MODEL_IDS,
  IMAGE_MODEL_IDS,
  DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_THUMBNAIL_IMAGE_MODEL,
  LEGACY_IMAGE_MODEL_ALIASES,
  resolveImageModelId,
} from './models'

describe('LLM Models constants', () => {
  it('defines available text models with required fields', () => {
    expect(AVAILABLE_TEXT_MODELS.length).toBeGreaterThanOrEqual(8)
    for (const model of AVAILABLE_TEXT_MODELS) {
      expect(model).toHaveProperty('id')
      expect(model).toHaveProperty('label')
      expect(model).toHaveProperty('description')
      expect(model.id).toBeTruthy()
      expect(model.label).toBeTruthy()
      expect(model.description).toBeTruthy()
    }
  })

  it('includes expected text model IDs', () => {
    const ids = AVAILABLE_TEXT_MODELS.map(m => m.id)
    // GA models (used in production)
    expect(ids).toContain('gemini-2.0-flash')
    expect(ids).toContain('gemini-2.0-flash-lite')
    expect(ids).toContain('gemini-2.5-flash')
    expect(ids).toContain('gemini-2.5-flash-lite')
    expect(ids).toContain('gemini-2.5-pro')
    // Preview Gemini 3.x family (opt-in via Settings — sem SLA)
    expect(ids).toContain('gemini-3.1-pro-preview')
    expect(ids).toContain('gemini-3-flash-preview')
    expect(ids).toContain('gemini-3.1-flash-lite-preview')
  })

  it('preview text models have "Preview" in label and "Sem SLA" warning', () => {
    const previewModels = AVAILABLE_TEXT_MODELS.filter(m =>
      m.id.includes('preview') || m.id.startsWith('gemini-3')
    )
    expect(previewModels.length).toBeGreaterThanOrEqual(3)
    for (const model of previewModels) {
      expect(model.label).toMatch(/Preview/i)
      expect(model.description).toMatch(/Sem SLA/i)
    }
  })

  it('defines available image models with required fields', () => {
    expect(AVAILABLE_IMAGE_MODELS.length).toBeGreaterThanOrEqual(3)
    for (const model of AVAILABLE_IMAGE_MODELS) {
      expect(model).toHaveProperty('id')
      expect(model).toHaveProperty('label')
      expect(model).toHaveProperty('description')
    }
  })

  it('includes expected image model IDs', () => {
    const ids = AVAILABLE_IMAGE_MODELS.map(m => m.id)
    // Todos GA desde 2026-07 — o Google removeu os aliases `-preview` ao promover
    // a família 3.x, derrubando thumbnail/newsletter/notícias com 404 (2026-07-21).
    expect(ids).toContain('gemini-2.5-flash-image')
    expect(ids).toContain('gemini-3.1-flash-image')
    expect(ids).toContain('gemini-3-pro-image')
  })

  it('no longer offers the retired `-preview` image models', () => {
    const ids = AVAILABLE_IMAGE_MODELS.map(m => m.id)
    expect(ids).not.toContain('gemini-3.1-flash-image-preview')
    expect(ids).not.toContain('gemini-3-pro-image-preview')
  })

  describe('LEGACY_IMAGE_MODEL_ALIASES / resolveImageModelId', () => {
    it('maps every retired preview ID to a model that is still offered', () => {
      const ids = AVAILABLE_IMAGE_MODELS.map(m => m.id)
      for (const [legacy, target] of Object.entries(LEGACY_IMAGE_MODEL_ALIASES)) {
        expect(legacy).toMatch(/-preview$/)
        expect(ids).toContain(target)
      }
    })

    it('resolves the retired thumbnail model to its GA successor', () => {
      expect(resolveImageModelId('gemini-3.1-flash-image-preview')).toBe('gemini-3.1-flash-image')
      expect(resolveImageModelId('gemini-3-pro-image-preview')).toBe('gemini-3-pro-image')
    })

    it('passes through IDs that have no alias', () => {
      expect(resolveImageModelId('gemini-2.5-flash-image')).toBe('gemini-2.5-flash-image')
      expect(resolveImageModelId('gemini-3.1-flash-image')).toBe('gemini-3.1-flash-image')
      expect(resolveImageModelId('modelo-desconhecido')).toBe('modelo-desconhecido')
    })

    it('passes undefined through untouched', () => {
      expect(resolveImageModelId(undefined)).toBeUndefined()
    })
  })

  it('DEFAULT_THUMBNAIL_IMAGE_MODEL points at a live model', () => {
    const ids = AVAILABLE_IMAGE_MODELS.map(m => m.id)
    expect(ids).toContain(DEFAULT_THUMBNAIL_IMAGE_MODEL)
    expect(DEFAULT_THUMBNAIL_IMAGE_MODEL).not.toMatch(/-preview$/)
  })

  it('TEXT_MODEL_IDS matches AVAILABLE_TEXT_MODELS ids', () => {
    const expected = AVAILABLE_TEXT_MODELS.map(m => m.id)
    expect(TEXT_MODEL_IDS).toEqual(expected)
  })

  it('IMAGE_MODEL_IDS matches AVAILABLE_IMAGE_MODELS ids', () => {
    const expected = AVAILABLE_IMAGE_MODELS.map(m => m.id)
    expect(IMAGE_MODEL_IDS).toEqual(expected)
  })

  it('DEFAULT_TEXT_MODEL is gemini-2.5-flash', () => {
    expect(DEFAULT_TEXT_MODEL).toBe('gemini-2.5-flash')
  })

  it('DEFAULT_IMAGE_MODEL is gemini-2.5-flash-image', () => {
    expect(DEFAULT_IMAGE_MODEL).toBe('gemini-2.5-flash-image')
  })

  it('defaults are included in their respective model lists', () => {
    expect(TEXT_MODEL_IDS).toContain(DEFAULT_TEXT_MODEL)
    expect(IMAGE_MODEL_IDS).toContain(DEFAULT_IMAGE_MODEL)
  })
})
