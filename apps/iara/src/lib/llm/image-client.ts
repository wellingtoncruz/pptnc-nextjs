/**
 * Image generation via Gemini.
 *
 * Uses `gemini-2.5-flash-image` with `responseModalities: ['TEXT', 'IMAGE']`
 * for generating newsletter cover images and (Epic 22) video thumbnails.
 *
 * Separated from client.ts because image generation has a different API surface
 * (non-streaming, no JSON parsing, binary response extraction).
 *
 * CRITICAL: Never expose to the client.
 */

import { log } from '@/lib/logger'
import type { DebugContext } from '@/types/llm-log'

import { getAI } from './client'
import { createLLMError, LLMError } from './errors'

/**
 * Image generation model. Override via GEMINI_IMAGE_MODEL env var.
 */
export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'

/**
 * Role of a reference image — internal metadata for logging/debug only.
 * The model receives images via `contents[]` in the order provided.
 */
export type ReferenceImageRole = 'base' | 'reference' | 'guest'

/**
 * Reference image fed to the image-generation model alongside the prompt.
 *
 * Provide exactly one of:
 * - `inlineData` with base64-encoded bytes (use for small files / when the
 *   image is already in memory)
 * - `uri` pointing to a Cloud Storage object (`gs://bucket/path`) plus
 *   `mimeType` (use for large files served via ADC — no client download)
 *
 * Added in Epic 22 / Story 22.2 to support the Thumbnail wizard phase, which
 * passes Base + Referência (from Settings) and optionally a guest photo
 * (cuts only).
 */
export type ReferenceImage =
  | {
      role: ReferenceImageRole
      inlineData: { data: string; mimeType: string }
      uri?: undefined
      mimeType?: undefined
    }
  | {
      role: ReferenceImageRole
      uri: string
      mimeType: string
      inlineData?: undefined
    }

/**
 * Options for `callGenAIImage`. Added as a fourth, optional positional parameter
 * to avoid breaking existing newsletter callers that use the original 3-arg form.
 */
export interface CallGenAIImageOptions {
  /**
   * Images sent alongside the prompt as context for the generation model.
   * The prompt always comes last in the parts array so the model treats the
   * images as input context and the prompt as the instruction.
   */
  referenceImages?: ReferenceImage[]
}

/**
 * Generate an image via Gemini.
 *
 * Uses `generateContent()` (non-streaming) with `responseModalities: ['TEXT', 'IMAGE']`.
 * Extracts the first inline image from the response.
 *
 * @param prompt - Descriptive text prompt for image generation
 * @param debugContext - Optional debug context for LLM logging
 * @param modelOverride - Optional model name override (otherwise IMAGE_MODEL is used)
 * @param options - Optional bag of extras (Epic 22: `referenceImages`)
 * @returns Buffer with image data and its MIME type
 * @throws {LLMError} If generation fails or no image is returned
 */
export async function callGenAIImage(
  prompt: string,
  debugContext?: DebugContext,
  modelOverride?: string,
  options?: CallGenAIImageOptions
): Promise<{ imageBuffer: Buffer; mimeType: string }> {
  const ai = getAI()
  const modelName = modelOverride || IMAGE_MODEL
  const referenceImages = options?.referenceImages ?? []

  // Validate reference images before hitting the network. A misconfigured
  // entry (no inlineData and no uri) almost always indicates a caller bug
  // and would otherwise fail with a confusing remote error.
  for (const ref of referenceImages) {
    const hasInline = !!ref.inlineData?.data
    const hasUri = !!ref.uri
    if (hasInline === hasUri) {
      throw new LLMError(
        'INVALID_RESPONSE',
        'ReferenceImage deve conter exatamente inlineData OU uri (não ambos, não nenhum)',
        false
      )
    }
    if (hasUri && !ref.mimeType) {
      throw new LLMError(
        'INVALID_RESPONSE',
        'ReferenceImage com uri deve conter mimeType',
        false
      )
    }
  }

  // When references are present, build a structured `contents` payload with
  // image parts FIRST and the text prompt LAST. Otherwise keep the original
  // string form for full backward compatibility with the newsletter caller.
  const contents = referenceImages.length === 0
    ? prompt
    : [
        ...referenceImages.map((ref) => {
          if (ref.uri) {
            return { fileData: { fileUri: ref.uri, mimeType: ref.mimeType } }
          }
          // The validation loop above guarantees inlineData is present here.
          const inline = ref.inlineData!
          return { inlineData: { data: inline.data, mimeType: inline.mimeType } }
        }),
        { text: prompt },
      ]

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
        },
      },
    })

    // Extract first inline image from response parts
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const buffer = Buffer.from(part.inlineData.data, 'base64')
        if (buffer.length === 0) {
          throw new LLMError('INVALID_RESPONSE', 'Imagem retornada vazia pelo Gemini', false)
        }

        log('INFO', 'Image generated via Gemini', {
          model: modelName,
          bufferSize: buffer.length,
          referenceImageCount: referenceImages.length,
          referenceImageRoles: referenceImages.map((ref) => ref.role),
        })

        // Save debug log if debugContext provided
        if (debugContext) {
          try {
            const { saveLlmLog } = await import('@/lib/firebase/llm-log-admin')
            await saveLlmLog(debugContext.podcastId, {
              component: debugContext.component,
              model: modelName,
              videoId: debugContext.videoId,
              videoType: debugContext.videoType,
              prompt: { system: '', user: prompt },
              response: `[Image: ${buffer.length} bytes, ${part.inlineData.mimeType || 'image/png'}]`,
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              provider: 'gemini',
              estimatedCostUsd: 0,
            })
          } catch (logError) {
            log('WARN', 'Failed to save LLM debug log for image', {
              error: logError instanceof Error ? logError.message : JSON.stringify(logError),
            })
          }
        }

        return {
          imageBuffer: buffer,
          mimeType: part.inlineData.mimeType || 'image/png',
        }
      }
    }

    throw new LLMError('INVALID_RESPONSE', 'Nenhuma imagem retornada pelo Gemini', false)
  } catch (error) {
    if (error instanceof LLMError) throw error
    throw createLLMError(error)
  }
}
