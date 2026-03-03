import { describe, expect, it } from 'vitest'

import { buildNewsSocialSystemPrompt, buildNewsSocialUserPrompt } from './news-prompts'

describe('buildNewsSocialSystemPrompt', () => {
  const persona = {
    role: 'Redator Sênior',
    objective: 'Criar textos engajantes',
    resume: '10 anos de experiência',
  }

  const promptConfig = {
    description: 'Escreva um post para redes sociais',
    expectedOutput: 'Um texto curto e engajante',
  }

  it('builds system prompt with persona and prompt config', () => {
    const result = buildNewsSocialSystemPrompt(persona, promptConfig)

    expect(result).toContain('Seu papel: Redator Sênior')
    expect(result).toContain('Seu objetivo: Criar textos engajantes')
    expect(result).toContain('Seu contexto: 10 anos de experiência')
    expect(result).toContain('Escreva um post para redes sociais')
    expect(result).toContain('Um texto curto e engajante')
    expect(result).toContain('"social"')
  })

  it('handles undefined persona gracefully', () => {
    const result = buildNewsSocialSystemPrompt(undefined, promptConfig)

    expect(result).toContain('Seu papel: ')
    expect(result).toContain('Escreva um post para redes sociais')
  })
})

describe('buildNewsSocialUserPrompt', () => {
  const news = {
    titulo: 'IA revoluciona mercado',
    descricao: 'Novas ferramentas de IA surgem',
    comentarios: 'Especialistas comentam',
  }

  const video = {
    title: 'PPT Não Compila #100',
    description: 'Episódio sobre IA',
  }

  it('builds user prompt with news and video data', () => {
    const result = buildNewsSocialUserPrompt(news, video)

    expect(result).toContain('IA revoluciona mercado')
    expect(result).toContain('Novas ferramentas de IA surgem')
    expect(result).toContain('Especialistas comentam')
    expect(result).toContain('PPT Não Compila #100')
    expect(result).toContain('Episódio sobre IA')
  })

  it('handles empty optional fields', () => {
    const result = buildNewsSocialUserPrompt(
      { titulo: 'Título', descricao: '', comentarios: '' },
      { title: 'Video', description: '' }
    )

    expect(result).toContain('Título')
    expect(result).toContain('Video')
  })

  it('appends additionalContext section when provided', () => {
    const result = buildNewsSocialUserPrompt(news, video, 'Foque no impacto econômico')

    expect(result).toContain('# Instruções Adicionais do Produtor')
    expect(result).toContain('Foque no impacto econômico')
  })

  it('does not append additionalContext section when undefined', () => {
    const result = buildNewsSocialUserPrompt(news, video)

    expect(result).not.toContain('# Instruções Adicionais do Produtor')
  })

  it('does not append additionalContext section when empty string', () => {
    const result = buildNewsSocialUserPrompt(news, video, '')

    expect(result).not.toContain('# Instruções Adicionais do Produtor')
  })
})
