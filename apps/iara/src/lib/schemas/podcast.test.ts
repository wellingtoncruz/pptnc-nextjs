import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'

import {
  PodcastSchema,
  PodcastCreateSchema,
  PodcastUpdateSchema,
  PromptsSchema,
  PromptFieldSchema,
  ThumbnailPromptFieldSchema,
  ExtraImagesPromptsSchema,
  EXTRA_IMAGE_KINDS,
  EXTRA_IMAGE_LABELS,
  EpisodePromptsSchema,
  CutPromptsSchema,
  ReelPromptsSchema,
  PersonaSchema,
  PersonasSchema,
  VideoTypesConfigSchema,
  DEFAULT_VIDEO_TYPES,
  DEFAULT_PROMPTS,
  DEFAULT_PERSONAS,
  VideoTypeEnum,
  MAX_PROMPT_LENGTH,
} from './podcast'
import { VideoTypeConfigSchema } from './video-type-config'

// Mock Firestore Timestamp
const mockTimestamp = {
  toDate: () => new Date(),
  seconds: 1234567890,
  nanoseconds: 0,
}

// Valid PromptField for tests
const validPromptField = {
  description: 'Generate metadata for this content',
  expectedOutput: 'A JSON object with title, description, and tags',
}

// Valid prompts structure for tests
const validPrompts = {
  episode: {
    critique: { ...validPromptField },
    editing: { ...validPromptField },
    compliance: { ...validPromptField },
    chapters: { ...validPromptField },
    titles: { ...validPromptField },
    description: { ...validPromptField },
    tags: { ...validPromptField },
  },
  cut: {
    titles: { ...validPromptField },
    thumbs: { ...validPromptField },
    description: { ...validPromptField },
    tags: { ...validPromptField },
  },
  reel: {
    titles: { ...validPromptField },
    description: { ...validPromptField },
    tags: { ...validPromptField },
  },
}

// Valid persona for tests
const validPersona = {
  role: 'Critico de conteudo digital',
  objective: 'Analisar conteudo e fornecer feedback construtivo',
  resume: 'Especialista em analise de conteudo com 10 anos de experiencia',
}

// Valid personas structure for tests
const validPersonas = {
  critic: { ...validPersona },
  writer: {
    role: 'Redator de conteudo',
    objective: 'Criar textos envolventes',
    resume: 'Redator com experiencia em marketing digital',
  },
}

const validPodcast = {
  id: 'pptnc',
  name: 'PPT Nao Compila',
  channelId: 'UC123456',
  ownerId: 'user123',
  prompts: validPrompts,
  personas: validPersonas,
  videoTypes: DEFAULT_VIDEO_TYPES,
  createdAt: mockTimestamp,
  updatedAt: mockTimestamp,
}

describe('VideoTypeConfigSchema', () => {
  it('validates valid config with null maxDuration', () => {
    const config = { minDuration: 1200, maxDuration: null }
    expect(VideoTypeConfigSchema.parse(config)).toEqual(config)
  })

  it('validates valid config with numeric maxDuration', () => {
    const config = { minDuration: 180, maxDuration: 1199 }
    expect(VideoTypeConfigSchema.parse(config)).toEqual(config)
  })

  it('rejects negative minDuration', () => {
    const config = { minDuration: -1, maxDuration: null }
    expect(() => VideoTypeConfigSchema.parse(config)).toThrow(ZodError)
  })

  it('rejects non-integer minDuration', () => {
    const config = { minDuration: 180.5, maxDuration: null }
    expect(() => VideoTypeConfigSchema.parse(config)).toThrow(ZodError)
  })

  it('rejects zero maxDuration', () => {
    const config = { minDuration: 0, maxDuration: 0 }
    expect(() => VideoTypeConfigSchema.parse(config)).toThrow(ZodError)
  })

  it('rejects missing fields', () => {
    expect(() => VideoTypeConfigSchema.parse({})).toThrow(ZodError)
    expect(() => VideoTypeConfigSchema.parse({ minDuration: 0 })).toThrow(ZodError)
  })
})

describe('PromptFieldSchema', () => {
  it('validates valid prompt field', () => {
    const result = PromptFieldSchema.parse(validPromptField)
    expect(result.description).toBe(validPromptField.description)
    expect(result.expectedOutput).toBe(validPromptField.expectedOutput)
  })

  it('validates empty strings', () => {
    const empty = { description: '', expectedOutput: '' }
    expect(PromptFieldSchema.parse(empty)).toEqual(empty)
  })

  it('validates field at max length', () => {
    const maxLength = {
      description: 'a'.repeat(MAX_PROMPT_LENGTH),
      expectedOutput: 'b'.repeat(MAX_PROMPT_LENGTH),
    }
    expect(PromptFieldSchema.parse(maxLength)).toEqual(maxLength)
  })

  it('rejects description exceeding max length', () => {
    const tooLong = {
      description: 'a'.repeat(MAX_PROMPT_LENGTH + 1),
      expectedOutput: 'valid',
    }
    expect(() => PromptFieldSchema.parse(tooLong)).toThrow(ZodError)
  })

  it('rejects expectedOutput exceeding max length', () => {
    const tooLong = {
      description: 'valid',
      expectedOutput: 'a'.repeat(MAX_PROMPT_LENGTH + 1),
    }
    expect(() => PromptFieldSchema.parse(tooLong)).toThrow(ZodError)
  })

  it('provides correct error message for too long description', () => {
    const tooLong = {
      description: 'a'.repeat(MAX_PROMPT_LENGTH + 1),
      expectedOutput: 'valid',
    }
    try {
      PromptFieldSchema.parse(tooLong)
    } catch (error) {
      if (error instanceof ZodError) {
        expect(error.issues[0]?.message).toContain('10000')
      }
    }
  })

  it('rejects missing fields', () => {
    expect(() => PromptFieldSchema.parse({ description: 'test' })).toThrow(ZodError)
    expect(() => PromptFieldSchema.parse({ expectedOutput: 'test' })).toThrow(ZodError)
  })
})

