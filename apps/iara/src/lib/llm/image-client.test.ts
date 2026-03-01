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
})
