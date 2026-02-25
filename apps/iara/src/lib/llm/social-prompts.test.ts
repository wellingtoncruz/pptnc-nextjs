import { describe, expect, it } from 'vitest'

import {
  buildSocialSystemPrompt,
  buildSocialUserPrompt,
  shouldAttachTranscription,
  SOCIAL_POST_JSON_SCHEMA,
} from './social-prompts'

import type { Video } from '@/types/video'

// Helpers
const mockTimestamp = { toDate: () => new Date(), toMillis: () => Date.now(), seconds: 1700000000, nanoseconds: 0 }

function createVideo(overrides?: Partial<Video>): Video {
  return {
    id: 'video-1',
    title: 'Test Episode Title',
    description: 'A great episode about testing',
    duration: 3600,
    publishedAt: mockTimestamp,
    videoType: 'episode',
    theme: 'Software Testing',
    ...overrides,
  } as Video
}

describe('SOCIAL_POST_JSON_SCHEMA', () => {
  it('contains cta, body, and hashtags fields', () => {
    expect(SOCIAL_POST_JSON_SCHEMA).toContain('"cta"')
    expect(SOCIAL_POST_JSON_SCHEMA).toContain('"body"')
    expect(SOCIAL_POST_JSON_SCHEMA).toContain('"hashtags"')
  })
})

describe('buildSocialSystemPrompt', () => {
  const promptConfig = {
    description: 'Crie um post para Instagram sobre este episódio',
    expectedOutput: 'Post otimizado para Instagram com hashtags relevantes',
  }

  it('builds prompt with complete persona', () => {
    const persona = {
      role: 'Gerente de Mídia Social',
      objective: 'Criar posts engajadores',
      resume: '10 anos de experiência em social media',
    }

    const result = buildSocialSystemPrompt(persona, promptConfig)

    expect(result).toContain('Seu papel: Gerente de Mídia Social')
    expect(result).toContain('Seu objetivo: Criar posts engajadores')
    expect(result).toContain('Seu contexto: 10 anos de experiência em social media')
    expect(result).toContain('## TAREFA')
    expect(result).toContain('Crie um post para Instagram sobre este episódio')
    expect(result).toContain('## Formato')
    expect(result).toContain('Post otimizado para Instagram com hashtags relevantes')
    expect(result).toContain(SOCIAL_POST_JSON_SCHEMA)
  })

  it('builds prompt with undefined persona using empty strings', () => {
    const result = buildSocialSystemPrompt(undefined, promptConfig)

    expect(result).toContain('Seu papel: ')
    expect(result).toContain('Seu objetivo: ')
    expect(result).toContain('Seu contexto: ')
    expect(result).toContain('## TAREFA')
    expect(result).toContain(promptConfig.description)
  })

  it('appends additionalContext when provided', () => {
    const persona = { role: 'SM', objective: 'Posts', resume: 'XP' }
    const result = buildSocialSystemPrompt(persona, promptConfig, 'Foque em humor')

    expect(result).toContain('Dê uma atenção especial a essa instrução: Foque em humor')
  })

  it('does not append additionalContext when not provided', () => {
    const persona = { role: 'SM', objective: 'Posts', resume: 'XP' }
    const result = buildSocialSystemPrompt(persona, promptConfig)

    expect(result).not.toContain('Dê uma atenção especial')
  })

  it('includes JSON schema in system prompt', () => {
    const result = buildSocialSystemPrompt(undefined, promptConfig)

    expect(result).toContain('"cta"')
    expect(result).toContain('"body"')
    expect(result).toContain('"hashtags"')
  })
})