describe('EpisodePromptsSchema', () => {
  it('validates valid episode prompts', () => {
    const result = EpisodePromptsSchema.parse(validPrompts.episode)
    expect(result.critique).toEqual(validPromptField)
    expect(result.editing).toEqual(validPromptField)
    expect(result.compliance).toEqual(validPromptField)
    expect(result.chapters).toEqual(validPromptField)
    expect(result.titles).toEqual(validPromptField)
    expect(result.description).toEqual(validPromptField)
    expect(result.tags).toEqual(validPromptField)
  })

  it('rejects missing fields', () => {
    const incomplete = { critique: validPromptField }
    expect(() => EpisodePromptsSchema.parse(incomplete)).toThrow(ZodError)
  })

  it('accepts optional social prompts record', () => {
    const withSocial = {
      ...validPrompts.episode,
      social: { instagram: validPromptField, linkedin: validPromptField },
    }
    const result = EpisodePromptsSchema.parse(withSocial)
    expect(result.social?.instagram).toEqual(validPromptField)
    expect(result.social?.linkedin).toEqual(validPromptField)
  })

  it('works without social field (backward compat)', () => {
    const result = EpisodePromptsSchema.parse(validPrompts.episode)
    expect(result.social).toBeUndefined()
  })

  it('accepts optional adwords prompt', () => {
    const withAdwords = {
      ...validPrompts.episode,
      adwords: validPromptField,
    }
    const result = EpisodePromptsSchema.parse(withAdwords)
    expect(result.adwords).toEqual(validPromptField)
  })

  it('works without adwords field (backward compat)', () => {
    const result = EpisodePromptsSchema.parse(validPrompts.episode)
    expect(result.adwords).toBeUndefined()
  })
})

describe('CutPromptsSchema', () => {
  it('validates valid cut prompts', () => {
    const result = CutPromptsSchema.parse(validPrompts.cut)
    expect(result.titles).toEqual(validPromptField)
    expect(result.thumbs).toEqual(validPromptField)
    expect(result.description).toEqual(validPromptField)
    expect(result.tags).toEqual(validPromptField)
  })

  it('rejects missing fields', () => {
    const incomplete = { titles: validPromptField }
    expect(() => CutPromptsSchema.parse(incomplete)).toThrow(ZodError)
  })

  it('accepts optional social prompts record', () => {
    const withSocial = {
      ...validPrompts.cut,
      social: { instagram: validPromptField },
    }
    const result = CutPromptsSchema.parse(withSocial)
    expect(result.social?.instagram).toEqual(validPromptField)
  })

  it('works without social field (backward compat)', () => {
    const result = CutPromptsSchema.parse(validPrompts.cut)
    expect(result.social).toBeUndefined()
  })

  it('strips adwords field (not supported for cuts)', () => {
    const withAdwords = { ...validPrompts.cut, adwords: validPromptField }
    const result = CutPromptsSchema.parse(withAdwords)
    expect(result).not.toHaveProperty('adwords')
  })
})

describe('ReelPromptsSchema', () => {
  it('validates valid reel prompts', () => {
    const result = ReelPromptsSchema.parse(validPrompts.reel)
    expect(result.titles).toEqual(validPromptField)
    expect(result.description).toEqual(validPromptField)
    expect(result.tags).toEqual(validPromptField)
  })

  it('rejects missing fields', () => {
    const incomplete = { titles: validPromptField }
    expect(() => ReelPromptsSchema.parse(incomplete)).toThrow(ZodError)
  })

  it('accepts optional social prompts record', () => {
    const withSocial = {
      ...validPrompts.reel,
      social: { linkedin: validPromptField },
    }
    const result = ReelPromptsSchema.parse(withSocial)
    expect(result.social?.linkedin).toEqual(validPromptField)
  })

  it('works without social field (backward compat)', () => {
    const result = ReelPromptsSchema.parse(validPrompts.reel)
    expect(result.social).toBeUndefined()
  })

  it('strips adwords field (not supported for reels)', () => {
    const withAdwords = { ...validPrompts.reel, adwords: validPromptField }
    const result = ReelPromptsSchema.parse(withAdwords)
    expect(result).not.toHaveProperty('adwords')
  })
})

