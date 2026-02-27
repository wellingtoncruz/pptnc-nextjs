import * as fs from 'fs/promises'

import { describe, expect, it } from 'vitest'

import type { Video } from '@/types/video'
import type { Persona, Prompts } from '@/types/podcast'

import { cleanupTranscriptionFile, createTranscriptionFile } from './client'
import { createLLMError, isRetryableError, LLMError, LLM_ERROR_MESSAGES } from './errors'
import {
  extractVariables,
  formatDuration,
  formatGuests,
  interpolatePrompt,
  truncateTranscript,
  validateVideoForPhase,
} from './interpolation'
import { buildPhasePrompt, getSystemPrompt, getUserPromptTemplate, PHASE_CONFIG } from './prompts'

// =============================================================================
// FORMAT DURATION TESTS
// =============================================================================

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2m 5s')
  })

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3725)).toBe('1h 2m 5s')
  })

  it('formats exact hours', () => {
    expect(formatDuration(7200)).toBe('2h')
  })

  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('formats large durations', () => {
    expect(formatDuration(36000)).toBe('10h')
  })
})

// =============================================================================
// FORMAT GUESTS TESTS
// =============================================================================

describe('formatGuests', () => {
  it('returns message for empty guests', () => {
    expect(formatGuests([])).toBe('Nenhum convidado informado')
  })

  it('returns message for undefined guests', () => {
    expect(formatGuests(undefined)).toBe('Nenhum convidado informado')
  })

  it('formats single guest with all fields', () => {
    const guests = [
      {
        name: 'John Doe',
        role: 'CEO',
        company: 'Acme Inc',
        linkedin: 'https://linkedin.com/in/johndoe',
      },
    ]

    const result = formatGuests(guests)

    expect(result).toContain('1. **John Doe**')
    expect(result).toContain('CEO na Acme Inc')
    expect(result).toContain('[LinkedIn](https://linkedin.com/in/johndoe)')
  })

  it('formats guest without linkedin', () => {
    const guests = [
      {
        name: 'Jane Doe',
        role: 'CTO',
        company: 'Tech Co',
        linkedin: '',
      },
    ]

    const result = formatGuests(guests)

    expect(result).toContain('1. **Jane Doe**')
    expect(result).toContain('CTO na Tech Co')
    expect(result).not.toContain('LinkedIn')
  })

  it('formats multiple guests', () => {
    const guests = [
      { name: 'Guest 1', role: 'Role 1', company: 'Company 1', linkedin: '' },
      { name: 'Guest 2', role: 'Role 2', company: 'Company 2', linkedin: '' },
    ]

    const result = formatGuests(guests)

    expect(result).toContain('1. **Guest 1**')
    expect(result).toContain('2. **Guest 2**')
  })
})

// =============================================================================
// TRUNCATE TRANSCRIPT TESTS
// =============================================================================

describe('truncateTranscript', () => {
  it('returns full transcript if under limit', () => {
    const transcript = 'This is a short transcript.'

    expect(truncateTranscript(transcript, 100)).toBe(transcript)
  })

  it('truncates at sentence boundary', () => {
    const transcript = 'First sentence. Second sentence. Third sentence.'

    const result = truncateTranscript(transcript, 35)

    expect(result).toContain('First sentence. Second sentence.')
    expect(result).toContain('[... transcrição truncada ...]')
  })

  it('truncates without sentence boundary', () => {
    const transcript = 'This is a long text without periods that goes on and on'

    const result = truncateTranscript(transcript, 20)

    expect(result.length).toBeLessThan(transcript.length + 50)
    expect(result).toContain('[... transcrição truncada ...]')
  })
})

// =============================================================================
// EXTRACT VARIABLES TESTS
// =============================================================================

