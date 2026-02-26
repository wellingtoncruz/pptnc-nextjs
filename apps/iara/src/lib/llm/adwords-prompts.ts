import type { Persona, PromptField } from '@/types/podcast'
import type { Video } from '@/types/video'

/**
 * Fixed JSON schema included in every adwords system prompt.
 * Instructs the LLM to return exactly { guide, keywords }.
 */
export const ADWORDS_JSON_SCHEMA = `Retorne sua resposta exclusivamente como JSON no seguinte formato:

{
  "guide": "Guia completo de otimização de tráfego pago em formato markdown",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`

/**
 * Build the system prompt for AdWords guide generation.
 *
 * Uses the adwords persona and the episode-specific prompt config.
 * Falls back to empty strings if persona is undefined (graceful degradation).
 *
 * @param persona - The adwords persona (may be undefined for unconfigured podcasts)
 * @param promptConfig - The episode adwords prompt (description + expectedOutput)
 * @param additionalContext - Optional user instruction to emphasize
 */
export function buildAdwordsSystemPrompt(
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

${ADWORDS_JSON_SCHEMA}`

  if (additionalContext) {
    prompt += `\n\nDê uma atenção especial a essa instrução: ${additionalContext}`
  }

  return prompt
}

/**
 * Build the user prompt with video metadata for AdWords guide generation.
 *
 * AdWords is episode-only — no parent video context needed.
 * Includes title, description, and theme (duration not relevant for ads).
 *
 * @param video - The episode being processed
 */
export function buildAdwordsUserPrompt(video: Video): string {
  return `**Título:** ${video.title}
**Descrição:** ${video.description || ''}
**Tema:** ${video.theme || ''}`
}