describe('buildSocialUserPrompt', () => {
  it('builds user prompt for episode without parent', () => {
    const video = createVideo({ duration: 5025 })
    const result = buildSocialUserPrompt(video)

    expect(result).toContain('**Título original:** Test Episode Title')
    expect(result).toContain('**Duração:** 1h 23m 45s')
    expect(result).toContain('**Descrição:** A great episode about testing')
    expect(result).toContain('**Tipo:** episode')
    expect(result).toContain('**Tema:** Software Testing')
    expect(result).not.toContain('derivado (corte)')
  })

  it('builds user prompt for cut with parent video', () => {
    const video = createVideo({
      videoType: 'cut',
      title: 'Best Moment',
      duration: 300,
      description: 'A highlight clip',
      theme: 'Highlights',
      parentEpisodeId: 'parent-1',
    })
    const parent = createVideo({
      title: 'Full Episode',
      duration: 3600,
      description: 'The full episode',
      theme: 'Deep Dive',
    })

    const result = buildSocialUserPrompt(video, parent)

    expect(result).toContain('**Título original:** Best Moment')
    expect(result).toContain('**Duração:** 5m')
    expect(result).toContain('**Tipo:** cut')
    expect(result).toContain('derivado (corte) do vídeo original')
    expect(result).toContain('**Título original:** Full Episode')
    expect(result).toContain('**Duração:** 1h')
  })

  it('builds user prompt for reel without parentEpisodeId', () => {
    const video = createVideo({
      videoType: 'reel',
      title: 'Quick Tip',
      duration: 60,
      description: 'A short reel',
      theme: 'Tips',
    })

    const result = buildSocialUserPrompt(video)

    expect(result).toContain('**Título original:** Quick Tip')
    expect(result).toContain('**Duração:** 1m')
    expect(result).toContain('**Tipo:** reel')
    expect(result).not.toContain('derivado (corte)')
  })

  it('builds user prompt for reel with parent video', () => {
    const video = createVideo({
      videoType: 'reel',
      title: 'Quick Reel',
      duration: 45,
      description: 'A fast reel',
      theme: 'Tips',
      parentEpisodeId: 'parent-1',
    })
    const parent = createVideo({
      title: 'Full Episode',
      duration: 3600,
      description: 'The full episode',
      theme: 'Deep Dive',
    })

    const result = buildSocialUserPrompt(video, parent)

    expect(result).toContain('**Título original:** Quick Reel')
    expect(result).toContain('**Tipo:** reel')
    expect(result).toContain('derivado (corte) do vídeo original')
    expect(result).toContain('**Título original:** Full Episode')
  })

  it('handles missing optional fields gracefully', () => {
    const video = createVideo({
      description: undefined,
      theme: undefined,
      videoType: undefined,
    })

    const result = buildSocialUserPrompt(video)

    expect(result).toContain('**Descrição:** ')
    expect(result).toContain('**Tipo:** episode')
    expect(result).toContain('**Tema:** ')
  })
})

describe('shouldAttachTranscription', () => {
  it('returns false for episode', () => {
    const video = createVideo({ videoType: 'episode', transcriptionTXT: 'some text' })
    expect(shouldAttachTranscription(video)).toBe(false)
  })

  it('returns true for cut with transcriptionTXT', () => {
    const video = createVideo({ videoType: 'cut', transcriptionTXT: 'some text' })
    expect(shouldAttachTranscription(video)).toBe(true)
  })

  it('returns true for reel with transcriptionTXT', () => {
    const video = createVideo({ videoType: 'reel', transcriptionTXT: 'some text' })
    expect(shouldAttachTranscription(video)).toBe(true)
  })

  it('returns false for cut without transcriptionTXT', () => {
    const video = createVideo({ videoType: 'cut', transcriptionTXT: undefined })
    expect(shouldAttachTranscription(video)).toBe(false)
  })

  it('returns false for reel without transcriptionTXT', () => {
    const video = createVideo({ videoType: 'reel', transcriptionTXT: undefined })
    expect(shouldAttachTranscription(video)).toBe(false)
  })

  it('returns false for undefined videoType', () => {
    const video = createVideo({ videoType: undefined, transcriptionTXT: 'some text' })
    expect(shouldAttachTranscription(video)).toBe(false)
  })
})