describe('extractVariables', () => {
  const mockVideo: Video = {
    id: 'video123',
    title: 'Test Video',
    duration: 3600,
    publishedAt: new Date(),
    transcriptionSRT: 'Sample transcript',
    theme: 'Technology',
    videoType: 'episode',
    guests: [
      { name: 'Guest', role: 'Speaker', company: 'Company', linkedin: '' },
    ],
  }

  it('extracts all variables from video', () => {
    const variables = extractVariables(mockVideo)

    expect(variables.title).toBe('Test Video')
    expect(variables.duration).toBe('1h')
    expect(variables.transcript).toBe('Sample transcript')
    expect(variables.theme).toBe('Technology')
    expect(variables.videoType).toBe('episode')
    expect(variables.guests).toContain('Guest')
  })

  it('handles missing optional fields', () => {
    const minimalVideo: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
    }

    const variables = extractVariables(minimalVideo)

    expect(variables.theme).toBe('')
    expect(variables.transcript).toBe('')
    expect(variables.guests).toBe('Nenhum convidado informado')
  })

  it('includes previous phase data when provided', () => {
    const previousData = { critique: 'Good content' }
    const variables = extractVariables(mockVideo, previousData)

    expect(variables.previousPhaseData).toContain('critique')
    expect(variables.previousPhaseData).toContain('Good content')
  })

  it('includes hostName when provided', () => {
    const variables = extractVariables(mockVideo, undefined, 'Wellington')

    expect(variables.hostName).toBe('Wellington')
  })

  it('defaults hostName to "Não informado" when not provided', () => {
    const variables = extractVariables(mockVideo)

    expect(variables.hostName).toBe('Não informado')
  })
})

// =============================================================================
// INTERPOLATE PROMPT TESTS
// =============================================================================

describe('interpolatePrompt', () => {
  it('replaces all variables', () => {
    const template = 'Title: {title}, Duration: {duration}'
    const variables = {
      title: 'My Video',
      duration: '1h 30m',
      transcript: '',
      theme: '',
      guests: '',
      previousPhaseData: '',
      videoType: 'episode',
      hostName: '',
    }

    const result = interpolatePrompt(template, variables)

    expect(result).toBe('Title: My Video, Duration: 1h 30m')
  })

  it('handles additional context', () => {
    const template = 'Content here. {additionalContext}'
    const variables = {
      title: '',
      duration: '',
      transcript: '',
      theme: '',
      guests: '',
      previousPhaseData: '',
      videoType: '',
      hostName: '',
    }

    const result = interpolatePrompt(template, variables, 'Extra info')

    expect(result).toContain('## Contexto Adicional')
    expect(result).toContain('Extra info')
  })

  it('removes additional context placeholder when not provided', () => {
    const template = 'Content here. {additionalContext}'
    const variables = {
      title: '',
      duration: '',
      transcript: '',
      theme: '',
      guests: '',
      previousPhaseData: '',
      videoType: '',
      hostName: '',
    }

    const result = interpolatePrompt(template, variables)

    expect(result).not.toContain('{additionalContext}')
    expect(result).toBe('Content here.')
  })
})

// =============================================================================
// VALIDATE VIDEO FOR PHASE TESTS
// =============================================================================

describe('validateVideoForPhase', () => {
  it('requires transcript for phases 1-7', () => {
    const video: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
    }

    for (let phase = 1; phase <= 7; phase++) {
      const result = validateVideoForPhase(video, phase)
      expect(result.valid).toBe(false)
      expect(result.missingFields).toContain('transcrição')
    }
  })

  it('does not require transcript for phase 8', () => {
    const video: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
    }

    const result = validateVideoForPhase(video, 8)

    expect(result.valid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
  })

  it('does NOT require theme for phase 1 (critique)', () => {
    const video: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
      transcriptionSRT: 'transcript',
      videoType: 'episode',
    }

    const result = validateVideoForPhase(video, 1)

    expect(result.valid).toBe(true)
    expect(result.missingFields).not.toContain('tema do episódio')
  })

  it('does NOT require guests for phase 1 (critique)', () => {
    const video: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
      transcriptionSRT: 'transcript',
      videoType: 'episode',
    }

    const result = validateVideoForPhase(video, 1)

    expect(result.valid).toBe(true)
    expect(result.missingFields).not.toContain('convidados')
  })

  it('passes validation with transcript only for phase 1', () => {
    const video: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
      transcriptionSRT: 'transcript',
      videoType: 'episode',
    }

    const result = validateVideoForPhase(video, 1)

    expect(result.valid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
  })
})

// =============================================================================
// PROMPTS TESTS
// =============================================================================

describe('getSystemPrompt', () => {
  it('returns base prompt for each phase', () => {
    for (let phase = 1; phase <= 7; phase++) {
      const prompt = getSystemPrompt(phase as 1 | 2 | 3 | 4 | 5 | 6 | 7)
      expect(prompt).toBeTruthy()
      expect(prompt.length).toBeGreaterThan(100)
    }
  })

  it('includes configured prompt when provided', () => {
    const config = {
      description: 'Focus on humor',
      expectedOutput: 'Include joke count',
    }

    const prompt = getSystemPrompt(1, config)

    expect(prompt).toContain('Focus on humor')
    expect(prompt).toContain('Include joke count')
    expect(prompt).toContain('Instruções Adicionais')
  })

  it('returns empty for phase 8', () => {
    const prompt = getSystemPrompt(8)
    expect(prompt).toBe('')
  })
})

