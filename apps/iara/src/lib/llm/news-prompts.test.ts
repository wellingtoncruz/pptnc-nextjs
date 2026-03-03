import { describe, expect, it } from 'vitest'

import { buildNewsSocialSystemPrompt, buildNewsSocialUserPrompt, buildNewsImagePrompt } from './news-prompts'

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

// ==========================================================================
// Story 18.9 — buildNewsImagePrompt
// ==========================================================================

describe('buildNewsImagePrompt (Story 18.9)', () => {
  const news = {
    titulo: 'IA revoluciona mercado',
    descricao: 'Novas ferramentas de IA surgem',
    comentarios: 'Especialistas comentam o impacto',
  }

  const promptConfig = {
    description: 'Gere uma imagem ilustrativa para a notícia',
    expectedOutput: 'Uma imagem PNG com estilo editorial',
  }

  it('includes all news fields', () => {
    const result = buildNewsImagePrompt(news, promptConfig)

    expect(result).toContain('Título: IA revoluciona mercado')
    expect(result).toContain('Descrição: Novas ferramentas de IA surgem')
    expect(result).toContain('Comentários: Especialistas comentam o impacto')
  })

  it('includes prompt config description and expectedOutput', () => {
    const result = buildNewsImagePrompt(news, promptConfig)

    expect(result).toContain('# Tarefa')
    expect(result).toContain('Gere uma imagem ilustrativa para a notícia')
    expect(result).toContain('# Retorno esperado')
    expect(result).toContain('Uma imagem PNG com estilo editorial')
  })

  it('includes additionalContext when provided', () => {
    const result = buildNewsImagePrompt(news, promptConfig, 'Use tons de azul')

    expect(result).toContain('# Instruções Adicionais')
    expect(result).toContain('Use tons de azul')
  })

  it('omits additionalContext section when undefined', () => {
    const result = buildNewsImagePrompt(news, promptConfig)

    expect(result).not.toContain('# Instruções Adicionais')
  })

  it('omits additionalContext section when empty string', () => {
    const result = buildNewsImagePrompt(news, promptConfig, '')

    expect(result).not.toContain('# Instruções Adicionais')
  })
})
