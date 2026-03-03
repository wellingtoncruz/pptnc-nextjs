/**
 * Prompt builders for news social post generation.
 *
 * Builds system and user prompts for generating social media posts
 * that combine a news item with a related podcast episode.
 *
 * @see Story 18.4 — Redação Social LLM + Invalidação + API
 */

import type { Persona, PromptField } from '@/types/podcast'

/**
 * JSON schema instruction for news social LLM response.
 */
const NEWS_SOCIAL_JSON_SCHEMA = `Retorne sua resposta exclusivamente como JSON no seguinte formato:

{
  "social": "Texto do post para redes sociais"
}`

/**
 * Builds the system prompt for news social post generation.
 *
 * @param persona - The writer persona (may be undefined)
 * @param promptConfig - The news_social prompt config (description + expectedOutput)
 */
export function buildNewsSocialSystemPrompt(
  persona: Persona | undefined,
  promptConfig: PromptField
): string {
  const role = persona?.role || ''
  const objective = persona?.objective || ''
  const resume = persona?.resume || ''

  return `Seu papel: ${role}
Seu objetivo: ${objective}
Seu contexto: ${resume}

## TAREFA
${promptConfig.description}

## RETORNO ESPERADO
${promptConfig.expectedOutput}

${NEWS_SOCIAL_JSON_SCHEMA}`
}

/**
 * Builds the user prompt with news and video data.
 *
 * @param news - News fields (titulo, descricao, comentarios)
 * @param video - Video fields (title, description)
 */
export function buildNewsSocialUserPrompt(
  news: { titulo: string; descricao: string; comentarios: string },
  video: { title: string; description: string },
  additionalContext?: string
): string {
  let prompt = `# Notícia
Título: ${news.titulo}
Descrição: ${news.descricao}
Comentários: ${news.comentarios}

# Video
Título: ${video.title}
Descrição: ${video.description}`

  if (additionalContext) {
    prompt += `\n\n# Instruções Adicionais do Produtor\n${additionalContext}`
  }

  return prompt
}
