import { describe, it, expect } from 'vitest'

import type { Persona, Prompts } from '@/types/podcast'
import type { VideoType } from '@/types/video'

import {
  BASE_SYSTEM_PROMPTS,
  PHASE_CONFIG,
  PHASE_JSON_SCHEMAS,
  buildPhasePrompt,
  getSystemPrompt,
  getUserPromptTemplate,
  USER_PROMPT_TEMPLATES,
} from './prompts'

// Valid persona for tests
const validCriticPersona: Persona = {
  role: 'Crítico de conteúdo digital',
  objective: 'Analisar conteúdo e fornecer feedback construtivo',
  resume: 'Especialista em análise de conteúdo com 10 anos de experiência',
}

const validWriterPersona: Persona = {
  role: 'Redator de conteúdo',
  objective: 'Criar textos envolventes',
  resume: 'Redator com experiência em marketing digital',
}

// Valid prompts structure for tests
const validPrompts: Prompts = {
  episode: {
    critique: {
      description: 'Analise criticamente o episódio',
      expectedOutput: 'Um JSON com critique, highlights e suggestions',
    },
    editing: {
      description: 'Verifique problemas de edição',
      expectedOutput: 'Um JSON com hasIssues e issues',
    },
    compliance: {
      description: 'Analise riscos de compliance',
      expectedOutput: 'Um JSON com status e items',
    },
    chapters: {
      description: 'Sugira capítulos para o vídeo',
      expectedOutput: 'Um JSON com chapters array',
    },
    titles: {
      description: 'Gere títulos SEO',
      expectedOutput: 'Um JSON com titles array',
    },
    description: {
      description: 'Gere uma descrição otimizada',
      expectedOutput: 'Um JSON com description string',
    },
    tags: {
      description: 'Gere tags relevantes',
      expectedOutput: 'Um JSON com tags array',
    },
  },
  cut: {
    titles: {
      description: 'Gere títulos para corte',
      expectedOutput: 'Um JSON com titles array',
    },
    thumbs: {
      description: 'Sugira thumbnails',
      expectedOutput: 'Um JSON com thumbnails',
    },
    description: {
      description: 'Gere descrição para corte',
      expectedOutput: 'Um JSON com description',
    },
    tags: {
      description: 'Gere tags para corte',
      expectedOutput: 'Um JSON com tags array',
    },
  },
  reel: {
    titles: {
      description: 'Gere títulos para reel',
      expectedOutput: 'Um JSON com titles array',
    },
    description: {
      description: 'Gere descrição para reel',
      expectedOutput: 'Um JSON com description',
    },
    tags: {
      description: 'Gere tags para reel',
      expectedOutput: 'Um JSON com tags array',
    },
  },
}