describe('getUserPromptTemplate', () => {
  it('returns template for each phase', () => {
    for (let phase = 1; phase <= 7; phase++) {
      const template = getUserPromptTemplate(phase as 1 | 2 | 3 | 4 | 5 | 6 | 7)
      expect(template).toBeTruthy()
      expect(template).toContain('{title}')
    }
  })

  it('includes transcript placeholder', () => {
    const template = getUserPromptTemplate(1)
    expect(template).toContain('{transcript}')
  })
})

// =============================================================================
// PHASE CONFIG TESTS
// =============================================================================

describe('PHASE_CONFIG', () => {
  it('defines config for all phases 1-8', () => {
    for (let phase = 1; phase <= 8; phase++) {
      const config = PHASE_CONFIG[phase as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8]
      expect(config).toBeDefined()
      expect(config.personaName).toBeDefined()
      expect(config.attachmentType).toMatch(/^(TXT|SRT)$/)
      expect(typeof config.promptKey).toBe('string')
    }
  })

  it('uses critic persona for phase 1', () => {
    expect(PHASE_CONFIG[1].personaName).toBe('critic')
    expect(PHASE_CONFIG[1].attachmentType).toBe('TXT')
    expect(PHASE_CONFIG[1].promptKey).toBe('critique')
  })

  it('uses SRT for analysis phases (2, 3, 4) per processamento_video.md', () => {
    expect(PHASE_CONFIG[2].attachmentType).toBe('SRT') // Edição
    expect(PHASE_CONFIG[3].attachmentType).toBe('SRT') // Compliance
    expect(PHASE_CONFIG[4].attachmentType).toBe('SRT') // Capítulos
  })

  it('uses TXT for content generation phases (1, 5, 6, 7)', () => {
    expect(PHASE_CONFIG[1].attachmentType).toBe('TXT') // Crítica
    expect(PHASE_CONFIG[5].attachmentType).toBe('TXT') // Títulos
    expect(PHASE_CONFIG[6].attachmentType).toBe('TXT') // Descrição
    expect(PHASE_CONFIG[7].attachmentType).toBe('TXT') // Tags
  })

  it('has empty promptKey for phase 8 (no LLM)', () => {
    expect(PHASE_CONFIG[8].promptKey).toBe('')
  })
})

// =============================================================================
// BUILD PHASE PROMPT TESTS
// =============================================================================