describe('PromptsSchema', () => {
  it('validates valid prompts structure', () => {
    const result = PromptsSchema.parse(validPrompts)
    expect(result.episode).toBeDefined()
    expect(result.cut).toBeDefined()
    expect(result.reel).toBeDefined()
  })

  it('rejects missing video type', () => {
    const incomplete = { episode: validPrompts.episode }
    expect(() => PromptsSchema.parse(incomplete)).toThrow(ZodError)
  })

  it('rejects invalid prompt field in episode', () => {
    const invalid = {
      ...validPrompts,
      episode: { ...validPrompts.episode, critique: 'not-an-object' },
    }
    expect(() => PromptsSchema.parse(invalid)).toThrow(ZodError)
  })
})

describe('PersonaSchema', () => {
  it('validates valid persona', () => {
    const result = PersonaSchema.parse(validPersona)
    expect(result.role).toBe(validPersona.role)
    expect(result.objective).toBe(validPersona.objective)
    expect(result.resume).toBe(validPersona.resume)
  })

  it('validates empty strings', () => {
    const empty = { role: '', objective: '', resume: '' }
    expect(PersonaSchema.parse(empty)).toEqual(empty)
  })

  it('rejects role exceeding max length', () => {
    const tooLong = { ...validPersona, role: 'a'.repeat(1001) }
    expect(() => PersonaSchema.parse(tooLong)).toThrow(ZodError)
  })

  it('rejects objective exceeding max length', () => {
    const tooLong = { ...validPersona, objective: 'a'.repeat(2001) }
    expect(() => PersonaSchema.parse(tooLong)).toThrow(ZodError)
  })

  it('rejects resume exceeding max length', () => {
    const tooLong = { ...validPersona, resume: 'a'.repeat(5001) }
    expect(() => PersonaSchema.parse(tooLong)).toThrow(ZodError)
  })

  it('rejects missing fields', () => {
    expect(() => PersonaSchema.parse({ role: 'test' })).toThrow(ZodError)
  })
})

describe('PersonasSchema', () => {
  it('validates valid personas', () => {
    const result = PersonasSchema.parse(validPersonas)
    expect(result.critic).toBeDefined()
    expect(result.writer).toBeDefined()
  })

  it('rejects missing critic', () => {
    const incomplete = { writer: validPersona }
    expect(() => PersonasSchema.parse(incomplete)).toThrow(ZodError)
  })

  it('rejects missing writer', () => {
    const incomplete = { critic: validPersona }
    expect(() => PersonasSchema.parse(incomplete)).toThrow(ZodError)
  })

  it('accepts personas without socialmedia (backward-compat)', () => {
    const withoutSocialmedia = { critic: validPersona, writer: validPersona }
    const result = PersonasSchema.parse(withoutSocialmedia)
    expect(result.critic).toBeDefined()
    expect(result.writer).toBeDefined()
    expect(result.socialmedia).toBeUndefined()
  })

  it('accepts personas with socialmedia', () => {
    const withSocialmedia = { critic: validPersona, writer: validPersona, socialmedia: validPersona }
    const result = PersonasSchema.parse(withSocialmedia)
    expect(result.socialmedia).toBeDefined()
    expect(result.socialmedia?.role).toBe(validPersona.role)
  })

  it('accepts personas without adwords (backward-compat)', () => {
    const withoutAdwords = { critic: validPersona, writer: validPersona }
    const result = PersonasSchema.parse(withoutAdwords)
    expect(result.adwords).toBeUndefined()
  })

  it('accepts personas with adwords', () => {
    const withAdwords = { critic: validPersona, writer: validPersona, adwords: validPersona }
    const result = PersonasSchema.parse(withAdwords)
    expect(result.adwords).toBeDefined()
    expect(result.adwords?.role).toBe(validPersona.role)
  })
})

describe('VideoTypeEnum', () => {
  it('validates episode type', () => {
    expect(VideoTypeEnum.parse('episode')).toBe('episode')
  })

  it('validates cut type', () => {
    expect(VideoTypeEnum.parse('cut')).toBe('cut')
  })

  it('validates reel type', () => {
    expect(VideoTypeEnum.parse('reel')).toBe('reel')
  })

  it('rejects invalid type', () => {
    expect(() => VideoTypeEnum.parse('invalid')).toThrow(ZodError)
  })
})

describe('VideoTypesConfigSchema', () => {
  it('validates valid video types config', () => {
    expect(VideoTypesConfigSchema.parse(DEFAULT_VIDEO_TYPES)).toEqual(DEFAULT_VIDEO_TYPES)
  })

  it('rejects missing video type', () => {
    const incomplete = {
      episode: { minDuration: 1200, maxDuration: null },
      cut: { minDuration: 180, maxDuration: 1199 },
    }
    expect(() => VideoTypesConfigSchema.parse(incomplete)).toThrow(ZodError)
  })
})