describe('PHASE_CONFIG', () => {
  it('has configuration for all 8 phases', () => {
    const phases = ['critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags', 'publish'] as const
    phases.forEach((phase) => {
      expect(PHASE_CONFIG[phase]).toBeDefined()
      expect(PHASE_CONFIG[phase].personaName).toBeDefined()
      expect(PHASE_CONFIG[phase].attachmentType).toBeDefined()
      expect(PHASE_CONFIG[phase].promptKey).toBeDefined()
    })
  })

  it('uses critic persona for phases 1-4 (Type 2 - Immutable)', () => {
    expect(PHASE_CONFIG['critique'].personaName).toBe('critic')
    expect(PHASE_CONFIG['edit-check'].personaName).toBe('critic')
    expect(PHASE_CONFIG['risk'].personaName).toBe('critic')
    expect(PHASE_CONFIG['chapters'].personaName).toBe('critic')
  })

  it('uses writer persona for phases 5-7 (Type 1 - Reprocessable)', () => {
    expect(PHASE_CONFIG['title'].personaName).toBe('writer')
    expect(PHASE_CONFIG['description'].personaName).toBe('writer')
    expect(PHASE_CONFIG['tags'].personaName).toBe('writer')
  })

  it('uses TXT attachment for phases 1, 5, 6, 7', () => {
    expect(PHASE_CONFIG['critique'].attachmentType).toBe('TXT')
    expect(PHASE_CONFIG['title'].attachmentType).toBe('TXT')
    expect(PHASE_CONFIG['description'].attachmentType).toBe('TXT')
    expect(PHASE_CONFIG['tags'].attachmentType).toBe('TXT')
  })

  it('uses SRT attachment for phases 2, 3, 4', () => {
    expect(PHASE_CONFIG['edit-check'].attachmentType).toBe('SRT')
    expect(PHASE_CONFIG['risk'].attachmentType).toBe('SRT')
    expect(PHASE_CONFIG['chapters'].attachmentType).toBe('SRT')
  })

  it('has correct promptKey mappings', () => {
    expect(PHASE_CONFIG['critique'].promptKey).toBe('critique')
    expect(PHASE_CONFIG['edit-check'].promptKey).toBe('editing')
    expect(PHASE_CONFIG['risk'].promptKey).toBe('compliance')
    expect(PHASE_CONFIG['chapters'].promptKey).toBe('chapters')
    expect(PHASE_CONFIG['title'].promptKey).toBe('titles')
    expect(PHASE_CONFIG['description'].promptKey).toBe('description')
    expect(PHASE_CONFIG['tags'].promptKey).toBe('tags')
    expect(PHASE_CONFIG['publish'].promptKey).toBe('')
  })

  it('uses temperature 0.3 for analytical/extractive phases (edit-check, risk, chapters)', () => {
    // Low temperature reduz não-determinismo/alucinação nessas fases imutáveis
    // (ex.: issues genéricas de "ruído no áudio" no reprocess do edit-check).
    expect(PHASE_CONFIG['edit-check'].temperature).toBe(0.3)
    expect(PHASE_CONFIG['risk'].temperature).toBe(0.3)
    expect(PHASE_CONFIG['chapters'].temperature).toBe(0.3)
  })

  it('leaves temperature unset for generative/other phases (provider default)', () => {
    expect(PHASE_CONFIG['critique'].temperature).toBeUndefined()
    expect(PHASE_CONFIG['title'].temperature).toBeUndefined()
    expect(PHASE_CONFIG['description'].temperature).toBeUndefined()
    expect(PHASE_CONFIG['tags'].temperature).toBeUndefined()
  })
})

describe('PHASE_JSON_SCHEMAS', () => {
  it('has schemas for all phases', () => {
    const phases = ['critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags', 'publish'] as const
    phases.forEach((phase) => {
      expect(PHASE_JSON_SCHEMAS[phase]).toBeDefined()
    })
  })

  it('phase 8 has empty schema (no LLM call)', () => {
    expect(PHASE_JSON_SCHEMAS['publish']).toBe('')
  })

  it('phase 2 schema uses string timestamp format with compact JSON instructions', () => {
    expect(PHASE_JSON_SCHEMAS['edit-check']).toContain('"timestamp": "HH:MM:SS"')
    expect(PHASE_JSON_SCHEMAS['edit-check']).toContain('STRING no formato "HH:MM:SS"')
    expect(PHASE_JSON_SCHEMAS['edit-check']).toContain('JSON COMPACTO')
  })

  it('phase 3 schema uses string timestamp format with json_response tags', () => {
    expect(PHASE_JSON_SCHEMAS['risk']).toContain('"timestamp": "00:08:20"')
    expect(PHASE_JSON_SCHEMAS['risk']).toContain('STRING no formato "HH:MM:SS"')
    expect(PHASE_JSON_SCHEMAS['risk']).toContain('<json_response>')
    expect(PHASE_JSON_SCHEMAS['risk']).toContain('</json_response>')
  })

  it('phase 4 schema uses string timestamp format', () => {
    expect(PHASE_JSON_SCHEMAS['chapters']).toContain('"timestamp": "00:00"')
    expect(PHASE_JSON_SCHEMAS['chapters']).toContain('"timestamp": "05:30"')
    expect(PHASE_JSON_SCHEMAS['chapters']).toContain('STRING no formato "HH:MM:SS"')
  })
})

