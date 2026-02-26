import { describe, expect, it } from 'vitest'

import {
  ADWORDS_JSON_SCHEMA,
  buildAdwordsSystemPrompt,
  buildAdwordsUserPrompt,
} from './adwords-prompts'

import type { Video } from '@/types/video'

// Helpers
const mockTimestamp = { toDate: () => new Date(), toMillis: () => Date.now(), seconds: 1700000000, nanoseconds: 0 }

function createVideo(overrides?: Partial<Video>): Video {
  return {
    id: 'video-1',
    title: 'Episódio sobre IA Generativa',
    description: 'Neste episódio discutimos os avanços de IA generativa',
    duration: 3600,
    publishedAt: mockTimestamp,
    videoType: 'episode',
    theme: 'Inteligência Artificial',
    ...overrides,
  } as Video
}

describe('ADWORDS_JSON_SCHEMA', () => {
  it('contains guide and keywords fields', () => {
    expect(ADWORDS_JSON_SCHEMA).toContain('"guide"')
    expect(ADWORDS_JSON_SCHEMA).toContain('"keywords"')
  })

  it('specifies JSON format instruction', () => {
    expect(ADWORDS_JSON_SCHEMA).toContain('JSON')
  })
})

describe('buildAdwordsSystemPrompt', () => {
  const promptConfig = {
    description: 'Crie um guia de otimização de tráfego pago para este episódio',
    expectedOutput: 'Guia detalhado com estratégias de Google Ads e keywords relevantes',
  }

  it('builds prompt with complete persona', () => {
    const persona = {
      role: 'Especialista em Google Ads',
      objective: 'Otimizar campanhas de tráfego pago',
      resume: '15 anos de experiência em Google Ads e SEO',
    }

    const result = buildAdwordsSystemPrompt(persona, promptConfig)

    expect(result).toContain('Seu papel: Especialista em Google Ads')
    expect(result).toContain('Seu objetivo: Otimizar campanhas de tráfego pago')
    expect(result).toContain('Seu contexto: 15 anos de experiência em Google Ads e SEO')
    expect(result).toContain('## TAREFA')
    expect(result).toContain('Crie um guia de otimização de tráfego pago para este episódio')
    expect(result).toContain('## RETORNO ESPERADO')
    expect(result).toContain('Guia detalhado com estratégias de Google Ads e keywords relevantes')
    expect(result).toContain(ADWORDS_JSON_SCHEMA)
  })

  it('builds prompt with undefined persona using empty strings', () => {
    const result = buildAdwordsSystemPrompt(undefined, promptConfig)

    expect(result).toContain('Seu papel: ')
    expect(result).toContain('Seu objetivo: ')
    expect(result).toContain('Seu contexto: ')
    expect(result).toContain('## TAREFA')
    expect(result).toContain(promptConfig.description)
  })

  it('appends additionalContext when provided', () => {
    const persona = { role: 'Ads', objective: 'Tráfego', resume: 'XP' }
    const result = buildAdwordsSystemPrompt(persona, promptConfig, 'Foque em remarketing')

    expect(result).toContain('Dê uma atenção especial a essa instrução: Foque em remarketing')
  })

  it('does not append additionalContext when not provided', () => {
    const persona = { role: 'Ads', objective: 'Tráfego', resume: 'XP' }
    const result = buildAdwordsSystemPrompt(persona, promptConfig)

    expect(result).not.toContain('Dê uma atenção especial')
  })

  it('includes JSON schema in system prompt', () => {
    const result = buildAdwordsSystemPrompt(undefined, promptConfig)

    expect(result).toContain('"guide"')
    expect(result).toContain('"keywords"')
  })
})

describe('buildAdwordsUserPrompt', () => {
  it('builds user prompt with video metadata', () => {
    const video = createVideo()
    const result = buildAdwordsUserPrompt(video)

    expect(result).toContain('**Título:** Episódio sobre IA Generativa')
    expect(result).toContain('**Descrição:** Neste episódio discutimos os avanços de IA generativa')
    expect(result).toContain('**Tema:** Inteligência Artificial')
  })

  it('handles missing optional fields gracefully', () => {
    const video = createVideo({
      description: undefined,
      theme: undefined,
    })

    const result = buildAdwordsUserPrompt(video)

    expect(result).toContain('**Título:** Episódio sobre IA Generativa')
    expect(result).toContain('**Descrição:** ')
    expect(result).toContain('**Tema:** ')
  })

  it('does not include parent video context (episodes only)', () => {
    const video = createVideo()
    const result = buildAdwordsUserPrompt(video)

    expect(result).not.toContain('derivado')
    expect(result).not.toContain('vídeo original')
  })

  it('does not include duration (not relevant for adwords)', () => {
    const video = createVideo()
    const result = buildAdwordsUserPrompt(video)

    expect(result).not.toContain('Duração')
  })
})
