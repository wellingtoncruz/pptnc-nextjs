import type { Persona, PromptField } from '@/types/podcast'
import type { Video } from '@/types/video'
import type { NewsletterNewsItem } from '@/types/newsletter'

/**
 * Fixed JSON schema included in every newsletter draft system prompt.
 * Instructs the LLM to return exactly { draft }.
 */
export const NEWSLETTER_DRAFT_JSON_SCHEMA = `Retorne sua resposta exclusivamente como JSON no seguinte formato:

{
  "draft": "Conteúdo da newsletter em formato markdown"
}`

/**
 * Build the system prompt for newsletter draft generation.
 *
 * Uses the writer persona and the episode-specific prompt config.
 * Falls back to empty strings if persona is undefined (graceful degradation).
 *
 * @param persona - The writer persona (may be undefined for unconfigured podcasts)
 * @param promptConfig - The episode newsletter.draft prompt (description + expectedOutput)
 * @param additionalContext - Optional user instruction to emphasize
 */
export function buildNewsletterDraftSystemPrompt(
  persona: Persona | undefined,
  promptConfig: PromptField,
  additionalContext?: string
): string {
  const role = persona?.role || ''
  const objective = persona?.objective || ''
  const resume = persona?.resume || ''

  let prompt = `Seu papel: ${role}
Seu objetivo: ${objective}
Seu contexto: ${resume}

## TAREFA
${promptConfig.description}

## RETORNO ESPERADO
${promptConfig.expectedOutput}

${NEWSLETTER_DRAFT_JSON_SCHEMA}`

  if (additionalContext) {
    prompt += `\n\nDê uma atenção especial a essa instrução do produtor:\n<user-instruction>${additionalContext}</user-instruction>`
  }

  return prompt
}

/**
 * Build the user prompt with video metadata for newsletter draft generation.
 *
 * Newsletter is episode-only. Includes title, description, theme, and guests.
 *
 * @param video - The episode being processed
 */
export function buildNewsletterDraftUserPrompt(video: Video): string {
  const guestNames = video.guests?.map((g) => g.name).join(', ') || ''

  return `**Título:** ${video.title}
**Descrição:** ${video.description || ''}
**Tema:** ${video.theme || ''}
**Convidados:** ${guestNames}`
}

/**
 * Fixed JSON schema included in every newsletter image system prompt.
 * Instructs the LLM to return exactly { imagePrompt }.
 */
export const NEWSLETTER_IMAGE_JSON_SCHEMA = `Retorne sua resposta exclusivamente como JSON no seguinte formato:

{
  "imagePrompt": "Descrição detalhada da imagem a ser gerada..."
}`

/**
 * Build the system prompt for newsletter image prompt generation (Chamada 1).
 *
 * Uses the writer persona and the episode-specific prompt config.
 * Falls back to empty strings if persona is undefined (graceful degradation).
 *
 * @param persona - The writer persona (may be undefined for unconfigured podcasts)
 * @param promptConfig - The episode newsletter.image prompt (description + expectedOutput)
 * @param additionalContext - Optional user instruction to emphasize
 */
export function buildNewsletterImageSystemPrompt(
  persona: Persona | undefined,
  promptConfig: PromptField,
  additionalContext?: string
): string {
  const role = persona?.role || ''
  const objective = persona?.objective || ''
  const resume = persona?.resume || ''

  let prompt = `Seu papel: ${role}
Seu objetivo: ${objective}
Seu contexto: ${resume}

## TAREFA
${promptConfig.description}

## RETORNO ESPERADO
${promptConfig.expectedOutput}

${NEWSLETTER_IMAGE_JSON_SCHEMA}`

  if (additionalContext) {
    prompt += `\n\nDê uma atenção especial a essa instrução do produtor:\n<user-instruction>${additionalContext}</user-instruction>`
  }

  return prompt
}

/**
 * Build the user prompt with draft and news for newsletter image prompt generation (Chamada 1).
 *
 * Includes the newsletter draft content and selected news titles
 * so the LLM can generate a relevant image prompt.
 *
 * @param draft - The newsletter draft text
 * @param news - Selected news items (optional)
 */
export function buildNewsletterImageUserPrompt(
  draft: string,
  news?: NewsletterNewsItem[]
): string {
  const newsTitles = news?.map((n) => `- ${n.title}`).join('\n') || 'Nenhuma notícia selecionada'

  return `## DRAFT DA NEWSLETTER
${draft}

## NOTÍCIAS SELECIONADAS
${newsTitles}

Gere um prompt descritivo para uma imagem de capa de newsletter sobre este conteúdo.`
}