describe('BASE_SYSTEM_PROMPTS', () => {
  it('has prompts for all phases', () => {
    const phases = ['critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags', 'publish'] as const
    phases.forEach((phase) => {
      expect(BASE_SYSTEM_PROMPTS[phase]).toBeDefined()
    })
  })

  it('phase 8 has empty prompt (no LLM call)', () => {
    expect(BASE_SYSTEM_PROMPTS['publish']).toBe('')
  })

  it('phase 1 prompt mentions JSON response', () => {
    expect(BASE_SYSTEM_PROMPTS['critique']).toContain('JSON válido')
    expect(BASE_SYSTEM_PROMPTS['critique']).toContain('critique')
  })
})

describe('USER_PROMPT_TEMPLATES', () => {
  it('has templates for all phases', () => {
    const phases = ['critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags', 'publish'] as const
    phases.forEach((phase) => {
      expect(USER_PROMPT_TEMPLATES[phase]).toBeDefined()
    })
  })

  it('phase 8 has empty template (no LLM call)', () => {
    expect(USER_PROMPT_TEMPLATES['publish']).toBe('')
  })

  it('templates contain expected placeholders', () => {
    expect(USER_PROMPT_TEMPLATES['critique']).toContain('{title}')
    expect(USER_PROMPT_TEMPLATES['critique']).toContain('{transcript}')
    expect(USER_PROMPT_TEMPLATES['title']).toContain('{previousPhaseData}')
  })
})