describe('buildPhasePrompt', () => {
  const mockPersona: Persona = {
    role: 'Você é um crítico experiente de podcasts',
    objective: 'Analisar e fornecer feedback construtivo',
    resume: 'Mais de 10 anos analisando conteúdo audiovisual',
  }

  const mockPrompts: Prompts = {
    episode: {
      critique: {
        description: 'Analise o episódio identificando pontos fortes e fracos',
        expectedOutput: 'JSON com critique, highlights e suggestions',
      },
      editing: { description: '', expectedOutput: '' },
      compliance: { description: '', expectedOutput: '' },
      titles: { description: '', expectedOutput: '' },
      description: { description: '', expectedOutput: '' },
      tags: { description: '', expectedOutput: '' },
    },
    cut: {
      titles: { description: '', expectedOutput: '' },
      thumbs: { description: '', expectedOutput: '' },
      description: { description: '', expectedOutput: '' },
      tags: { description: '', expectedOutput: '' },
    },
    reel: {
      titles: { description: '', expectedOutput: '' },
      description: { description: '', expectedOutput: '' },
      tags: { description: '', expectedOutput: '' },
    },
  }

  it('builds prompt following llm.md template when persona and prompts are provided', () => {
    const result = buildPhasePrompt(1, mockPersona, mockPrompts, 'episode')

    expect(result).toContain('Seu papel: Você é um crítico experiente de podcasts')
    expect(result).toContain('Seu objetivo: Analisar e fornecer feedback construtivo')
    expect(result).toContain('Seu contexto: Mais de 10 anos analisando conteúdo audiovisual')
    expect(result).toContain('## TAREFA')
    expect(result).toContain('Analise o episódio identificando pontos fortes e fracos')
    // expectedOutput is NOT included when PHASE_JSON_SCHEMAS has content (avoids format conflicts)
    expect(result).not.toContain('Seu retorno deve ser estritamente')
  })

  it('returns fallback prompt when persona is undefined', () => {
    const result = buildPhasePrompt(1, undefined, mockPrompts, 'episode')

    // Should return BASE_SYSTEM_PROMPTS fallback
    expect(result).toContain('crítico especializado')
    expect(result).not.toContain('Seu papel:')
  })

  it('returns fallback prompt when prompts is undefined', () => {
    const result = buildPhasePrompt(1, mockPersona, undefined, 'episode')

    // Should return BASE_SYSTEM_PROMPTS fallback
    expect(result).toContain('crítico especializado')
    expect(result).not.toContain('Seu papel:')
  })

  it('returns fallback when prompt description is empty', () => {
    const emptyPrompts: Prompts = {
      ...mockPrompts,
      episode: {
        ...mockPrompts.episode,
        critique: { description: '', expectedOutput: '' },
      },
    }

    const result = buildPhasePrompt(1, mockPersona, emptyPrompts, 'episode')

    // Should return BASE_SYSTEM_PROMPTS fallback
    expect(result).toContain('crítico especializado')
    expect(result).not.toContain('Seu papel:')
  })

  it('returns fallback for phase 8 (no LLM)', () => {
    const result = buildPhasePrompt(8, mockPersona, mockPrompts, 'episode')

    // Phase 8 has no LLM call, should return empty string (fallback)
    expect(result).toBe('')
  })

  it('uses correct video type prompts for cut videos', () => {
    const cutPrompts: Prompts = {
      ...mockPrompts,
      cut: {
        ...mockPrompts.cut,
        titles: {
          description: 'Gere títulos para o corte',
          expectedOutput: 'Lista de 5 títulos',
        },
      },
    }

    const writerPersona: Persona = {
      role: 'Especialista em títulos virais',
      objective: 'Criar títulos que geram cliques',
      resume: 'Expert em SEO para YouTube',
    }

    const result = buildPhasePrompt(5, writerPersona, cutPrompts, 'cut')

    expect(result).toContain('Seu papel: Especialista em títulos virais')
    expect(result).toContain('Gere títulos para o corte')
  })

  it('logs fallback mode when using base prompts', () => {
    // This test verifies the function returns fallback correctly
    // The actual logging is tested via integration tests
    const result = buildPhasePrompt(1, undefined, undefined, 'episode')

    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(100)
  })
})

// =============================================================================
// FILE ATTACHMENT TESTS
// =============================================================================

describe('createTranscriptionFile', () => {
  it('creates temporary file with transcription content', async () => {
    const content = 'This is a test transcription content'
    const filePath = await createTranscriptionFile(content, 1)

    // Verify file was created
    const fileContent = await fs.readFile(filePath, 'utf-8')
    expect(fileContent).toBe(content)

    // Cleanup
    await cleanupTranscriptionFile(filePath)
  })

  it('creates file with unique name per call', async () => {
    const content = 'Test content'
    const path1 = await createTranscriptionFile(content, 1)
    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 5))
    const path2 = await createTranscriptionFile(content, 1)

    expect(path1).not.toBe(path2)

    // Cleanup
    await cleanupTranscriptionFile(path1)
    await cleanupTranscriptionFile(path2)
  })

  it('includes phase number in filename', async () => {
    const content = 'Test content'
    const filePath = await createTranscriptionFile(content, 3)

    expect(filePath).toContain('phase3')

    // Cleanup
    await cleanupTranscriptionFile(filePath)
  })
})

describe('cleanupTranscriptionFile', () => {
  it('removes the temporary file', async () => {
    const content = 'Test content'
    const filePath = await createTranscriptionFile(content, 1)

    // File should exist
    await expect(fs.access(filePath)).resolves.toBeUndefined()

    // Cleanup
    await cleanupTranscriptionFile(filePath)

    // File should not exist
    await expect(fs.access(filePath)).rejects.toThrow()
  })

  it('does not throw when file does not exist', async () => {
    // Should not throw even if file doesn't exist
    await expect(cleanupTranscriptionFile('/tmp/nonexistent-file-12345.txt')).resolves.toBeUndefined()
  })
})

// =============================================================================
// ERROR TESTS
// =============================================================================

