#!/usr/bin/env npx tsx
/**
 * Story 13.1: Spike — PoC do @google/genai com Vertex AI backend
 *
 * Validates that the new SDK works with all patterns used by IAra.
 * Requires ADC configured: `gcloud auth application-default login`
 *
 * Usage: npx tsx scripts/spike-genai-poc.ts
 */

import { GoogleGenAI } from '@google/genai'

// ── Config ─────────────────────────────────────────────────────────────

const PROJECT_ID = 'pptnc-stage'
const LOCATION = 'us-east1'
const MODEL = 'gemini-2.5-flash'

const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: LOCATION,
})

// ── Helpers ────────────────────────────────────────────────────────────

let passCount = 0
let failCount = 0

function pass(name: string, detail?: string) {
  passCount++
  console.log(`  ✅ PASS: ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name: string, error: unknown) {
  failCount++
  const msg = error instanceof Error ? error.message : String(error)
  console.log(`  ❌ FAIL: ${name} — ${msg}`)
}

// ── Validation 1: Unary + JSON + thinkingConfig ────────────────────────

async function validation1_unaryJsonThinking() {
  console.log('\n🔬 Validation 1: Unary generateContent + JSON responseMimeType + thinkingConfig')

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: 'Retorne um JSON com exatamente esta estrutura: { "status": "ok", "message": "Spike validado" }',
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 24576 },
        systemInstruction: 'Você é um assistente de testes. Retorne APENAS JSON puro.',
      },
    })

    // Check response.text
    const text = response.text
    if (!text) throw new Error('response.text is undefined')
    pass('response.text exists', `length=${text.length}`)

    // Check JSON parsing
    const parsed = JSON.parse(text)
    if (parsed.status === 'ok') {
      pass('JSON response is parseable', JSON.stringify(parsed))
    } else {
      fail('JSON response structure', `unexpected: ${text.substring(0, 200)}`)
    }

    // Check usageMetadata
    const usage = response.usageMetadata
    if (usage) {
      pass('usageMetadata exists', [
        `promptTokenCount=${usage.promptTokenCount}`,
        `candidatesTokenCount=${usage.candidatesTokenCount}`,
        `totalTokenCount=${usage.totalTokenCount}`,
        `thoughtsTokenCount=${usage.thoughtsTokenCount ?? 'N/A'}`,
      ].join(', '))
    } else {
      fail('usageMetadata', 'undefined')
    }

    // Check candidates
    const candidate = response.candidates?.[0]
    if (candidate) {
      pass('candidates[0] exists', `finishReason=${candidate.finishReason}`)
    } else {
      fail('candidates', 'empty or undefined')
    }

  } catch (error) {
    fail('Validation 1 (unary)', error)
  }
}

// ── Validation 2: Streaming + thinkingConfig ───────────────────────────

async function validation2_streaming() {
  console.log('\n🔬 Validation 2: generateContentStream + thinkingConfig')

  try {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: 'Liste 3 benefícios de usar TypeScript em formato JSON: { "benefits": ["..."] }',
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 24576 },
        systemInstruction: 'Responda APENAS em JSON.',
      },
    })

    let chunkCount = 0
    let lastChunkText = ''

    for await (const chunk of stream) {
      chunkCount++
      if (chunk.text) {
        lastChunkText = chunk.text
      }
      if (chunkCount === 1) {
        pass('First stream chunk received')
      }
    }

    pass('Stream completed', `${chunkCount} chunks`)

    // Verify last chunk has usable text
    if (lastChunkText) {
      pass('Stream produced text', `lastChunk length=${lastChunkText.length}`)
    } else {
      fail('Stream text', 'no text in any chunk')
    }

  } catch (error) {
    fail('Validation 2 (streaming)', error)
  }
}

// ── Validation 3: systemInstruction ────────────────────────────────────

async function validation3_systemInstruction() {
  console.log('\n🔬 Validation 3: systemInstruction as string in config')

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: 'Qual é o seu nome?',
      config: {
        maxOutputTokens: 256,
        temperature: 0.1,
        systemInstruction: 'Você se chama IAra. Sempre responda começando com "Meu nome é IAra".',
      },
    })

    const text = response.text ?? ''
    if (text.toLowerCase().includes('iara')) {
      pass('systemInstruction respected', `response starts with: "${text.substring(0, 80)}"`)
    } else {
      fail('systemInstruction', `Model did not follow instruction. Got: "${text.substring(0, 200)}"`)
    }

  } catch (error) {
    fail('Validation 3 (systemInstruction)', error)
  }
}

// ── Validation 4: inlineData base64 attachment ─────────────────────────

async function validation4_inlineData() {
  console.log('\n🔬 Validation 4: inlineData base64 attachment (text/plain)')

  try {
    // Simulate a transcription file as base64
    const transcription = `00:00:00,000 --> 00:00:05,000
Olá, bem-vindos ao PPTNC, o podcast de tecnologia.

00:00:05,001 --> 00:00:10,000
Hoje vamos falar sobre inteligência artificial generativa.

00:00:10,001 --> 00:00:15,000
Nosso convidado é o Dr. Silva, especialista em machine learning.`

    const base64Content = Buffer.from(transcription).toString('base64')

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { text: 'Resuma a transcrição anexa em uma frase. Retorne JSON: { "summary": "..." }' },
        {
          inlineData: {
            data: base64Content,
            mimeType: 'text/plain',
          },
        },
      ],
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 1024,
        temperature: 0.3,
        systemInstruction: 'Responda APENAS em JSON.',
      },
    })

    const text = response.text ?? ''
    const parsed = JSON.parse(text)
    if (parsed.summary) {
      pass('inlineData processed', `summary: "${parsed.summary.substring(0, 100)}"`)
    } else {
      fail('inlineData response', `unexpected: ${text.substring(0, 200)}`)
    }

  } catch (error) {
    fail('Validation 4 (inlineData)', error)
  }
}

// ── Validation 5: Response field names (usageMetadata) ─────────────────

async function validation5_responseFields() {
  console.log('\n🔬 Validation 5: Response field names compatibility')

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: 'Diga "ok".',
      config: { maxOutputTokens: 64, temperature: 0 },
    })

    const usage = response.usageMetadata
    const fields = {
      promptTokenCount: usage?.promptTokenCount,
      candidatesTokenCount: usage?.candidatesTokenCount,
      totalTokenCount: usage?.totalTokenCount,
      thoughtsTokenCount: usage?.thoughtsTokenCount,
    }

    // Check that field names match what IAra uses
    if (fields.promptTokenCount !== undefined && fields.promptTokenCount > 0) {
      pass('promptTokenCount', String(fields.promptTokenCount))
    } else {
      fail('promptTokenCount', `got ${fields.promptTokenCount}`)
    }

    if (fields.candidatesTokenCount !== undefined && fields.candidatesTokenCount > 0) {
      pass('candidatesTokenCount', String(fields.candidatesTokenCount))
    } else {
      fail('candidatesTokenCount', `got ${fields.candidatesTokenCount}`)
    }

    if (fields.totalTokenCount !== undefined && fields.totalTokenCount > 0) {
      pass('totalTokenCount', String(fields.totalTokenCount))
    } else {
      fail('totalTokenCount', `got ${fields.totalTokenCount}`)
    }

    // New field in new SDK
    console.log(`    ℹ️ thoughtsTokenCount: ${fields.thoughtsTokenCount ?? 'N/A (no thinking in this call)'}`)

    // Check finishReason on candidate
    const finishReason = response.candidates?.[0]?.finishReason
    if (finishReason) {
      pass('finishReason', finishReason)
    } else {
      fail('finishReason', 'undefined')
    }

  } catch (error) {
    fail('Validation 5 (response fields)', error)
  }
}

// ── Validation 6: ai.files availability ────────────────────────────────

async function validation6_filesApi() {
  console.log('\n🔬 Validation 6: ai.files API availability (Vertex AI backend)')

  try {
    // Check if ai.files exists
    if (!ai.files) {
      fail('ai.files', 'property does not exist on GoogleGenAI instance')
      return
    }
    pass('ai.files exists', `type=${typeof ai.files}`)

    // Check if upload method exists
    if (typeof ai.files.upload !== 'function') {
      fail('ai.files.upload', 'method does not exist')
      return
    }
    pass('ai.files.upload method exists')

    // Try to list files (less risky than upload)
    try {
      const fileList = await ai.files.list()
      pass('ai.files.list() works', `returned ${typeof fileList}`)
    } catch (listError) {
      const msg = listError instanceof Error ? listError.message : String(listError)
      if (msg.includes('not supported') || msg.includes('not available') || msg.includes('404')) {
        fail('ai.files.list()', `NOT SUPPORTED on Vertex AI backend: ${msg.substring(0, 150)}`)
      } else {
        // Other errors (e.g., empty list) might still mean the API exists
        fail('ai.files.list()', msg.substring(0, 200))
      }
    }

    // Try actual upload with a small test file
    try {
      const testContent = 'Teste de upload via @google/genai Files API'
      const tempPath = `/tmp/iara-spike-test-${Date.now()}.txt`
      const fs = await import('fs/promises')
      await fs.writeFile(tempPath, testContent)

      const file = await ai.files.upload({
        file: tempPath,
        config: { mimeType: 'text/plain' },
      })

      pass('ai.files.upload() works!', `name=${file.name}, uri=${file.uri}`)

      // Cleanup
      await fs.unlink(tempPath)
    } catch (uploadError) {
      const msg = uploadError instanceof Error ? uploadError.message : String(uploadError)
      fail('ai.files.upload()', msg.substring(0, 200))
    }

  } catch (error) {
    fail('Validation 6 (files API)', error)
  }
}

// ── Validation 7: AbortSignal support ──────────────────────────────────

async function validation7_abortSignal() {
  console.log('\n🔬 Validation 7: AbortSignal support (replaces undici workaround?)')

  try {
    const controller = new AbortController()

    // Start a call and immediately abort
    const promise = ai.models.generateContent({
      model: MODEL,
      contents: 'Escreva um texto longo sobre a história do Brasil.',
      config: {
        maxOutputTokens: 65536,
        abortSignal: controller.signal,
      },
    })

    // Abort after 100ms
    setTimeout(() => controller.abort(), 100)

    try {
      await promise
      // If we get here, the call completed before abort
      pass('AbortSignal accepted (call completed before abort)')
    } catch (abortError) {
      const msg = abortError instanceof Error ? abortError.message : String(abortError)
      if (msg.includes('abort') || msg.includes('cancel') || abortError instanceof DOMException) {
        pass('AbortSignal works!', 'Call was properly aborted')
      } else {
        fail('AbortSignal', `Unexpected error: ${msg.substring(0, 150)}`)
      }
    }

  } catch (error) {
    fail('Validation 7 (AbortSignal)', error)
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=' .repeat(70))
  console.log('Story 13.1: Spike — PoC @google/genai com Vertex AI backend')
  console.log(`SDK: @google/genai v1.42.0`)
  console.log(`Project: ${PROJECT_ID} | Location: ${LOCATION} | Model: ${MODEL}`)
  console.log('=' .repeat(70))

  await validation1_unaryJsonThinking()
  await validation2_streaming()
  await validation3_systemInstruction()
  await validation4_inlineData()
  await validation5_responseFields()
  await validation6_filesApi()
  await validation7_abortSignal()

  console.log('\n' + '=' .repeat(70))
  console.log(`RESULTS: ${passCount} passed, ${failCount} failed`)
  console.log('=' .repeat(70))

  if (failCount > 0) {
    console.log('\n⚠️  Some validations failed. Review before proceeding with migration.')
    process.exit(1)
  } else {
    console.log('\n🎉 All validations passed! GO for SDK migration.')
    process.exit(0)
  }
}

main().catch((error) => {
  console.error('\n💥 Fatal error:', error)
  process.exit(2)
})