describe('buildPhasePrompt', () => {
  const videoType: VideoType = 'episode'

  it('returns empty string for phase 8', () => {
    const result = buildPhasePrompt('publish', validCriticPersona, validPrompts, videoType)
    expect(result).toBe('')
  })

  it('falls back to BASE_SYSTEM_PROMPTS when persona is undefined', () => {
    const result = buildPhasePrompt('critique', undefined, validPrompts, videoType)
    expect(result).toBe(BASE_SYSTEM_PROMPTS['critique'])
  })

  it('falls back to BASE_SYSTEM_PROMPTS when prompts is undefined', () => {
    const result = buildPhasePrompt('critique', validCriticPersona, undefined, videoType)
    expect(result).toBe(BASE_SYSTEM_PROMPTS['critique'])
  })

  it('falls back to BASE_SYSTEM_PROMPTS when videoType prompts not found', () => {
    const partialPrompts = { ...validPrompts, episode: undefined } as unknown as Prompts
    const result = buildPhasePrompt('critique', validCriticPersona, partialPrompts, videoType)
    expect(result).toBe(BASE_SYSTEM_PROMPTS['critique'])
  })

  it('falls back to BASE_SYSTEM_PROMPTS when phase prompt is empty', () => {
    const emptyPrompts: Prompts = {
      ...validPrompts,
      episode: {
        ...validPrompts.episode,
        critique: { description: '', expectedOutput: '' },
      },
    }
    const result = buildPhasePrompt('critique', validCriticPersona, emptyPrompts, videoType)
    expect(result).toBe(BASE_SYSTEM_PROMPTS['critique'])
  })

  it('builds prompt from persona and prompts for phase 1', () => {
    const result = buildPhasePrompt('critique', validCriticPersona, validPrompts, videoType)

    expect(result).toContain('Seu papel: Crítico de conteúdo digital')
    expect(result).toContain('Seu objetivo: Analisar conteúdo e fornecer feedback construtivo')
    expect(result).toContain('Seu contexto: Especialista em análise de conteúdo')
    expect(result).toContain('## TAREFA')
    expect(result).toContain('Analise criticamente o episódio')
    // expectedOutput is NOT included when PHASE_JSON_SCHEMAS has content (avoids format conflicts)
    expect(result).not.toContain('Seu retorno deve ser estritamente')
  })

  it('appends JSON schema to built prompt', () => {
    const result = buildPhasePrompt('critique', validCriticPersona, validPrompts, videoType)

    expect(result).toContain(PHASE_JSON_SCHEMAS['critique'])
  })

  it('builds prompt for phase 5 with writer persona', () => {
    const result = buildPhasePrompt('title', validWriterPersona, validPrompts, videoType)

    expect(result).toContain('Seu papel: Redator de conteúdo')
    expect(result).toContain('Gere títulos SEO')
    expect(result).toContain(PHASE_JSON_SCHEMAS['title'])
  })

  it('builds prompt for cut video type', () => {
    const result = buildPhasePrompt('title', validWriterPersona, validPrompts, 'cut')

    expect(result).toContain('Gere títulos para corte')
  })

  it('builds prompt for reel video type', () => {
    const result = buildPhasePrompt('title', validWriterPersona, validPrompts, 'reel')

    expect(result).toContain('Gere títulos para reel')
  })

  describe('episode fallback for reel/cut', () => {
    it('falls back to episode prompts when reel prompt is empty', () => {
      const promptsWithEmptyReel: Prompts = {
        ...validPrompts,
        reel: {
          titles: { description: '', expectedOutput: '' },
          description: { description: '', expectedOutput: '' },
          tags: { description: '', expectedOutput: '' },
        },
      }
      const result = buildPhasePrompt('title', validWriterPersona, promptsWithEmptyReel, 'reel')

      // Should use episode titles prompt as fallback
      expect(result).toContain('Gere títulos SEO')
      expect(result).not.toContain('Gere títulos para reel')
    })

    it('falls back to episode prompts when cut prompt is empty', () => {
      const promptsWithEmptyCut: Prompts = {
        ...validPrompts,
        cut: {
          titles: { description: '', expectedOutput: '' },
          thumbs: { description: 'Sugira thumbnails', expectedOutput: 'Um JSON com thumbnails' },
          description: { description: '', expectedOutput: '' },
          tags: { description: '', expectedOutput: '' },
        },
      }
      const result = buildPhasePrompt('title', validWriterPersona, promptsWithEmptyCut, 'cut')

      // Should use episode titles prompt as fallback
      expect(result).toContain('Gere títulos SEO')
      expect(result).not.toContain('Gere títulos para corte')
    })

    it('falls back to BASE_SYSTEM_PROMPTS when both reel and episode prompts are empty', () => {
      const promptsWithEmptyBoth: Prompts = {
        episode: {
          ...validPrompts.episode,
          titles: { description: '', expectedOutput: '' },
        },
        cut: validPrompts.cut,
        reel: {
          titles: { description: '', expectedOutput: '' },
          description: { description: '', expectedOutput: '' },
          tags: { description: '', expectedOutput: '' },
        },
      }
      const result = buildPhasePrompt('title', validWriterPersona, promptsWithEmptyBoth, 'reel')

      expect(result).toBe(BASE_SYSTEM_PROMPTS['title'])
    })

    it('uses reel-specific prompt when available (no fallback)', () => {
      const result = buildPhasePrompt('title', validWriterPersona, validPrompts, 'reel')

      // Should use reel-specific prompt, not episode fallback
      expect(result).toContain('Gere títulos para reel')
      expect(result).not.toContain('Gere títulos SEO')
    })

    it('episode type does not trigger fallback even if empty', () => {
      const promptsWithEmptyEpisode: Prompts = {
        ...validPrompts,
        episode: {
          ...validPrompts.episode,
          titles: { description: '', expectedOutput: '' },
        },
      }
      const result = buildPhasePrompt('title', validWriterPersona, promptsWithEmptyEpisode, 'episode')

      // Should fallback to BASE_SYSTEM_PROMPTS, not look for other types
      expect(result).toBe(BASE_SYSTEM_PROMPTS['title'])
    })
  })

  describe('standalone (Vídeo Avulso, Epic 25)', () => {
    const promptsWithStandalone: Prompts = {
      ...validPrompts,
      standalone: {
        titles: { description: 'Gere títulos para vídeo avulso', expectedOutput: 'Um JSON com títulos' },
        thumbs: { description: 'thumb avulso', expectedOutput: 'x' },
        description: { description: 'desc avulso', expectedOutput: 'x' },
        tags: { description: 'tags avulso', expectedOutput: 'x' },
      },
    }

    it('uses the standalone bucket first when standalone=true (over cut)', () => {
      const result = buildPhasePrompt('title', validWriterPersona, promptsWithStandalone, 'cut', true)
      expect(result).toContain('Gere títulos para vídeo avulso')
      expect(result).not.toContain('Gere títulos para corte')
    })

    it('ignores the standalone bucket when standalone=false', () => {
      const result = buildPhasePrompt('title', validWriterPersona, promptsWithStandalone, 'cut', false)
      expect(result).toContain('Gere títulos para corte')
      expect(result).not.toContain('Gere títulos para vídeo avulso')
    })

    it('falls back to the videoType bucket (cut) when standalone is absent', () => {
      const result = buildPhasePrompt('title', validWriterPersona, validPrompts, 'cut', true)
      expect(result).toContain('Gere títulos para corte')
    })

    it('falls back through cut to episode when standalone + cut buckets are empty', () => {
      const promptsEmpty: Prompts = {
        ...validPrompts,
        standalone: {
          titles: { description: '', expectedOutput: '' },
          thumbs: { description: '', expectedOutput: '' },
          description: { description: '', expectedOutput: '' },
          tags: { description: '', expectedOutput: '' },
        },
        cut: {
          titles: { description: '', expectedOutput: '' },
          thumbs: { description: 'x', expectedOutput: 'x' },
          description: { description: '', expectedOutput: '' },
          tags: { description: '', expectedOutput: '' },
        },
      }
      const result = buildPhasePrompt('title', validWriterPersona, promptsEmpty, 'cut', true)
      expect(result).toContain('Gere títulos SEO') // episode fallback
    })
  })
})

