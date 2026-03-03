import { describe, it, expect } from 'vitest'

import {
  AVAILABLE_TEXT_MODELS,
  AVAILABLE_IMAGE_MODELS,
  TEXT_MODEL_IDS,
  IMAGE_MODEL_IDS,
  DEFAULT_TEXT_MODEL,
  DEFAULT_IMAGE_MODEL,
} from './models'

describe('LLM Models constants', () => {
  it('defines available text models with required fields', () => {
    expect(AVAILABLE_TEXT_MODELS.length).toBeGreaterThanOrEqual(5)
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
    expect(ids).toContain('gemini-2.0-flash')
    expect(ids).toContain('gemini-2.0-flash-lite')
    expect(ids).toContain('gemini-2.5-flash')
    expect(ids).toContain('gemini-2.5-flash-lite')
    expect(ids).toContain('gemini-2.5-pro')
  })

  it('defines available image models with required fields', () => {
    expect(AVAILABLE_IMAGE_MODELS.length).toBeGreaterThanOrEqual(1)
    for (const model of AVAILABLE_IMAGE_MODELS) {
      expect(model).toHaveProperty('id')
      expect(model).toHaveProperty('label')
      expect(model).toHaveProperty('description')
    }
  })

  it('includes expected image model IDs', () => {
    const ids = AVAILABLE_IMAGE_MODELS.map(m => m.id)
    expect(ids).toContain('gemini-2.5-flash-image')
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
