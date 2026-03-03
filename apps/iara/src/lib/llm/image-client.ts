/**
 * Image generation via Gemini.
 *
 * Uses `gemini-2.5-flash-image` with `responseModalities: ['TEXT', 'IMAGE']`
 * for generating newsletter cover images.
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
 * Generate an image via Gemini.
 *
 * Uses `generateContent()` (non-streaming) with `responseModalities: ['TEXT', 'IMAGE']`.
 * Extracts the first inline image from the response.
 *
 * @param prompt - Descriptive text prompt for image generation
 * @param debugContext - Optional debug context for LLM logging
 * @returns Buffer with image data and its MIME type
 * @throws {LLMError} If generation fails or no image is returned
 */
export async function callGenAIImage(
  prompt: string,
  debugContext?: DebugContext,
  modelOverride?: string
): Promise<{ imageBuffer: Buffer; mimeType: string }> {
  const ai = getAI()
  const modelName = modelOverride || IMAGE_MODEL

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
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