describe('PodcastSchema', () => {
  it('validates valid podcast data', () => {
    const result = PodcastSchema.parse(validPodcast)
    expect(result.id).toBe('pptnc')
    expect(result.name).toBe('PPT Nao Compila')
    expect(result.channelId).toBe('UC123456')
    expect(result.ownerId).toBe('user123')
    expect(result.prompts).toBeDefined()
    expect(result.personas).toBeDefined()
  })

  it('rejects empty id', () => {
    const invalid = { ...validPodcast, id: '' }
    expect(() => PodcastSchema.parse(invalid)).toThrow(ZodError)
  })

  it('rejects empty name', () => {
    const invalid = { ...validPodcast, name: '' }
    expect(() => PodcastSchema.parse(invalid)).toThrow(ZodError)
  })

  it('rejects missing required fields', () => {
    expect(() => PodcastSchema.parse({})).toThrow(ZodError)
    expect(() => PodcastSchema.parse({ id: 'test' })).toThrow(ZodError)
  })

  it('rejects invalid timestamp', () => {
    const invalid = { ...validPodcast, createdAt: 'not-a-timestamp' }
    expect(() => PodcastSchema.parse(invalid)).toThrow(ZodError)
  })

  it('rejects null timestamp', () => {
    const invalid = { ...validPodcast, createdAt: null }
    expect(() => PodcastSchema.parse(invalid)).toThrow(ZodError)
  })

  it('rejects invalid prompts structure', () => {
    const invalid = { ...validPodcast, prompts: { episode: 'test' } }
    expect(() => PodcastSchema.parse(invalid)).toThrow(ZodError)
  })

  it('rejects invalid videoTypes structure', () => {
    const invalid = { ...validPodcast, videoTypes: { episode: {} } }
    expect(() => PodcastSchema.parse(invalid)).toThrow(ZodError)
  })

  it('rejects missing personas', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { personas: _removed, ...withoutPersonas } = validPodcast
    expect(() => PodcastSchema.parse(withoutPersonas)).toThrow(ZodError)
  })

  it('validates podcast with adwords persona', () => {
    const withAdwords = {
      ...validPodcast,
      personas: { ...validPersonas, adwords: validPersona },
    }
    const result = PodcastSchema.parse(withAdwords)
    expect(result.personas.adwords).toBeDefined()
    expect(result.personas.adwords?.role).toBe(validPersona.role)
  })

  it('validates podcast without adwords persona (backward-compat)', () => {
    const result = PodcastSchema.parse(validPodcast)
    expect(result.personas.adwords).toBeUndefined()
  })
})

describe('PodcastSchema features defaults', () => {
  it('defaults socialMedia to false when not provided', () => {
    const withFeatures = { ...validPodcast, features: { editorial: true, news: true, includeLivestreams: false } }
    const result = PodcastSchema.parse(withFeatures)
    expect(result.features?.socialMedia).toBe(false)
  })

  it('defaults all features when features object is omitted', () => {
    // features is .optional() — when omitted, result.features is undefined
    const result = PodcastSchema.parse(validPodcast)
    expect(result.features).toBeUndefined()
  })

  it('preserves socialMedia true when explicitly set', () => {
    const withSocial = { ...validPodcast, features: { editorial: true, news: true, includeLivestreams: false, socialMedia: true } }
    const result = PodcastSchema.parse(withSocial)
    expect(result.features?.socialMedia).toBe(true)
  })

  it('defaults adwords to false when not provided', () => {
    const withFeatures = { ...validPodcast, features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false } }
    const result = PodcastSchema.parse(withFeatures)
    expect(result.features?.adwords).toBe(false)
  })

  it('preserves adwords true when explicitly set', () => {
    const withAdwords = { ...validPodcast, features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: true } }
    const result = PodcastSchema.parse(withAdwords)
    expect(result.features?.adwords).toBe(true)
  })

  it('defaults llmDebugMode to false when not provided', () => {
    const withFeatures = { ...validPodcast, features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false } }
    const result = PodcastSchema.parse(withFeatures)
    expect(result.features?.llmDebugMode).toBe(false)
  })

  it('preserves llmDebugMode true when explicitly set', () => {
    const withDebug = { ...validPodcast, features: { editorial: true, news: true, includeLivestreams: false, socialMedia: false, adwords: false, llmDebugMode: true } }
    const result = PodcastSchema.parse(withDebug)
    expect(result.features?.llmDebugMode).toBe(true)
  })

  // ===========================================================================
  // Epic 22 / Story 22.2-bis — thumbnailGeneration feature flag
  // ===========================================================================

  it('defaults thumbnailGeneration to false when not provided (Epic 22)', () => {
    const withFeatures = { ...validPodcast, features: { editorial: true, news: true, includeLivestreams: false } }
    const result = PodcastSchema.parse(withFeatures)
    expect(result.features?.thumbnailGeneration).toBe(false)
  })

  it('preserves thumbnailGeneration true when explicitly set (Epic 22)', () => {
    const withThumb = { ...validPodcast, features: { editorial: true, news: true, includeLivestreams: false, thumbnailGeneration: true } }
    const result = PodcastSchema.parse(withThumb)
    expect(result.features?.thumbnailGeneration).toBe(true)
  })

  // ===========================================================================
  // Epic 28 — extraImagesGeneration feature flag
  // ===========================================================================

  it('defaults extraImagesGeneration to false when not provided (Epic 28)', () => {
    const withFeatures = { ...validPodcast, features: { editorial: true, news: true, includeLivestreams: false } }
    const result = PodcastSchema.parse(withFeatures)
    expect(result.features?.extraImagesGeneration).toBe(false)
  })

  /**
   * As duas flags são independentes por decisão de produto: o produtor pode
   * querer as imagens extras sem a fase Thumbnail (ou o contrário). Se alguém
   * acoplar uma na outra, este teste quebra.
   */
  it('accepts extraImagesGeneration on with thumbnailGeneration off (Epic 28)', () => {
    const withExtras = {
      ...validPodcast,
      features: { editorial: true, news: true, includeLivestreams: false, extraImagesGeneration: true },
    }
    const result = PodcastSchema.parse(withExtras)
    expect(result.features?.extraImagesGeneration).toBe(true)
    expect(result.features?.thumbnailGeneration).toBe(false)
  })
})