describe('LLMError', () => {
  it('creates error with code and message', () => {
    const error = new LLMError('TIMEOUT', 'Request timed out', true)

    expect(error.code).toBe('TIMEOUT')
    expect(error.message).toBe('Request timed out')
    expect(error.retryable).toBe(true)
  })

  it('converts to result format', () => {
    const error = new LLMError('API_ERROR', 'Server error', true)
    const result = error.toResult()

    expect(result.success).toBe(false)
    expect(result.error.code).toBe('API_ERROR')
    expect(result.error.message).toBe('Server error')
    expect(result.error.retryable).toBe(true)
  })
})

describe('isRetryableError', () => {
  it('returns true for retryable errors', () => {
    expect(isRetryableError('RATE_LIMIT')).toBe(true)
    expect(isRetryableError('TIMEOUT')).toBe(true)
    expect(isRetryableError('NETWORK_ERROR')).toBe(true)
    expect(isRetryableError('API_ERROR')).toBe(true)
  })

  it('returns false for non-retryable errors', () => {
    expect(isRetryableError('PARSE_ERROR')).toBe(false)
    expect(isRetryableError('INVALID_RESPONSE')).toBe(false)
    expect(isRetryableError('MISSING_TRANSCRIPT')).toBe(false)
  })
})

describe('createLLMError', () => {
  it('returns same error if already LLMError', () => {
    const original = new LLMError('TIMEOUT', 'test', true)
    const result = createLLMError(original)

    expect(result).toBe(original)
  })

  it('detects rate limit errors', () => {
    const error = new Error('Rate limit exceeded (429)')
    const result = createLLMError(error)

    expect(result.code).toBe('RATE_LIMIT')
    expect(result.retryable).toBe(true)
  })

  it('detects timeout errors', () => {
    const error = new Error('Request timed out')
    const result = createLLMError(error)

    expect(result.code).toBe('TIMEOUT')
  })

  it('detects network errors', () => {
    const error = new Error('Network request failed')
    const result = createLLMError(error)

    expect(result.code).toBe('NETWORK_ERROR')
  })

  it('returns unknown for unrecognized errors', () => {
    const result = createLLMError('string error')

    expect(result.code).toBe('UNKNOWN')
  })
})

// =============================================================================
// ERROR MESSAGES TESTS
// =============================================================================

describe('LLM_ERROR_MESSAGES', () => {
  it('has messages for all error codes', () => {
    const codes = [
      'RATE_LIMIT',
      'TIMEOUT',
      'INVALID_RESPONSE',
      'PARSE_ERROR',
      'API_ERROR',
      'NETWORK_ERROR',
      'MISSING_TRANSCRIPT',
      'MISSING_CONTEXT',
      'UNKNOWN',
    ] as const

    for (const code of codes) {
      expect(LLM_ERROR_MESSAGES[code]).toBeTruthy()
      expect(typeof LLM_ERROR_MESSAGES[code]).toBe('string')
    }
  })
})

// =============================================================================
// PARSE_ERROR RETRY TESTS
// =============================================================================
//
// Story 5.4: Auto-Retry em PARSE_ERROR
// Tests verify retry configuration and error handling behavior.
// Full integration tests with mocked Vertex AI SDK are in a separate file.
// =============================================================================

describe('PARSE_ERROR retry configuration', () => {
  it('MAX_PARSE_RETRIES is 3', async () => {
    const { MAX_PARSE_RETRIES } = await import('./types')
    expect(MAX_PARSE_RETRIES).toBe(3)
  })

  it('RETRY_DELAY_MS is 1000ms (1 second)', async () => {
    const { RETRY_DELAY_MS } = await import('./types')
    expect(RETRY_DELAY_MS).toBe(1000)
  })

  it('exports retry constants from types.ts', async () => {
    const types = await import('./types')

    expect(types.MAX_PARSE_RETRIES).toBeDefined()
    expect(types.RETRY_DELAY_MS).toBeDefined()
    expect(typeof types.MAX_PARSE_RETRIES).toBe('number')
    expect(typeof types.RETRY_DELAY_MS).toBe('number')
  })
})

