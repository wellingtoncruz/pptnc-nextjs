import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock setup (vi.hoisted for factory references) ---

const { mockSaveLlmLog, mockGenerateContentStream } = vi.hoisted(() => ({
  mockSaveLlmLog: vi.fn(),
  mockGenerateContentStream: vi.fn(),
}))

// Mock firebase llm-log-admin
vi.mock('@/lib/firebase/llm-log-admin', () => ({
  saveLlmLog: (...args: unknown[]) => mockSaveLlmLog(...args),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Mock config
vi.mock('@/lib/firebase/config', () => ({
  PROJECT_ID: 'test-project',
  GCP_REGION: 'us-central1',
  VERTEX_AI_MODEL: 'gemini-2.5-flash',
  PODCAST_ID: 'pptnc',
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('mock transcription')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}))

// Mock stream response
function createMockStream(text: string) {
  const chunks = [
    {
      text,
      candidates: [{ finishReason: 'STOP', safetyRatings: [] }],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      },
    },
  ]
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = {
      generateContentStream: (...args: unknown[]) => mockGenerateContentStream(...args),
    }
  }
  return { GoogleGenAI: MockGoogleGenAI }
})

import { callGenAI, resetGenAIClient } from './client'

describe('callGenAI debug logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetGenAIClient()
    mockSaveLlmLog.mockResolvedValue(undefined)
  })

  it('saves debug log when debugContext is provided', async () => {
    const responseJson = JSON.stringify({ titles: ['Title 1', 'Title 2'] })
    mockGenerateContentStream.mockResolvedValue(createMockStream(responseJson))

    const debugContext = {
      component: 'wizard/phase-5',
      videoId: 'video-123',
      videoType: 'episode',
      podcastId: 'pptnc',
    }

    await callGenAI(
      'System prompt here',
      'User prompt here',
      120000,
      undefined,
      debugContext
    )

    expect(mockSaveLlmLog).toHaveBeenCalledOnce()
    expect(mockSaveLlmLog).toHaveBeenCalledWith('pptnc', {
      component: 'wizard/phase-5',
      model: 'gemini-2.5-flash',
      videoId: 'video-123',
      videoType: 'episode',
      prompt: { system: 'System prompt here', user: 'User prompt here' },
      response: responseJson,
      attachment: undefined,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })
  })

  it('does NOT save debug log when debugContext is undefined', async () => {
    const responseJson = JSON.stringify({ tags: ['tag1', 'tag2'] })
    mockGenerateContentStream.mockResolvedValue(createMockStream(responseJson))

    await callGenAI(
      'System prompt',
      'User prompt',
      120000,
      undefined,
      undefined
    )

    expect(mockSaveLlmLog).not.toHaveBeenCalled()
  })

  it('does not fail LLM call when debug logging throws', async () => {
    const responseJson = JSON.stringify({ description: 'A video description' })
    mockGenerateContentStream.mockResolvedValue(createMockStream(responseJson))
    mockSaveLlmLog.mockRejectedValue(new Error('Firestore write failed'))

    const debugContext = {
      component: 'wizard/phase-6',
      videoId: 'video-456',
      videoType: 'cut',
      podcastId: 'pptnc',
    }

    const result = await callGenAI(
      'System prompt',
      'User prompt',
      120000,
      undefined,
      debugContext
    )

    // LLM call should succeed despite logging failure
    expect(result.data).toEqual({ description: 'A video description' })
    expect(result.usage.totalTokens).toBe(150)
    expect(mockSaveLlmLog).toHaveBeenCalledOnce()
  })

  it('includes attachment info when attachmentPath is provided', async () => {
    const responseJson = JSON.stringify({ guide: 'AdWords guide' })
    mockGenerateContentStream.mockResolvedValue(createMockStream(responseJson))

    await callGenAI(
      'System prompt',
      'User prompt',
      120000,
      '/tmp/transcription.txt',
      {
        component: 'adwords/generate',
        videoId: 'video-456',
        videoType: 'episode',
        podcastId: 'pptnc',
      }
    )

    expect(mockSaveLlmLog).toHaveBeenCalledWith('pptnc', expect.objectContaining({
      attachment: {
        // 'mock transcription' = 19 bytes → base64 = 28 chars → decoded ≈ 21 bytes
        sizeKB: expect.any(Number),
        estimatedTokens: expect.any(Number),
      },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    }))

    // Verify attachment has positive values
    const call = mockSaveLlmLog.mock.calls[0][1]
    expect(call.attachment.sizeKB).toBeGreaterThan(0)
    expect(call.attachment.estimatedTokens).toBeGreaterThan(0)
  })

  it('passes correct videoType for cut videos', async () => {
    const responseJson = JSON.stringify({ shortTitles: ['Short 1'] })
    mockGenerateContentStream.mockResolvedValue(createMockStream(responseJson))

    await callGenAI(
      'System prompt',
      'User prompt',
      120000,
      undefined,
      {
        component: 'wizard/phase-5b',
        videoId: 'cut-789',
        videoType: 'cut',
        podcastId: 'pptnc',
      }
    )

    expect(mockSaveLlmLog).toHaveBeenCalledWith('pptnc', expect.objectContaining({
      videoType: 'cut',
      component: 'wizard/phase-5b',
    }))
  })
})