/**
 * Fixed JSON schema included in every newsletter news selection system prompt.
 * Instructs the LLM to return exactly { selectedIds }.
 */
export const NEWSLETTER_NEWS_JSON_SCHEMA = `Retorne sua resposta exclusivamente como JSON no seguinte formato:

{
  "selectedIds": ["id1", "id2", "id3"]
}`

/**
 * Build the system prompt for newsletter news selection.
 *
 * Uses the writer persona and the episode-specific prompt config.
 * Falls back to empty strings if persona is undefined (graceful degradation).
 *
 * @param persona - The writer persona (may be undefined for unconfigured podcasts)
 * @param promptConfig - The episode newsletter.news prompt (description + expectedOutput)
 */
export function buildNewsletterNewsSystemPrompt(
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

${NEWSLETTER_NEWS_JSON_SCHEMA}`
}

/**
 * Build the user prompt with draft and news list for newsletter news selection.
 *
 * The LLM receives the newsletter draft and the full list of candidate news
 * to select the most relevant ones.
 *
 * @param draft - The newsletter draft text
 * @param newsList - Array of news items with id, titulo, and descricao
 */
export function buildNewsletterNewsUserPrompt(
  draft: string,
  newsList: Array<{ id: string; titulo: string; descricao: string }>
): string {
  const formattedNews = newsList
    .map((n) => `- [${n.id}] ${n.titulo}: ${n.descricao}`)
    .join('\n')

  return `## DRAFT DA NEWSLETTER
${draft}

## NOTÍCIAS CANDIDATAS
${formattedNews}`
}

/**
 * Fixed JSON schema included in every newsletter format system prompt.
 * Instructs the LLM to return exactly { report }.
 */
export const NEWSLETTER_FORMAT_JSON_SCHEMA = `Retorne sua resposta exclusivamente como JSON no seguinte formato:

{
  "report": "Relatório final formatado da newsletter em markdown"
}`

/**
 * Build the system prompt for newsletter format/report generation (Fase 4).
 *
 * Uses the writer persona and the editable prompt from the producer.
 * Falls back to empty strings if persona is undefined (graceful degradation).
 *
 * @param persona - The writer persona (may be undefined for unconfigured podcasts)
 * @param editablePrompt - The format prompt edited by the producer
 */
export function buildNewsletterFormatSystemPrompt(
  persona: Persona | undefined,
  editablePrompt: string
): string {
  const role = persona?.role || ''
  const objective = persona?.objective || ''
  const resume = persona?.resume || ''

  return `Seu papel: ${role}
Seu objetivo: ${objective}
Seu contexto: ${resume}

## TAREFA
<user-instruction>${editablePrompt}</user-instruction>

${NEWSLETTER_FORMAT_JSON_SCHEMA}`
}

/**
 * Build the user prompt with draft, news, and image URL for newsletter format generation (Fase 4).
 *
 * Includes the full newsletter draft, selected news items with details,
 * and the cover image URL for reference.
 *
 * Quando o produtor pula a Fase 2 (`newsSkipped`), a seção de notícias sai do prompt
 * e é substituída por uma instrução explícita de não gerar seção de notícias — a
 * instrução de formato do produtor normalmente pede uma, e sem essa contra-ordem o
 * LLM tende a inventar notícias ou a deixar uma seção vazia no relatório.
 *
 * @param draft - The newsletter draft text
 * @param news - Selected news items (optional)
 * @param imageUrl - The cover image URL for the report markdown (optional)
 * @param newsSkipped - Producer chose to publish this edition without news (optional)
 */
export function buildNewsletterFormatUserPrompt(
  draft: string,
  news?: NewsletterNewsItem[],
  imageUrl?: string,
  newsSkipped?: boolean
): string {
  let prompt = `## DRAFT DA NEWSLETTER
${draft}`

  if (newsSkipped) {
    prompt += `

## NOTÍCIAS
Esta edição da newsletter NÃO terá seção de notícias — decisão editorial do produtor.
Não inclua seção, título, lista ou qualquer menção a notícias no relatório final, mesmo
que as instruções de formato peçam. Não invente notícias.`
  } else {
    const newsSection = news && news.length > 0
      ? news.map((n) => {
          const parts = [`- ${n.title}`]
          if (n.source) parts[0] += ` (${n.source})`
          if (n.url) parts[0] += ` — ${n.url}`
          return parts[0]
        }).join('\n')
      : 'Nenhuma notícia selecionada'

    prompt += `

## NOTÍCIAS SELECIONADAS
${newsSection}`
  }

  if (imageUrl) {
    prompt += `\n\n## IMAGEM DE CAPA\nURL: ${imageUrl}`
  }

  return prompt
}
