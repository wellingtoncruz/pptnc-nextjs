import { describe, expect, it } from 'vitest'

import {
  NEWSLETTER_DRAFT_JSON_SCHEMA,
  NEWSLETTER_FORMAT_JSON_SCHEMA,
  NEWSLETTER_IMAGE_JSON_SCHEMA,
  NEWSLETTER_NEWS_JSON_SCHEMA,
  buildNewsletterDraftSystemPrompt,
  buildNewsletterDraftUserPrompt,
  buildNewsletterFormatSystemPrompt,
  buildNewsletterFormatUserPrompt,
  buildNewsletterImageSystemPrompt,
  buildNewsletterImageUserPrompt,
  buildNewsletterNewsSystemPrompt,
  buildNewsletterNewsUserPrompt,
} from './newsletter-prompts'

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
    guests: [
      { name: 'João Silva', role: 'Especialista em IA' },
    ],
    ...overrides,
  } as Video
}

describe('NEWSLETTER_DRAFT_JSON_SCHEMA', () => {
  it('contains draft field', () => {
    expect(NEWSLETTER_DRAFT_JSON_SCHEMA).toContain('"draft"')
  })

  it('specifies JSON format instruction', () => {
    expect(NEWSLETTER_DRAFT_JSON_SCHEMA).toContain('JSON')
  })
})

describe('buildNewsletterDraftSystemPrompt', () => {
  const promptConfig = {
    description: 'Crie o corpo da newsletter baseado na transcrição do episódio',
    expectedOutput: 'Texto da newsletter em formato markdown com seções claras',
  }

  it('builds prompt with complete persona', () => {
    const persona = {
      role: 'Redator de newsletters',
      objective: 'Criar newsletters engajantes',
      resume: '10 anos de experiência em jornalismo digital',
    }

    const result = buildNewsletterDraftSystemPrompt(persona, promptConfig)

    expect(result).toContain('Seu papel: Redator de newsletters')
    expect(result).toContain('Seu objetivo: Criar newsletters engajantes')
    expect(result).toContain('Seu contexto: 10 anos de experiência em jornalismo digital')
    expect(result).toContain('## TAREFA')
    expect(result).toContain('Crie o corpo da newsletter baseado na transcrição do episódio')
    expect(result).toContain('## RETORNO ESPERADO')
    expect(result).toContain('Texto da newsletter em formato markdown com seções claras')
    expect(result).toContain(NEWSLETTER_DRAFT_JSON_SCHEMA)
  })

  it('builds prompt with undefined persona using empty strings', () => {
    const result = buildNewsletterDraftSystemPrompt(undefined, promptConfig)

    expect(result).toContain('Seu papel: ')
    expect(result).toContain('Seu objetivo: ')
    expect(result).toContain('Seu contexto: ')
    expect(result).toContain('## TAREFA')
    expect(result).toContain(promptConfig.description)
  })

  it('appends additionalContext when provided', () => {
    const persona = { role: 'Writer', objective: 'Newsletters', resume: 'XP' }
    const result = buildNewsletterDraftSystemPrompt(persona, promptConfig, 'Foque nos highlights técnicos')

    expect(result).toContain('<user-instruction>Foque nos highlights técnicos</user-instruction>')
  })

  it('does not append additionalContext when not provided', () => {
    const persona = { role: 'Writer', objective: 'Newsletters', resume: 'XP' }
    const result = buildNewsletterDraftSystemPrompt(persona, promptConfig)

    expect(result).not.toContain('Dê uma atenção especial')
  })

  it('includes JSON schema in system prompt', () => {
    const result = buildNewsletterDraftSystemPrompt(undefined, promptConfig)

    expect(result).toContain('"draft"')
  })
})

