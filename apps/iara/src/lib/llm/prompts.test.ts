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
    const phases = [1, 2, 3, 4, 5, 6, 7, 8] as const
    phases.forEach((phase) => {
      expect(PHASE_CONFIG[phase]).toBeDefined()
      expect(PHASE_CONFIG[phase].personaName).toBeDefined()
      expect(PHASE_CONFIG[phase].attachmentType).toBeDefined()
      expect(PHASE_CONFIG[phase].promptKey).toBeDefined()
    })
  })

  it('uses critic persona for phases 1-4 (Type 2 - Immutable)', () => {
    expect(PHASE_CONFIG[1].personaName).toBe('critic')
    expect(PHASE_CONFIG[2].personaName).toBe('critic')
    expect(PHASE_CONFIG[3].personaName).toBe('critic')
    expect(PHASE_CONFIG[4].personaName).toBe('critic')
  })

  it('uses writer persona for phases 5-7 (Type 1 - Reprocessable)', () => {
    expect(PHASE_CONFIG[5].personaName).toBe('writer')
    expect(PHASE_CONFIG[6].personaName).toBe('writer')
    expect(PHASE_CONFIG[7].personaName).toBe('writer')
  })

  it('uses TXT attachment for phases 1, 5, 6, 7', () => {
    expect(PHASE_CONFIG[1].attachmentType).toBe('TXT')
    expect(PHASE_CONFIG[5].attachmentType).toBe('TXT')
    expect(PHASE_CONFIG[6].attachmentType).toBe('TXT')
    expect(PHASE_CONFIG[7].attachmentType).toBe('TXT')
  })

  it('uses SRT attachment for phases 2, 3, 4', () => {
    expect(PHASE_CONFIG[2].attachmentType).toBe('SRT')
    expect(PHASE_CONFIG[3].attachmentType).toBe('SRT')
    expect(PHASE_CONFIG[4].attachmentType).toBe('SRT')
  })

  it('has correct promptKey mappings', () => {
    expect(PHASE_CONFIG[1].promptKey).toBe('critique')
    expect(PHASE_CONFIG[2].promptKey).toBe('editing')
    expect(PHASE_CONFIG[3].promptKey).toBe('compliance')
    expect(PHASE_CONFIG[4].promptKey).toBe('chapters')
    expect(PHASE_CONFIG[5].promptKey).toBe('titles')
    expect(PHASE_CONFIG[6].promptKey).toBe('description')
    expect(PHASE_CONFIG[7].promptKey).toBe('tags')
    expect(PHASE_CONFIG[8].promptKey).toBe('')
  })
})

describe('PHASE_JSON_SCHEMAS', () => {
  it('has schemas for all phases', () => {
    const phases = [1, 2, 3, 4, 5, 6, 7, 8] as const
    phases.forEach((phase) => {
      expect(PHASE_JSON_SCHEMAS[phase]).toBeDefined()
    })
  })

  it('phase 8 has empty schema (no LLM call)', () => {
    expect(PHASE_JSON_SCHEMAS[8]).toBe('')
  })

  it('phase 2 schema uses string timestamp format', () => {
    expect(PHASE_JSON_SCHEMAS[2]).toContain('"timestamp": "00:05:30"')
    expect(PHASE_JSON_SCHEMAS[2]).toContain('STRING no formato "HH:MM:SS"')
  })

  it('phase 3 schema uses string timestamp format', () => {
    expect(PHASE_JSON_SCHEMAS[3]).toContain('"timestamp": "00:12:45"')
    expect(PHASE_JSON_SCHEMAS[3]).toContain('STRING no formato "HH:MM:SS"')
  })

  it('phase 4 schema uses string timestamp format', () => {
    expect(PHASE_JSON_SCHEMAS[4]).toContain('"timestamp": "00:00"')
    expect(PHASE_JSON_SCHEMAS[4]).toContain('"timestamp": "05:30"')
    expect(PHASE_JSON_SCHEMAS[4]).toContain('STRING no formato "HH:MM:SS"')
  })
})

describe('BASE_SYSTEM_PROMPTS', () => {
  it('has prompts for all phases', () => {
    const phases = [1, 2, 3, 4, 5, 6, 7, 8] as const
    phases.forEach((phase) => {
      expect(BASE_SYSTEM_PROMPTS[phase]).toBeDefined()
    })
  })

  it('phase 8 has empty prompt (no LLM call)', () => {
    expect(BASE_SYSTEM_PROMPTS[8]).toBe('')
  })

  it('phase 1 prompt mentions JSON response', () => {
    expect(BASE_SYSTEM_PROMPTS[1]).toContain('JSON válido')
    expect(BASE_SYSTEM_PROMPTS[1]).toContain('critique')
  })
})

describe('USER_PROMPT_TEMPLATES', () => {
  it('has templates for all phases', () => {
    const phases = [1, 2, 3, 4, 5, 6, 7, 8] as const
    phases.forEach((phase) => {
      expect(USER_PROMPT_TEMPLATES[phase]).toBeDefined()
    })
  })

  it('phase 8 has empty template (no LLM call)', () => {
    expect(USER_PROMPT_TEMPLATES[8]).toBe('')
  })

  it('templates contain expected placeholders', () => {
    expect(USER_PROMPT_TEMPLATES[1]).toContain('{title}')
    expect(USER_PROMPT_TEMPLATES[1]).toContain('{transcript}')
    expect(USER_PROMPT_TEMPLATES[5]).toContain('{previousPhaseData}')
  })
})