describe('LlmConfigSchema (Epic 22 / Story 22.2-bis)', () => {
  it('accepts thumbnailImageModel separately from imageModel', () => {
    const withThumbModel = {
      ...validPodcast,
      llmConfig: {
        imageModel: 'gemini-2.5-flash-image',
        thumbnailImageModel: 'gemini-3.1-flash-image',
      },
    }
    const result = PodcastSchema.parse(withThumbModel)
    expect(result.llmConfig?.imageModel).toBe('gemini-2.5-flash-image')
    expect(result.llmConfig?.thumbnailImageModel).toBe('gemini-3.1-flash-image')
  })

  /**
   * Incidente de produção 2026-07-21: o Google aposentou os IDs `-preview` da
   * família de imagem 3.x e o Vertex passou a devolver 404. Os docs no Firestore
   * seguem com o ID antigo — sem a normalização, o `.catch(undefined)` os
   * descartaria em silêncio e a geração cairia no DEFAULT_IMAGE_MODEL, trocando
   * o modelo do produtor sem nenhum sinal.
   */
  it('normaliza IDs de imagem preview aposentados para o sucessor GA', () => {
    const legacyDoc = {
      ...validPodcast,
      llmConfig: {
        imageModel: 'gemini-3.1-flash-image-preview',
        thumbnailImageModel: 'gemini-3-pro-image-preview',
      },
    }
    const result = PodcastSchema.parse(legacyDoc)
    expect(result.llmConfig?.imageModel).toBe('gemini-3.1-flash-image')
    expect(result.llmConfig?.thumbnailImageModel).toBe('gemini-3-pro-image')
  })

  it('mantém o fallback silencioso para IDs realmente desconhecidos', () => {
    const unknownDoc = {
      ...validPodcast,
      llmConfig: { imageModel: 'gemini-que-nunca-existiu' },
    }
    const result = PodcastSchema.parse(unknownDoc)
    expect(result.llmConfig?.imageModel).toBeUndefined()
  })

  it('accepts llmConfig without thumbnailImageModel (backward compat)', () => {
    const without = { ...validPodcast, llmConfig: { imageModel: 'gemini-2.5-flash-image' } }
    const result = PodcastSchema.parse(without)
    expect(result.llmConfig?.thumbnailImageModel).toBeUndefined()
  })

  it('coerces invalid thumbnailImageModel to undefined on read (tolerant parse)', () => {
    // Regression 2026-05-15: doc legacy com ID stale (`gemini-3-flash` sem
    // sufixo `-preview` etc.) quebrava GET /api/podcast com 500. Schema agora
    // usa `.catch(undefined)` no read — fica permissivo, cai pro default.
    const invalid = {
      ...validPodcast,
      llmConfig: { thumbnailImageModel: 'gemini-fictitious-model' },
    }
    const result = PodcastSchema.parse(invalid)
    expect(result.llmConfig?.thumbnailImageModel).toBeUndefined()
  })

  it('coerces stale textModel and imageModel to undefined (legacy IDs)', () => {
    const withStale = {
      ...validPodcast,
      llmConfig: {
        textModel: 'gemini-3-flash', // ID legacy salvo antes do fix 2026-05-14
        imageModel: 'gemini-2.5-flash-image', // válido — mantém
        thumbnailImageModel: 'gemini-3.1-flash-lite', // ID legacy também
      },
    }
    const result = PodcastSchema.parse(withStale)
    expect(result.llmConfig?.textModel).toBeUndefined()
    expect(result.llmConfig?.imageModel).toBe('gemini-2.5-flash-image')
    expect(result.llmConfig?.thumbnailImageModel).toBeUndefined()
  })
})

describe('PodcastSchema enabledSocialNetworks', () => {
  it('accepts enabledSocialNetworks array', () => {
    const withNetworks = { ...validPodcast, enabledSocialNetworks: ['instagram', 'linkedin'] }
    const result = PodcastSchema.parse(withNetworks)
    expect(result.enabledSocialNetworks).toEqual(['instagram', 'linkedin'])
  })

  it('works without enabledSocialNetworks (backward compat)', () => {
    const result = PodcastSchema.parse(validPodcast)
    expect(result.enabledSocialNetworks).toBeUndefined()
  })

  it('accepts empty enabledSocialNetworks array', () => {
    const withEmpty = { ...validPodcast, enabledSocialNetworks: [] }
    const result = PodcastSchema.parse(withEmpty)
    expect(result.enabledSocialNetworks).toEqual([])
  })
})

