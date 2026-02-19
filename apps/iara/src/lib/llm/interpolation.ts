import type { WizardPhase } from '@/lib/wizard'
import type { Video } from '@/types/video'

import type { PromptVariables } from './types'

/**
 * Format duration in seconds to human-readable string.
 * Examples: "1h 23m 45s", "45m 30s", "2m 15s"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts: string[] = []

  if (hours > 0) {
    parts.push(`${hours}h`)
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`)
  }

  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}s`)
  }

  return parts.join(' ')
}

/**
 * Format guests array to human-readable string.
 */
export function formatGuests(guests: Video['guests']): string {
  if (!guests || guests.length === 0) {
    return 'Nenhum convidado informado'
  }

  return guests
    .map((guest, index) => {
      const parts = [`${index + 1}. **${guest.name}**`]

      if (guest.role && guest.company) {
        parts.push(`${guest.role} na ${guest.company}`)
      } else if (guest.role) {
        parts.push(guest.role)
      } else if (guest.company) {
        parts.push(guest.company)
      }

      if (guest.linkedin) {
        parts.push(`[LinkedIn](${guest.linkedin})`)
      }

      return parts.join(' - ')
    })
    .join('\n')
}

/**
 * Truncate transcript to a maximum length.
 * Useful for phases that don't need the full transcript.
 */
export function truncateTranscript(transcript: string, maxChars = 50000): string {
  if (transcript.length <= maxChars) {
    return transcript
  }

  // Truncate at a sentence boundary if possible
  const truncated = transcript.slice(0, maxChars)
  const lastPeriod = truncated.lastIndexOf('.')

  if (lastPeriod > maxChars * 0.8) {
    return truncated.slice(0, lastPeriod + 1) + '\n\n[... transcrição truncada ...]'
  }

  return truncated + '\n\n[... transcrição truncada ...]'
}

/**
 * Extract variables from a video for prompt interpolation.
 */
export function extractVariables(
  video: Video,
  previousPhaseData?: Record<string, unknown>,
  additionalContext?: string,
  hostName?: string
): PromptVariables {
  return {
    title: video.title,
    transcript: video.transcriptionSRT || video.transcriptionTXT || '',
    duration: formatDuration(video.duration),
    theme: video.theme || '',
    guests: formatGuests(video.guests),
    previousPhaseData: previousPhaseData ? JSON.stringify(previousPhaseData, null, 2) : '',
    videoType: video.videoType || 'episode',
    hostName: hostName || 'Não informado',
  }
}

/**
 * Interpolate variables into a prompt template.
 * Replaces {variableName} with actual values.
 */
export function interpolatePrompt(
  template: string,
  variables: PromptVariables,
  additionalContext?: string
): string {
  let result = template

  // Replace all variable placeholders
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`
    result = result.replaceAll(placeholder, value || '')
  }

  // Replace additional context placeholder
  if (additionalContext) {
    result = result.replaceAll('{additionalContext}', `## Contexto Adicional\n\n${additionalContext}`)
  } else {
    result = result.replaceAll('{additionalContext}', '')
  }

  return result.trim()
}

/**
 * Validate that a video has required data for a phase.
 */
export function validateVideoForPhase(
  video: Video,
  phase: WizardPhase
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = []

  // All phases require transcript (except 8)
  if (phase !== 8) {
    if (!video.transcriptionSRT && !video.transcriptionTXT) {
      missingFields.push('transcrição')
    }
  }

  // NOTE: Theme and guests are NOT required for Phase 1 (critique)
  // They are optional context that enriches the prompt but are not blocking

  return {
    valid: missingFields.length === 0,
    missingFields,
  }
}