describe('buildPhasePrompt', () => {
  const videoType: VideoType = 'episode'

  it('returns empty string for phase 8', () => {
    const result = buildPhasePrompt(8, validCriticPersona, validPrompts, videoType)
    expect(result).toBe('')
  })

  it('falls back to BASE_SYSTEM_PROMPTS when persona is undefined', () => {
    const result = buildPhasePrompt(1, undefined, validPrompts, videoType)
    expect(result).toBe(BASE_SYSTEM_PROMPTS[1])
  })

  it('falls back to BASE_SYSTEM_PROMPTS when prompts is undefined', () => {
    const result = buildPhasePrompt(1, validCriticPersona, undefined, videoType)
    expect(result).toBe(BASE_SYSTEM_PROMPTS[1])
  })

  it('falls back to BASE_SYSTEM_PROMPTS when videoType prompts not found', () => {
    const partialPrompts = { ...validPrompts, episode: undefined } as unknown as Prompts
    const result = buildPhasePrompt(1, validCriticPersona, partialPrompts, videoType)
    expect(result).toBe(BASE_SYSTEM_PROMPTS[1])
  })

  it('falls back to BASE_SYSTEM_PROMPTS when phase prompt is empty', () => {
    const emptyPrompts: Prompts = {
      ...validPrompts,
      episode: {
        ...validPrompts.episode,
        critique: { description: '', expectedOutput: '' },
      },
    }
    const result = buildPhasePrompt(1, validCriticPersona, emptyPrompts, videoType)
    expect(result).toBe(BASE_SYSTEM_PROMPTS[1])
  })

  it('builds prompt from persona and prompts for phase 1', () => {
    const result = buildPhasePrompt(1, validCriticPersona, validPrompts, videoType)

    expect(result).toContain('Seu papel: Crítico de conteúdo digital')
    expect(result).toContain('Seu objetivo: Analisar conteúdo e fornecer feedback construtivo')
    expect(result).toContain('Seu contexto: Especialista em análise de conteúdo')
    expect(result).toContain('Sua tarefa: Analise criticamente o episódio')
    expect(result).toContain('Seu retorno deve ser estritamente: Um JSON com critique')
  })

  it('appends JSON schema to built prompt', () => {
    const result = buildPhasePrompt(1, validCriticPersona, validPrompts, videoType)

    expect(result).toContain(PHASE_JSON_SCHEMAS[1])
  })

  it('builds prompt for phase 5 with writer persona', () => {
    const result = buildPhasePrompt(5, validWriterPersona, validPrompts, videoType)

    expect(result).toContain('Seu papel: Redator de conteúdo')
    expect(result).toContain('Sua tarefa: Gere títulos SEO')
    expect(result).toContain(PHASE_JSON_SCHEMAS[5])
  })

  it('builds prompt for cut video type', () => {
    const result = buildPhasePrompt(5, validWriterPersona, validPrompts, 'cut')

    expect(result).toContain('Sua tarefa: Gere títulos para corte')
  })

  it('builds prompt for reel video type', () => {
    const result = buildPhasePrompt(5, validWriterPersona, validPrompts, 'reel')

    expect(result).toContain('Sua tarefa: Gere títulos para reel')
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
      const result = buildPhasePrompt(5, validWriterPersona, promptsWithEmptyReel, 'reel')

      // Should use episode titles prompt as fallback
      expect(result).toContain('Sua tarefa: Gere títulos SEO')
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
      const result = buildPhasePrompt(5, validWriterPersona, promptsWithEmptyCut, 'cut')

      // Should use episode titles prompt as fallback
      expect(result).toContain('Sua tarefa: Gere títulos SEO')
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
      const result = buildPhasePrompt(5, validWriterPersona, promptsWithEmptyBoth, 'reel')

      expect(result).toBe(BASE_SYSTEM_PROMPTS[5])
    })

    it('uses reel-specific prompt when available (no fallback)', () => {
      const result = buildPhasePrompt(5, validWriterPersona, validPrompts, 'reel')

      // Should use reel-specific prompt, not episode fallback
      expect(result).toContain('Sua tarefa: Gere títulos para reel')
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
      const result = buildPhasePrompt(5, validWriterPersona, promptsWithEmptyEpisode, 'episode')

      // Should fallback to BASE_SYSTEM_PROMPTS, not look for other types
      expect(result).toBe(BASE_SYSTEM_PROMPTS[5])
    })
  })
})

describe('getSystemPrompt (deprecated)', () => {
  it('returns base prompt when no configured prompt', () => {
    const result = getSystemPrompt(1)
    expect(result).toBe(BASE_SYSTEM_PROMPTS[1])
  })

  it('returns base prompt when configured prompt is empty', () => {
    const result = getSystemPrompt(1, { description: '', expectedOutput: '' })
    expect(result).toBe(BASE_SYSTEM_PROMPTS[1])
  })

  it('appends configured description to base prompt', () => {
    const result = getSystemPrompt(1, { description: 'Custom instructions', expectedOutput: '' })

    expect(result).toContain(BASE_SYSTEM_PROMPTS[1])
    expect(result).toContain('## Instruções Adicionais do Produtor')
    expect(result).toContain('Custom instructions')
  })

  it('appends configured expectedOutput to base prompt', () => {
    const result = getSystemPrompt(1, { description: '', expectedOutput: 'Custom output format' })

    expect(result).toContain(BASE_SYSTEM_PROMPTS[1])
    expect(result).toContain('## Formato de Saída Esperado')
    expect(result).toContain('Custom output format')
  })

  it('appends both description and expectedOutput', () => {
    const result = getSystemPrompt(1, {
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
    const phases = [1, 2, 3, 4, 5, 6, 7, 8] as const
    phases.forEach((phase) => {
      expect(getUserPromptTemplate(phase)).toBe(USER_PROMPT_TEMPLATES[phase])
    })
  })
})