describe('PodcastUpdateSchema enabledSocialNetworks', () => {
  it('accepts partial update with enabledSocialNetworks', () => {
    const result = PodcastUpdateSchema.parse({ enabledSocialNetworks: ['instagram'] })
    expect(result.enabledSocialNetworks).toEqual(['instagram'])
  })

  it('does not inject enabledSocialNetworks into unrelated updates', () => {
    const result = PodcastUpdateSchema.parse({ name: 'Updated' })
    expect(result).not.toHaveProperty('enabledSocialNetworks')
  })
})

describe('PodcastCreateSchema', () => {
  it('validates create data without id, createdAt, updatedAt', () => {
    const createData = {
      name: 'New Podcast',
      channelId: 'UC789',
      ownerId: 'user456',
      prompts: validPrompts,
      personas: validPersonas,
      videoTypes: DEFAULT_VIDEO_TYPES,
    }
    const result = PodcastCreateSchema.parse(createData)
    expect(result.name).toBe('New Podcast')
    expect(result).not.toHaveProperty('id')
    expect(result).not.toHaveProperty('createdAt')
    expect(result).not.toHaveProperty('updatedAt')
  })

  it('strips id field from create data', () => {
    const withId = {
      id: 'should-not-be-here',
      name: 'New Podcast',
      channelId: 'UC789',
      ownerId: 'user456',
      prompts: validPrompts,
      personas: validPersonas,
      videoTypes: DEFAULT_VIDEO_TYPES,
    }
    const result = PodcastCreateSchema.parse(withId)
    expect(result).not.toHaveProperty('id')
  })
})

describe('PodcastUpdateSchema', () => {
  it('validates partial update with single field', () => {
    const update = { name: 'Updated Name' }
    const result = PodcastUpdateSchema.parse(update)
    expect(result.name).toBe('Updated Name')
  })

  it('validates partial update with prompts', () => {
    const update = {
      name: 'Updated Name',
      prompts: validPrompts,
    }
    const result = PodcastUpdateSchema.parse(update)
    expect(result.name).toBe('Updated Name')
    expect(result.prompts?.episode.critique.description).toBe(validPromptField.description)
  })

  it('validates partial update with personas', () => {
    const update = { personas: validPersonas }
    const result = PodcastUpdateSchema.parse(update)
    expect(result.personas?.critic.role).toBe(validPersona.role)
  })

  it('validates empty update object', () => {
    const result = PodcastUpdateSchema.parse({})
    expect(result).toEqual({})
  })

  it('strips id field from update', () => {
    const withId = { id: 'should-not-be-here', name: 'Updated' }
    const result = PodcastUpdateSchema.parse(withId)
    expect(result).not.toHaveProperty('id')
    expect(result.name).toBe('Updated')
  })

  it('strips createdAt field from update', () => {
    const withCreatedAt = { createdAt: mockTimestamp, name: 'Updated' }
    const result = PodcastUpdateSchema.parse(withCreatedAt)
    expect(result).not.toHaveProperty('createdAt')
  })

  it('strips updatedAt field from update (managed by system)', () => {
    const withUpdatedAt = { updatedAt: mockTimestamp, name: 'Updated' }
    const result = PodcastUpdateSchema.parse(withUpdatedAt)
    expect(result).not.toHaveProperty('updatedAt')
  })
})

describe('DEFAULT_VIDEO_TYPES', () => {
  it('has correct episode config (>= 20 min)', () => {
    expect(DEFAULT_VIDEO_TYPES.episode.minDuration).toBe(1200)
    expect(DEFAULT_VIDEO_TYPES.episode.maxDuration).toBeNull()
  })

  it('has correct cut config (3-20 min)', () => {
    expect(DEFAULT_VIDEO_TYPES.cut.minDuration).toBe(180)
    expect(DEFAULT_VIDEO_TYPES.cut.maxDuration).toBe(1199)
  })

  it('has correct reel config (< 3 min)', () => {
    expect(DEFAULT_VIDEO_TYPES.reel.minDuration).toBe(0)
    expect(DEFAULT_VIDEO_TYPES.reel.maxDuration).toBe(179)
  })

  it('durations are contiguous without gaps', () => {
    // reel max + 1 = cut min
    expect(DEFAULT_VIDEO_TYPES.reel.maxDuration! + 1).toBe(DEFAULT_VIDEO_TYPES.cut.minDuration)
    // cut max + 1 = episode min
    expect(DEFAULT_VIDEO_TYPES.cut.maxDuration! + 1).toBe(DEFAULT_VIDEO_TYPES.episode.minDuration)
  })
})

