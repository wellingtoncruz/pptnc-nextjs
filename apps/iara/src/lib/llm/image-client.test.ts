import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGenerateContent = vi.fn()
const mockGetAI = vi.fn(() => ({
  models: {
    generateContent: mockGenerateContent,
  },
}))

vi.mock('./client', () => ({
  getAI: () => mockGetAI(),
}))

vi.mock('./errors', () => {
  class LLMError extends Error {
    code: string
    retryable: boolean
    constructor(code: string, message: string, retryable = false) {
      super(message)
      this.name = 'LLMError'
      this.code = code
      this.retryable = retryable
    }
  }
  return {
    LLMError,
    createLLMError: (err: unknown) => new LLMError('API_ERROR', err instanceof Error ? err.message : 'Unknown', true),
  }
})

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

vi.mock('@/lib/firebase/llm-log-admin', () => ({
  saveLlmLog: vi.fn(),
}))

import { callGenAIImage, IMAGE_MODEL } from './image-client'
import type { ReferenceImage } from './image-client'
import { LLMError } from './errors'

describe('callGenAIImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the correct model and config', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              data: Buffer.from('fake-image').toString('base64'),
              mimeType: 'image/png',
            },
          }],
        },
      }],
    })

    await callGenAIImage('A beautiful sunset')

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: IMAGE_MODEL,
      contents: 'A beautiful sunset',
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
        },
      },
    })
  })

  it('extracts image buffer from inlineData', async () => {
    const imageData = Buffer.from('png-binary-data')
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              data: imageData.toString('base64'),
              mimeType: 'image/png',
            },
          }],
        },
      }],
    })

    const result = await callGenAIImage('Generate an image')

    expect(result.imageBuffer).toEqual(imageData)
    expect(result.mimeType).toBe('image/png')
  })

  it('defaults mimeType to image/png when not provided', async () => {
    const imageData = Buffer.from('data')
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              data: imageData.toString('base64'),
              mimeType: undefined,
            },
          }],
        },
      }],
    })

    const result = await callGenAIImage('prompt')

    expect(result.mimeType).toBe('image/png')
  })

  it('throws LLMError INVALID_RESPONSE when no image in response', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{ text: 'No image here' }],
        },
      }],
    })

    await expect(callGenAIImage('prompt')).rejects.toThrow(LLMError)
    const err = await callGenAIImage('prompt').catch((e) => e)
    expect(err.code).toBe('INVALID_RESPONSE')
  })

  it('throws LLMError INVALID_RESPONSE when candidates are empty', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [],
    })

    await expect(callGenAIImage('prompt')).rejects.toThrow(LLMError)
  })

  it('throws mapped LLMError when Gemini returns API error', async () => {
    mockGenerateContent.mockRejectedValue(new Error('429 Resource exhausted'))

    const err = await callGenAIImage('prompt').catch((e) => e)
    expect(err).toBeInstanceOf(LLMError)
  })

  it('logs success with buffer size', async () => {
    const { log } = await import('@/lib/logger')
    const imageData = Buffer.from('some-image-bytes')
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              data: imageData.toString('base64'),
              mimeType: 'image/png',
            },
          }],
        },
      }],
    })

    await callGenAIImage('prompt')

    expect(log).toHaveBeenCalledWith(
      'INFO',
      'Image generated via Gemini',
      expect.objectContaining({
        model: IMAGE_MODEL,
        bufferSize: imageData.length,
      })
    )
  })

  it('has correct default IMAGE_MODEL', () => {
    expect(IMAGE_MODEL).toBe('gemini-2.5-flash-image')
  })

  it('saves debug log when debugContext is provided', async () => {
    const { saveLlmLog } = await import('@/lib/firebase/llm-log-admin')
    const imageData = Buffer.from('test-image')
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            inlineData: { data: imageData.toString('base64'), mimeType: 'image/png' },
          }],
        },
      }],
    })

    const debugContext = {
      component: 'newsletter/image-generate',
      videoId: 'v1',
      videoType: 'episode' as const,
      podcastId: 'pptnc',
    }

    await callGenAIImage('A sunset', debugContext)

    expect(saveLlmLog).toHaveBeenCalledWith('pptnc', expect.objectContaining({
      component: 'newsletter/image-generate',
      model: IMAGE_MODEL,
      videoId: 'v1',
      prompt: expect.objectContaining({ user: 'A sunset' }),
      response: expect.stringContaining('[Image:'),
    }))
  })

  it('does NOT save debug log when debugContext is undefined', async () => {
    const { saveLlmLog } = await import('@/lib/firebase/llm-log-admin')
    const imageData = Buffer.from('test-image')
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            inlineData: { data: imageData.toString('base64'), mimeType: 'image/png' },
          }],
        },
      }],
    })

    await callGenAIImage('A sunset')

    expect(saveLlmLog).not.toHaveBeenCalled()
  })

  it('uses modelOverride when provided', async () => {
    const imageData = Buffer.from('test-image')
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            inlineData: { data: imageData.toString('base64'), mimeType: 'image/png' },
          }],
        },
      }],
    })

    await callGenAIImage('Generate image', undefined, 'gemini-2.0-flash-image')

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.0-flash-image',
      })
    )
  })

  it('uses default IMAGE_MODEL when modelOverride is undefined', async () => {
    const imageData = Buffer.from('test-image')
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            inlineData: { data: imageData.toString('base64'), mimeType: 'image/png' },
          }],
        },
      }],
    })

    await callGenAIImage('Generate image')

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: IMAGE_MODEL,
      })
    )
  })

  it('does not fail when saveLlmLog throws', async () => {
    const { saveLlmLog } = await import('@/lib/firebase/llm-log-admin')
    const { log } = await import('@/lib/logger')
    vi.mocked(saveLlmLog).mockRejectedValueOnce(new Error('Firestore error'))
    const imageData = Buffer.from('test-image')
    mockGenerateContent.mockResolvedValue({
      candidates: [{
        content: {
          parts: [{
            inlineData: { data: imageData.toString('base64'), mimeType: 'image/png' },
          }],
        },
      }],
    })

    const debugContext = {
      component: 'newsletter/image-generate',
      videoId: 'v1',
      videoType: 'episode' as const,
      podcastId: 'pptnc',
    }

    const result = await callGenAIImage('A sunset', debugContext)

    expect(result.imageBuffer).toEqual(imageData)
    expect(log).toHaveBeenCalledWith('WARN', expect.stringContaining('debug log'), expect.any(Object))
  })

  // ==========================================================================
  // Epic 22 — Story 22.2 — referenceImages support
  // ==========================================================================

  describe('referenceImages (Epic 22, Story 22.2)', () => {
    function mockSuccess(buffer = Buffer.from('binary')) {
      mockGenerateContent.mockResolvedValue({
        candidates: [{
          content: {
            parts: [{
              inlineData: { data: buffer.toString('base64'), mimeType: 'image/png' },
            }],
          },
        }],
      })
      return buffer
    }

    it('passes contents as a plain string (legacy newsletter form) when referenceImages is omitted', async () => {
      mockSuccess()
      await callGenAIImage('A sunset over the mountains')

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'A sunset over the mountains',
        })
      )
    })

    it('passes contents as a structured parts array with inlineData reference + text last', async () => {
      mockSuccess()
      await callGenAIImage(
        'Generate a thumbnail',
        undefined,
        undefined,
        {
          referenceImages: [
            {
              role: 'base',
              inlineData: { data: Buffer.from('base-bytes').toString('base64'), mimeType: 'image/png' },
            },
          ],
        }
      )

      const call = mockGenerateContent.mock.calls[0][0]
      expect(Array.isArray(call.contents)).toBe(true)
      expect(call.contents).toEqual([
        expect.objectContaining({
          inlineData: expect.objectContaining({ mimeType: 'image/png' }),
        }),
        { text: 'Generate a thumbnail' },
      ])
    })

    it('passes contents with fileData when reference uses GCS uri', async () => {
      mockSuccess()
      await callGenAIImage(
        'Generate a thumbnail',
        undefined,
        undefined,
        {
          referenceImages: [
            {
              role: 'reference',
              uri: 'gs://pptnc-stage/thumbnail-config/pptnc/cut/reference-123.png',
              mimeType: 'image/png',
            },
          ],
        }
      )

      const call = mockGenerateContent.mock.calls[0][0]
      expect(call.contents).toEqual([
        {
          fileData: {
            fileUri: 'gs://pptnc-stage/thumbnail-config/pptnc/cut/reference-123.png',
            mimeType: 'image/png',
          },
        },
        { text: 'Generate a thumbnail' },
      ])
    })

    it('accepts a mix of inlineData and fileData references in the order provided', async () => {
      mockSuccess()
      await callGenAIImage(
        'Generate a thumbnail',
        undefined,
        undefined,
        {
          referenceImages: [
            { role: 'base', uri: 'gs://bucket/base.png', mimeType: 'image/png' },
            { role: 'reference', uri: 'gs://bucket/reference.png', mimeType: 'image/jpeg' },
            {
              role: 'guest',
              inlineData: { data: Buffer.from('guest').toString('base64'), mimeType: 'image/jpeg' },
            },
          ],
        }
      )

      const call = mockGenerateContent.mock.calls[0][0]
      expect(call.contents).toHaveLength(4)
      expect(call.contents[0]).toMatchObject({ fileData: { fileUri: 'gs://bucket/base.png' } })
      expect(call.contents[1]).toMatchObject({ fileData: { fileUri: 'gs://bucket/reference.png' } })
      expect(call.contents[2]).toMatchObject({ inlineData: { mimeType: 'image/jpeg' } })
      expect(call.contents[3]).toEqual({ text: 'Generate a thumbnail' })
    })

    it('logs referenceImageCount and roles on success (no binary payload)', async () => {
      const { log } = await import('@/lib/logger')
      mockSuccess()
      await callGenAIImage(
        'prompt',
        undefined,
        undefined,
        {
          referenceImages: [
            { role: 'base', uri: 'gs://b/base.png', mimeType: 'image/png' },
            { role: 'guest', inlineData: { data: Buffer.from('x').toString('base64'), mimeType: 'image/jpeg' } },
          ],
        }
      )

      expect(log).toHaveBeenCalledWith(
        'INFO',
        'Image generated via Gemini',
        expect.objectContaining({
          referenceImageCount: 2,
          referenceImageRoles: ['base', 'guest'],
        })
      )
    })

    it('throws LLMError when reference provides neither inlineData nor uri', async () => {
      mockSuccess()
      await expect(
        callGenAIImage('prompt', undefined, undefined, {
          // Cast around the discriminated union for the negative test only.
          referenceImages: [{ role: 'base' } as unknown as ReferenceImage],
        })
      ).rejects.toThrow(LLMError)
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })

    it('throws LLMError when reference provides BOTH inlineData and uri', async () => {
      mockSuccess()
      await expect(
        callGenAIImage('prompt', undefined, undefined, {
          referenceImages: [
            {
              role: 'base',
              uri: 'gs://b/x.png',
              mimeType: 'image/png',
              // Force-add inlineData to violate the XOR invariant.
              inlineData: { data: 'AAA', mimeType: 'image/png' },
            } as unknown as ReferenceImage,
          ],
        })
      ).rejects.toThrow(LLMError)
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })

    it('throws LLMError when uri is provided without mimeType', async () => {
      mockSuccess()
      await expect(
        callGenAIImage('prompt', undefined, undefined, {
          referenceImages: [
            { role: 'base', uri: 'gs://b/x.png' } as unknown as ReferenceImage,
          ],
        })
      ).rejects.toThrow(LLMError)
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })

    it('still propagates remote errors via createLLMError (LLMError chain preserved)', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('429 Resource exhausted'))

      const err = await callGenAIImage('prompt', undefined, undefined, {
        referenceImages: [
          { role: 'base', uri: 'gs://b/x.png', mimeType: 'image/png' },
        ],
      }).catch((e) => e)

      expect(err).toBeInstanceOf(LLMError)
    })
  })
})