describe('getSystemPrompt (deprecated)', () => {
  it('returns base prompt when no configured prompt', () => {
    const result = getSystemPrompt('critique')
    expect(result).toBe(BASE_SYSTEM_PROMPTS['critique'])
  })

  it('returns base prompt when configured prompt is empty', () => {
    const result = getSystemPrompt('critique', { description: '', expectedOutput: '' })
    expect(result).toBe(BASE_SYSTEM_PROMPTS['critique'])
  })

  it('appends configured description to base prompt', () => {
    const result = getSystemPrompt('critique', { description: 'Custom instructions', expectedOutput: '' })

    expect(result).toContain(BASE_SYSTEM_PROMPTS['critique'])
    expect(result).toContain('## Instruções Adicionais do Produtor')
    expect(result).toContain('Custom instructions')
  })

  it('appends configured expectedOutput to base prompt', () => {
    const result = getSystemPrompt('critique', { description: '', expectedOutput: 'Custom output format' })

    expect(result).toContain(BASE_SYSTEM_PROMPTS['critique'])
    expect(result).toContain('## Formato de Saída Esperado')
    expect(result).toContain('Custom output format')
  })

  it('appends both description and expectedOutput', () => {
    const result = getSystemPrompt('critique', {
      description: 'Custom instructions',
      expectedOutput: 'Custom output format',
    })

    expect(result).toContain('## Instruções Adicionais do Produtor')
    expect(result).toContain('Custom instructions')
    expect(result).toContain('## Formato de Saída Esperado')
    expect(result).toContain('Custom output format')
  })
})

describe('getUserPromptTemplate', () => {
  it('returns template for each phase', () => {
    const phases = ['critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags', 'publish'] as const
    phases.forEach((phase) => {
      expect(getUserPromptTemplate(phase)).toBe(USER_PROMPT_TEMPLATES[phase])
    })
  })
})