describe('DEFAULT_PROMPTS', () => {
  it('has all video types', () => {
    expect(DEFAULT_PROMPTS.episode).toBeDefined()
    expect(DEFAULT_PROMPTS.cut).toBeDefined()
    expect(DEFAULT_PROMPTS.reel).toBeDefined()
  })

  it('episode has all required prompts including adwords', () => {
    expect(DEFAULT_PROMPTS.episode.critique).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.editing).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.compliance).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.chapters).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.titles).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.description).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.tags).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.adwords).toEqual({ description: '', expectedOutput: '' })
  })

  it('cut has all required prompts', () => {
    expect(DEFAULT_PROMPTS.cut.titles).toBeDefined()
    expect(DEFAULT_PROMPTS.cut.thumbs).toBeDefined()
    expect(DEFAULT_PROMPTS.cut.description).toBeDefined()
    expect(DEFAULT_PROMPTS.cut.tags).toBeDefined()
  })

  it('reel has all required prompts', () => {
    expect(DEFAULT_PROMPTS.reel.titles).toBeDefined()
    expect(DEFAULT_PROMPTS.reel.description).toBeDefined()
    expect(DEFAULT_PROMPTS.reel.tags).toBeDefined()
  })

  it('validates against PromptsSchema', () => {
    expect(() => PromptsSchema.parse(DEFAULT_PROMPTS)).not.toThrow()
  })
})

describe('DEFAULT_PERSONAS', () => {
  it('has critic, writer, socialmedia and adwords with empty defaults', () => {
    const emptyPersona = { role: '', objective: '', resume: '' }
    expect(DEFAULT_PERSONAS.critic).toEqual(emptyPersona)
    expect(DEFAULT_PERSONAS.writer).toEqual(emptyPersona)
    expect(DEFAULT_PERSONAS.socialmedia).toEqual(emptyPersona)
    expect(DEFAULT_PERSONAS.adwords).toEqual(emptyPersona)
  })

  it('validates against PersonasSchema', () => {
    expect(() => PersonasSchema.parse(DEFAULT_PERSONAS)).not.toThrow()
  })
})

// ============================================================================
// Epic 22 — Story 22.1 — ThumbnailPromptFieldSchema and thumbnail subsection
// ============================================================================

describe('ThumbnailPromptFieldSchema (Epic 22)', () => {
  it('accepts only description and expectedOutput (image URLs optional)', () => {
    const minimal = { description: 'desc', expectedOutput: 'output' }
    expect(() => ThumbnailPromptFieldSchema.parse(minimal)).not.toThrow()
  })

  it('accepts both image URLs and mime types when provided', () => {
    const withImages = {
      description: 'desc',
      expectedOutput: 'output',
      baseImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config/pptnc/cut/base-1.png',
      baseImageMimeType: 'image/png',
      referenceImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config/pptnc/cut/reference-1.png',
      referenceImageMimeType: 'image/png',
    }
    expect(() => ThumbnailPromptFieldSchema.parse(withImages)).not.toThrow()
  })

  it('rejects empty URLs (must be at least 1 char when present)', () => {
    expect(() =>
      ThumbnailPromptFieldSchema.parse({
        description: 'desc',
        expectedOutput: 'output',
        baseImageUrl: '',
      })
    ).toThrow(ZodError)
  })

  it('enforces MAX_PROMPT_LENGTH on description and expectedOutput', () => {
    const tooLong = 'x'.repeat(MAX_PROMPT_LENGTH + 1)
    expect(() =>
      ThumbnailPromptFieldSchema.parse({
        description: tooLong,
        expectedOutput: 'ok',
      })
    ).toThrow(ZodError)
  })

  it('caps URL length at 2000 characters to prevent abuse', () => {
    const longUrl = '/api/' + 'x'.repeat(2000)
    expect(() =>
      ThumbnailPromptFieldSchema.parse({
        description: 'desc',
        expectedOutput: 'output',
        baseImageUrl: longUrl,
      })
    ).toThrow(ZodError)
  })
})

describe('EpisodePromptsSchema — thumbnail subsection (Epic 22)', () => {
  it('accepts episode prompts without thumbnail (backward-compat)', () => {
    const promptField = { description: '', expectedOutput: '' }
    const episode = {
      critique: promptField,
      editing: promptField,
      compliance: promptField,
      chapters: promptField,
      titles: promptField,
      description: promptField,
      tags: promptField,
    }
    expect(() => EpisodePromptsSchema.parse(episode)).not.toThrow()
  })

  it('accepts episode prompts with thumbnail filled', () => {
    const promptField = { description: '', expectedOutput: '' }
    const episode = {
      critique: promptField,
      editing: promptField,
      compliance: promptField,
      chapters: promptField,
      titles: promptField,
      description: promptField,
      tags: promptField,
      thumbnail: {
        description: 'Generate a 16:9 thumbnail',
        expectedOutput: 'PNG image',
        baseImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config/pptnc/episode/base-1.png',
        baseImageMimeType: 'image/png',
      },
    }
    expect(() => EpisodePromptsSchema.parse(episode)).not.toThrow()
  })
})