describe('buildNewsletterDraftUserPrompt', () => {
  it('builds user prompt with video metadata including guests', () => {
    const video = createVideo()
    const result = buildNewsletterDraftUserPrompt(video)

    expect(result).toContain('**Título:** Episódio sobre IA Generativa')
    expect(result).toContain('**Descrição:** Neste episódio discutimos os avanços de IA generativa')
    expect(result).toContain('**Tema:** Inteligência Artificial')
    expect(result).toContain('**Convidados:** João Silva')
  })

  it('handles missing optional fields gracefully', () => {
    const video = createVideo({
      description: undefined,
      theme: undefined,
      guests: undefined,
    })

    const result = buildNewsletterDraftUserPrompt(video)

    expect(result).toContain('**Título:** Episódio sobre IA Generativa')
    expect(result).toContain('**Descrição:** ')
    expect(result).toContain('**Tema:** ')
    expect(result).toContain('**Convidados:** ')
  })

  it('joins multiple guest names with comma', () => {
    const video = createVideo({
      guests: [
        { name: 'João Silva', role: 'Eng' },
        { name: 'Maria Santos', role: 'PM' },
      ],
    })

    const result = buildNewsletterDraftUserPrompt(video)

    expect(result).toContain('**Convidados:** João Silva, Maria Santos')
  })
})

describe('NEWSLETTER_NEWS_JSON_SCHEMA', () => {
  it('contains selectedIds field', () => {
    expect(NEWSLETTER_NEWS_JSON_SCHEMA).toContain('"selectedIds"')
  })

  it('specifies JSON format instruction', () => {
    expect(NEWSLETTER_NEWS_JSON_SCHEMA).toContain('JSON')
  })
})

describe('buildNewsletterNewsSystemPrompt', () => {
  const promptConfig = {
    description: 'Selecione as notícias mais relevantes para a newsletter',
    expectedOutput: 'Lista dos IDs das 10 notícias mais aderentes ao conteúdo',
  }

  it('builds prompt with complete persona', () => {
    const persona = {
      role: 'Curador de notícias',
      objective: 'Selecionar as melhores notícias',
      resume: 'Jornalista com 15 anos de experiência',
    }

    const result = buildNewsletterNewsSystemPrompt(persona, promptConfig)

    expect(result).toContain('Seu papel: Curador de notícias')
    expect(result).toContain('Seu objetivo: Selecionar as melhores notícias')
    expect(result).toContain('Seu contexto: Jornalista com 15 anos de experiência')
    expect(result).toContain('## TAREFA')
    expect(result).toContain(promptConfig.description)
    expect(result).toContain('## RETORNO ESPERADO')
    expect(result).toContain(promptConfig.expectedOutput)
    expect(result).toContain(NEWSLETTER_NEWS_JSON_SCHEMA)
  })

  it('builds prompt with undefined persona using empty strings', () => {
    const result = buildNewsletterNewsSystemPrompt(undefined, promptConfig)

    expect(result).toContain('Seu papel: ')
    expect(result).toContain('Seu objetivo: ')
    expect(result).toContain('Seu contexto: ')
    expect(result).toContain('## TAREFA')
  })

  it('includes JSON schema with selectedIds in system prompt', () => {
    const result = buildNewsletterNewsSystemPrompt(undefined, promptConfig)

    expect(result).toContain('"selectedIds"')
  })
})

describe('NEWSLETTER_IMAGE_JSON_SCHEMA', () => {
  it('contains imagePrompt field', () => {
    expect(NEWSLETTER_IMAGE_JSON_SCHEMA).toContain('"imagePrompt"')
  })

  it('specifies JSON format instruction', () => {
    expect(NEWSLETTER_IMAGE_JSON_SCHEMA).toContain('JSON')
  })
})