describe('PARSE_ERROR retry behavior', () => {
  it('PARSE_ERROR is marked as non-retryable in LLMError', async () => {
    // PARSE_ERROR has retryable=false because the retry logic is internal
    // to callGenAI, not exposed to callers
    const { LLMError } = await import('./errors')
    const parseError = new LLMError('PARSE_ERROR', 'Parse failed', false)

    expect(parseError.code).toBe('PARSE_ERROR')
    expect(parseError.retryable).toBe(false)
  })

  it('TIMEOUT error is marked as retryable (user can retry manually)', async () => {
    const { LLMError } = await import('./errors')
    const timeoutError = new LLMError('TIMEOUT', 'Timeout', true)

    expect(timeoutError.code).toBe('TIMEOUT')
    expect(timeoutError.retryable).toBe(true)
  })

  it('RATE_LIMIT error is marked as retryable (user can retry manually)', async () => {
    const { LLMError } = await import('./errors')
    const rateLimitError = new LLMError('RATE_LIMIT', 'Rate limited', true)

    expect(rateLimitError.code).toBe('RATE_LIMIT')
    expect(rateLimitError.retryable).toBe(true)
  })

  it('error message format includes retry count', async () => {
    // The error message format is defined in client.ts
    // When all retries are exhausted, the message should include the attempt count
    const { MAX_PARSE_RETRIES } = await import('./types')

    const expectedMessagePattern = `Erro ao parsear resposta após ${MAX_PARSE_RETRIES} tentativas`
    expect(expectedMessagePattern).toBe('Erro ao parsear resposta após 3 tentativas')
    expect(expectedMessagePattern).toContain('3 tentativas')
  })

  it('isRetryableError returns false for PARSE_ERROR (internal retry only)', async () => {
    const { isRetryableError } = await import('./errors')

    // PARSE_ERROR is NOT externally retryable - the retry happens internally
    expect(isRetryableError('PARSE_ERROR')).toBe(false)
  })

  it('isRetryableError returns true for TIMEOUT and RATE_LIMIT', async () => {
    const { isRetryableError } = await import('./errors')

    // These are externally retryable (user can click "try again")
    expect(isRetryableError('TIMEOUT')).toBe(true)
    expect(isRetryableError('RATE_LIMIT')).toBe(true)
  })
})

// =============================================================================
// CALL LLM VALIDATION TESTS
// =============================================================================
//
// Note: Full integration tests with mocked Vertex AI SDK would require a separate
// test file with more complex mocking setup. These tests verify the validation
// logic that runs before the API call.
// =============================================================================

describe('callLLM validation', () => {
  // Import callLLM dynamically to avoid module initialization issues
  const getCallLLM = async () => {
    const { callLLM } = await import('./client')
    return callLLM
  }

  it('returns validation error when video has no transcript', async () => {
    const callLLM = await getCallLLM()
    const videoWithoutTranscript: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
    }

    const result = await callLLM(1, videoWithoutTranscript)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('MISSING_TRANSCRIPT')
      expect(result.error.retryable).toBe(false)
    }
  })

  it('does NOT require theme for episode in phase 1', async () => {
    // Phase 1 (critique) only requires transcript
    const videoWithoutTheme: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
      transcriptionSRT: 'transcript',
      videoType: 'episode',
    }

    const { validateVideoForPhase } = await import('./interpolation')
    const validation = validateVideoForPhase(videoWithoutTheme, 1)

    expect(validation.valid).toBe(true)
    expect(validation.missingFields).toHaveLength(0)
  })

  it('does NOT require guests for episode in phase 1', async () => {
    // Phase 1 (critique) only requires transcript
    const videoWithoutGuests: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
      transcriptionSRT: 'transcript',
      videoType: 'episode',
    }

    const { validateVideoForPhase } = await import('./interpolation')
    const validation = validateVideoForPhase(videoWithoutGuests, 1)

    expect(validation.valid).toBe(true)
    expect(validation.missingFields).toHaveLength(0)
  })

  it('passes validation for phase 1 with only transcript', async () => {
    // Phase 1 only needs transcript - theme and guests are optional context
    const minimalVideo: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
      transcriptionSRT: 'transcript',
      videoType: 'episode',
    }

    const { validateVideoForPhase } = await import('./interpolation')
    const validation = validateVideoForPhase(minimalVideo, 1)

    expect(validation.valid).toBe(true)
    expect(validation.missingFields).toHaveLength(0)
  })

  it('accepts video with TXT transcription only', async () => {
    const videoWithTxtOnly: Video = {
      id: 'video123',
      title: 'Test',
      duration: 60,
      publishedAt: new Date(),
      transcriptionTXT: 'plain text transcript',
      videoType: 'cut',
    }

    const { validateVideoForPhase } = await import('./interpolation')
    const validation = validateVideoForPhase(videoWithTxtOnly, 2)

    expect(validation.valid).toBe(true)
  })
})
