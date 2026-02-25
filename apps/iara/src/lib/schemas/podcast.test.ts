import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'

import {
  PodcastSchema,
  PodcastCreateSchema,
  PodcastUpdateSchema,
  PromptsSchema,
  PromptFieldSchema,
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

  it('episode has all required prompts', () => {
    expect(DEFAULT_PROMPTS.episode.critique).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.editing).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.compliance).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.chapters).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.titles).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.description).toBeDefined()
    expect(DEFAULT_PROMPTS.episode.tags).toBeDefined()
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
  it('has critic, writer and socialmedia', () => {
    expect(DEFAULT_PERSONAS.critic).toBeDefined()
    expect(DEFAULT_PERSONAS.writer).toBeDefined()
    expect(DEFAULT_PERSONAS.socialmedia).toBeDefined()
  })

  it('validates against PersonasSchema', () => {
    expect(() => PersonasSchema.parse(DEFAULT_PERSONAS)).not.toThrow()
  })
})