describe('CutPromptsSchema — thumbnail subsection coexists with legacy thumbs (Epic 22)', () => {
  it('accepts cut prompts with both thumbs (legacy textual brief) and thumbnail (Epic 22)', () => {
    const promptField = { description: '', expectedOutput: '' }
    const cut = {
      titles: promptField,
      thumbs: { description: 'textual brief for Phase 5B', expectedOutput: '...' },
      description: promptField,
      tags: promptField,
      thumbnail: { description: 'image generation prompt', expectedOutput: 'PNG 16:9' },
    }
    expect(() => CutPromptsSchema.parse(cut)).not.toThrow()
  })

  it('accepts cut prompts with thumbs but no thumbnail (backward-compat)', () => {
    const promptField = { description: '', expectedOutput: '' }
    const cut = {
      titles: promptField,
      thumbs: promptField,
      description: promptField,
      tags: promptField,
    }
    expect(() => CutPromptsSchema.parse(cut)).not.toThrow()
  })
})

describe('DEFAULT_PROMPTS — Epic 22 thumbnail defaults', () => {
  it('episode and cut defaults include empty thumbnail subsection', () => {
    expect(DEFAULT_PROMPTS.episode.thumbnail).toEqual({ description: '', expectedOutput: '' })
    expect(DEFAULT_PROMPTS.cut.thumbnail).toEqual({ description: '', expectedOutput: '' })
  })

  it('reel default does NOT include thumbnail (Epic 22 covers only episode and cut)', () => {
    expect((DEFAULT_PROMPTS.reel as Record<string, unknown>).thumbnail).toBeUndefined()
  })
})

// ============================================================================
// Epic 28 — Imagens extras do episódio (Story, Vitrine, Feed)
// ============================================================================

describe('ExtraImagesPromptsSchema (Epic 28)', () => {
  const filled = {
    description: 'gere a imagem',
    expectedOutput: 'PNG vertical',
    baseImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config/p/episode/story/base-1.png',
    baseImageMimeType: 'image/png',
    referenceImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config/p/episode/story/reference-1.png',
    referenceImageMimeType: 'image/png',
  }

  it('accepts an empty object — nenhuma das três é obrigatória', () => {
    expect(() => ExtraImagesPromptsSchema.parse({})).not.toThrow()
  })

  it('accepts each kind with the full thumbnail shape (Base + Referência próprias)', () => {
    const parsed = ExtraImagesPromptsSchema.parse({ story: filled, vitrine: filled, feed: filled })
    expect(parsed.story?.baseImageUrl).toBe(filled.baseImageUrl)
    expect(parsed.vitrine?.referenceImageUrl).toBe(filled.referenceImageUrl)
    expect(parsed.feed?.expectedOutput).toBe('PNG vertical')
  })

  it('accepts a partial config — só Feed preenchido', () => {
    const parsed = ExtraImagesPromptsSchema.parse({ feed: filled })
    expect(parsed.feed).toBeDefined()
    expect(parsed.story).toBeUndefined()
  })

  it('rejects a description over MAX_PROMPT_LENGTH', () => {
    const tooLong = { description: 'x'.repeat(10001), expectedOutput: '' }
    expect(() => ExtraImagesPromptsSchema.parse({ story: tooLong })).toThrow()
  })

  it('EXTRA_IMAGE_KINDS matches the schema keys', () => {
    expect([...EXTRA_IMAGE_KINDS]).toEqual(['story', 'vitrine', 'feed'])
    expect(Object.keys(ExtraImagesPromptsSchema.shape).sort()).toEqual([...EXTRA_IMAGE_KINDS].sort())
  })

  it('has a PT-BR label for every kind', () => {
    for (const kind of EXTRA_IMAGE_KINDS) {
      expect(EXTRA_IMAGE_LABELS[kind]).toBeTruthy()
    }
  })
})

describe('EpisodePromptsSchema extraImages (Epic 28)', () => {
  const promptField = { description: '', expectedOutput: '' }
  const baseEpisode = {
    critique: promptField,
    editing: promptField,
    compliance: promptField,
    chapters: promptField,
    titles: promptField,
    description: promptField,
    tags: promptField,
  }

  it('accepts an episode without extraImages (backward-compat)', () => {
    expect(() => EpisodePromptsSchema.parse(baseEpisode)).not.toThrow()
  })

  it('accepts an episode with extraImages', () => {
    const withExtras = {
      ...baseEpisode,
      extraImages: { story: { description: 'a', expectedOutput: 'b' } },
    }
    const parsed = EpisodePromptsSchema.parse(withExtras)
    expect(parsed.extraImages?.story?.description).toBe('a')
  })

  /** Imagens extras são episode-only — cortes e reels não têm o campo. */
  it('CutPromptsSchema does not carry extraImages through', () => {
    const cut = {
      titles: promptField,
      thumbs: promptField,
      description: promptField,
      tags: promptField,
      extraImages: { story: { description: 'a', expectedOutput: 'b' } },
    }
    const parsed = CutPromptsSchema.parse(cut) as Record<string, unknown>
    expect(parsed.extraImages).toBeUndefined()
  })

  it('DEFAULT_PROMPTS.episode ships the three empty kinds', () => {
    expect(DEFAULT_PROMPTS.episode.extraImages).toEqual({
      story: { description: '', expectedOutput: '' },
      vitrine: { description: '', expectedOutput: '' },
      feed: { description: '', expectedOutput: '' },
    })
  })
})
