import { formatDuration } from '@/lib/llm/interpolation'
import type { Persona, PromptField } from '@/types/podcast'
import type { Video } from '@/types/video'

/**
 * Fixed JSON schema included in every social post system prompt.
 * Instructs the LLM to return exactly { cta, body, hashtags }.
 */
export const SOCIAL_POST_JSON_SCHEMA = `Retorne sua resposta exclusivamente como JSON no seguinte formato:

{
  "cta": "Call to Action curto e impactante para a rede social",
  "body": "Corpo do post, otimizado para a plataforma",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`

/**
 * Build the system prompt for social post generation.
 *
 * Uses the socialmedia persona and the network-specific prompt config.
 * Falls back to empty strings if persona is undefined (graceful degradation).
 *
 * @param persona - The socialmedia persona (may be undefined for unconfigured podcasts)
 * @param promptConfig - The network-specific prompt (description + expectedOutput)
 * @param additionalContext - Optional user instruction to emphasize
 */
export function buildSocialSystemPrompt(
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

## Formato
${promptConfig.expectedOutput}

${SOCIAL_POST_JSON_SCHEMA}`

  if (additionalContext) {
    prompt += `\n\nDê uma atenção especial a essa instrução: ${additionalContext}`
  }

  return prompt
}

/**
 * Build the user prompt with video metadata for social post generation.
 *
 * For cut/reel with a parent video, includes parent episode context.
 *
 * @param video - The video being processed
 * @param parentVideo - The parent episode (for cut/reel only)
 */
export function buildSocialUserPrompt(video: Video, parentVideo?: Video | null): string {
  let prompt = `**Título original:** ${video.title}
**Duração:** ${formatDuration(video.duration)}
**Descrição:** ${video.description || ''}
**Tipo:** ${video.videoType || 'episode'}
**Tema:** ${video.theme || ''}`

  if (parentVideo && (video.videoType === 'cut' || video.videoType === 'reel')) {
    prompt += `

## Esse vídeo é derivado (corte) do vídeo original:

**Título original:** ${parentVideo.title}
**Duração:** ${formatDuration(parentVideo.duration)}
**Descrição:** ${parentVideo.description || ''}
**Tipo:** ${parentVideo.videoType || 'episode'}
**Tema:** ${parentVideo.theme || ''}`
  }

  return prompt
}

/**
 * Determine if transcription should be attached for this video type.
 *
 * Cut and reel videos have short transcriptions (low token cost) that enrich
 * the social post context. Episodes have long transcriptions where the cost
 * doesn't justify the benefit for social post generation.
 *
 * @param video - The video to check
 * @returns true if transcription should be attached as file
 */
export function shouldAttachTranscription(video: Video): boolean {
  return (video.videoType === 'cut' || video.videoType === 'reel') && !!video.transcriptionTXT
}