describe('buildNewsletterImageSystemPrompt', () => {
  const promptConfig = {
    description: 'Gere um prompt descritivo para a imagem de capa',
    expectedOutput: 'Um prompt detalhado para geração de imagem',
  }

  it('builds prompt with complete persona and config', () => {
    const persona = {
      role: 'Designer',
      objective: 'Criar imagens atrativas',
      resume: '5 anos de design gráfico',
    }

    const result = buildNewsletterImageSystemPrompt(persona, promptConfig)

    expect(result).toContain('Seu papel: Designer')
    expect(result).toContain('Seu objetivo: Criar imagens atrativas')
    expect(result).toContain('Seu contexto: 5 anos de design gráfico')
    expect(result).toContain('## TAREFA')
    expect(result).toContain(promptConfig.description)
    expect(result).toContain('## RETORNO ESPERADO')
    expect(result).toContain(promptConfig.expectedOutput)
    expect(result).toContain(NEWSLETTER_IMAGE_JSON_SCHEMA)
  })

  it('builds prompt with undefined persona using empty strings', () => {
    const result = buildNewsletterImageSystemPrompt(undefined, promptConfig)

    expect(result).toContain('Seu papel: ')
    expect(result).toContain('Seu objetivo: ')
    expect(result).toContain('Seu contexto: ')
    expect(result).toContain('## TAREFA')
  })

  it('appends additionalContext when provided', () => {
    const persona = { role: 'Writer', objective: 'Newsletters', resume: 'XP' }
    const result = buildNewsletterImageSystemPrompt(persona, promptConfig, 'Use tons de azul')

    expect(result).toContain('<user-instruction>Use tons de azul</user-instruction>')
  })

  it('does not append additionalContext when not provided', () => {
    const result = buildNewsletterImageSystemPrompt(undefined, promptConfig)

    expect(result).not.toContain('Dê uma atenção especial')
  })
})

describe('buildNewsletterImageUserPrompt', () => {
  it('includes draft content', () => {
    const result = buildNewsletterImageUserPrompt('# Newsletter\n\nConteúdo sobre IA...')

    expect(result).toContain('# Newsletter')
    expect(result).toContain('Conteúdo sobre IA...')
  })

  it('includes news titles when provided', () => {
    const news = [
      { id: 'n1', title: 'OpenAI lança GPT-5' },
      { id: 'n2', title: 'Google anuncia Gemini 3' },
    ]

    const result = buildNewsletterImageUserPrompt('Draft text', news)

    expect(result).toContain('OpenAI lança GPT-5')
    expect(result).toContain('Google anuncia Gemini 3')
  })

  it('shows fallback text when no news provided', () => {
    const result = buildNewsletterImageUserPrompt('Draft text')

    expect(result).toContain('Nenhuma notícia selecionada')
  })

  it('contains image generation instruction', () => {
    const result = buildNewsletterImageUserPrompt('Draft')

    expect(result).toContain('imagem de capa de newsletter')
  })
})

describe('buildNewsletterNewsUserPrompt', () => {
  it('includes draft text', () => {
    const result = buildNewsletterNewsUserPrompt('Draft da newsletter sobre IA', [])

    expect(result).toContain('Draft da newsletter sobre IA')
  })

  it('includes news list with id, titulo, and descricao', () => {
    const news = [
      { id: 'n1', titulo: 'OpenAI lança GPT-5', descricao: 'Nova versão do modelo' },
      { id: 'n2', titulo: 'Google anuncia Gemini 2', descricao: 'Atualização do Gemini' },
    ]

    const result = buildNewsletterNewsUserPrompt('Draft text', news)

    expect(result).toContain('n1')
    expect(result).toContain('OpenAI lança GPT-5')
    expect(result).toContain('Nova versão do modelo')
    expect(result).toContain('n2')
    expect(result).toContain('Google anuncia Gemini 2')
    expect(result).toContain('Atualização do Gemini')
  })

  it('handles empty news list', () => {
    const result = buildNewsletterNewsUserPrompt('Draft text', [])

    expect(result).toContain('Draft text')
  })
})

describe('NEWSLETTER_FORMAT_JSON_SCHEMA', () => {
  it('contains report field', () => {
    expect(NEWSLETTER_FORMAT_JSON_SCHEMA).toContain('"report"')
  })

  it('specifies JSON format instruction', () => {
    expect(NEWSLETTER_FORMAT_JSON_SCHEMA).toContain('JSON')
  })
})

describe('buildNewsletterFormatSystemPrompt', () => {
  it('builds prompt with complete persona and editable prompt', () => {
    const persona = {
      role: 'Redator de newsletters',
      objective: 'Criar newsletters engajantes',
      resume: '10 anos de experiência em jornalismo digital',
    }

    const result = buildNewsletterFormatSystemPrompt(persona, 'Formate a newsletter final com seções claras')

    expect(result).toContain('Seu papel: Redator de newsletters')
    expect(result).toContain('Seu objetivo: Criar newsletters engajantes')
    expect(result).toContain('Seu contexto: 10 anos de experiência em jornalismo digital')
    expect(result).toContain('## TAREFA')
    expect(result).toContain('Formate a newsletter final com seções claras')
    expect(result).toContain(NEWSLETTER_FORMAT_JSON_SCHEMA)
  })

  it('builds prompt with undefined persona using empty strings', () => {
    const result = buildNewsletterFormatSystemPrompt(undefined, 'Formate a newsletter')

    expect(result).toContain('Seu papel: ')
    expect(result).toContain('Seu objetivo: ')
    expect(result).toContain('Seu contexto: ')
    expect(result).toContain('## TAREFA')
    expect(result).toContain('Formate a newsletter')
  })

  it('includes editable prompt in the body', () => {
    const result = buildNewsletterFormatSystemPrompt(undefined, 'Meu prompt customizado pelo produtor')

    expect(result).toContain('Meu prompt customizado pelo produtor')
  })

  it('includes JSON schema with report field', () => {
    const result = buildNewsletterFormatSystemPrompt(undefined, 'test')

    expect(result).toContain('"report"')
  })
})

describe('buildNewsletterFormatUserPrompt', () => {
  it('includes draft content', () => {
    const result = buildNewsletterFormatUserPrompt('# Newsletter\n\nConteúdo sobre IA...')

    expect(result).toContain('## DRAFT DA NEWSLETTER')
    expect(result).toContain('# Newsletter')
    expect(result).toContain('Conteúdo sobre IA...')
  })

  it('includes news with title and source', () => {
    const news = [
      { id: 'n1', title: 'OpenAI lança GPT-5', source: 'TechCrunch' },
      { id: 'n2', title: 'Google anuncia Gemini 3', source: 'Verge', url: 'https://verge.com/gemini' },
    ]

    const result = buildNewsletterFormatUserPrompt('Draft text', news)

    expect(result).toContain('## NOTÍCIAS SELECIONADAS')
    expect(result).toContain('OpenAI lança GPT-5 (TechCrunch)')
    expect(result).toContain('Google anuncia Gemini 3 (Verge) — https://verge.com/gemini')
  })

  it('shows fallback text when no news provided', () => {
    const result = buildNewsletterFormatUserPrompt('Draft text')

    expect(result).toContain('Nenhuma notícia selecionada')
  })

  it('shows fallback text when news is empty array', () => {
    const result = buildNewsletterFormatUserPrompt('Draft text', [])

    expect(result).toContain('Nenhuma notícia selecionada')
  })

  it('includes imageUrl when provided', () => {
    const result = buildNewsletterFormatUserPrompt('Draft', undefined, 'newsletters/video-1/cover.png')

    expect(result).toContain('## IMAGEM DE CAPA')
    expect(result).toContain('URL: newsletters/video-1/cover.png')
  })

  it('omits image section when imageUrl not provided', () => {
    const result = buildNewsletterFormatUserPrompt('Draft')

    expect(result).not.toContain('## IMAGEM DE CAPA')
  })
})
