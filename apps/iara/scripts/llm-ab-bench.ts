/**
 * Epic 23 — Story 23.8: LLM A/B bench (Gemini vs Claude) nas fases criativas.
 *
 * Roda a mesma fase em ambos providers com a mesma transcrição e prompts,
 * salva outputs em diretório timestamped e gera summary.md com comparação
 * cega (Provider A / Provider B). O mapping fica em `mapping.json` no mesmo
 * diretório — você só abre depois de julgar qual saída prefere.
 *
 * Fases suportadas (criativas, onde a diferença estilística aparece):
 *   - 5    (título)
 *   - 5B   (títulos curtos pra thumbnail)
 *   - 6    (descrição)
 *   - 7    (tags)
 *
 * ===== Usage =====
 *
 *   pnpm --filter iara exec tsx scripts/llm-ab-bench.ts \
 *     --episodes vid-1,vid-2 \
 *     [--phases 5,6,7]
 *
 * Defaults: --phases 5,6,7,5B
 *
 * ===== Prereqs =====
 *
 *   1. gcloud auth application-default login   (ADC for Firestore + Vertex)
 *   2. ANTHROPIC_API_KEY em .env.local
 *   3. Vídeos com transcriptionTXT populada e status >= ready
 *
 * ===== Outputs =====
 *
 *   apps/iara/scripts/.bench-output/{ISO-timestamp}/
 *     A-{video}-phase{N}.json     (output cego do Provider A)
 *     B-{video}-phase{N}.json     (output cego do Provider B)
 *     summary.md                  (tabela tokens/latency/cost com A vs B)
 *     mapping.json                (qual provider é A e qual é B — abrir só após votar)
 *
 * Custo estimado: ~$0.50 por run (3 videos × 3 fases × 2 providers, Claude
 * Sonnet 4.6). Diretório `.bench-output/` está em .gitignore.
 */

import { mkdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'

import * as dotenv from 'dotenv'

import { PODCAST_ID } from '@/lib/firebase/config'
import { getAdminDb } from '@/lib/firebase/admin'
import { callGenAI, callLLM, createTranscriptionFile, cleanupTranscriptionFile } from '@/lib/llm/client'
import { LLMError } from '@/lib/llm/errors'
import type { Podcast } from '@/types/podcast'
import type { Video } from '@/types/video'

dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

// =============================================================================
// Config
// =============================================================================

const BENCH_MODELS = {
  gemini: 'gemini-2.5-flash',
  claude: 'claude-sonnet-4-6',
} as const

const PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
}

const ALLOWED_PHASES = ['5', '5B', '6', '7'] as const
type BenchPhase = typeof ALLOWED_PHASES[number]
type Provider = 'gemini' | 'claude'

interface BenchResult {
  video: string
  phase: BenchPhase
  provider: Provider
  label: 'A' | 'B'
  data: unknown
  promptTokens: number
  completionTokens: number
  latencyMs: number
  costUsd: number
  error?: string
}

// =============================================================================
// CLI
// =============================================================================

function parseCliArgs(): { episodes: string[]; phases: BenchPhase[] } {
  const args = process.argv.slice(2)
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const episodesArg = get('--episodes')
  if (!episodesArg) {
    console.error('Usage: tsx llm-ab-bench.ts --episodes vid-1,vid-2 [--phases 5,6,7,5B]')
    process.exit(1)
  }
  const phasesArg = get('--phases') ?? '5,5B,6,7'
  const phases = phasesArg.split(',').map((p) => p.trim()) as BenchPhase[]
  for (const p of phases) {
    if (!ALLOWED_PHASES.includes(p)) {
      throw new Error(`Phase "${p}" não suportada no bench. Permitidas: ${ALLOWED_PHASES.join(', ')}`)
    }
  }
  return { episodes: episodesArg.split(',').map((s) => s.trim()), phases }
}

// =============================================================================
// Firestore helpers
// =============================================================================

async function loadVideo(videoId: string): Promise<Video> {
  const db = getAdminDb()
  const snap = await db.collection('podcasts').doc(PODCAST_ID).collection('videos').doc(videoId).get()
  if (!snap.exists) throw new Error(`Video "${videoId}" não encontrado em pptnc`)
  const data = snap.data()!
  return { id: snap.id, ...data } as Video
}

async function loadPodcast(): Promise<Podcast> {
  const db = getAdminDb()
  const snap = await db.collection('podcasts').doc(PODCAST_ID).get()
  if (!snap.exists) throw new Error(`Podcast "${PODCAST_ID}" não encontrado`)
  const data = snap.data()!
  return { id: snap.id, ...data } as Podcast
}

// =============================================================================
// Bench execution
// =============================================================================

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const tier = PRICING_USD_PER_M[model]
  if (!tier) return 0
  return (promptTokens / 1_000_000) * tier.input + (completionTokens / 1_000_000) * tier.output
}

function buildPodcastForProvider(base: Podcast, provider: Provider): Podcast {
  return {
    ...base,
    llmConfig: {
      ...base.llmConfig,
      provider,
      textModel: BENCH_MODELS[provider],
      fallbackProvider: undefined, // bench precisa ver falha, não fallback silencioso
    },
  } as Podcast
}

async function runPhase5B(
  video: Video,
  podcast: Podcast,
): Promise<{ data: unknown; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const transcription = video.transcriptionTXT || video.transcriptionSRT
  if (!transcription) throw new Error('Vídeo sem transcrição')

  // Replica inline do endpoint /api/wizard/phase/5b/route.ts
  const persona = podcast?.personas?.writer
  const promptCfg = podcast?.prompts?.cut?.thumbs
  let systemPrompt = `Você é um especialista em criar títulos curtos pra thumbnails de cortes de podcast.
Gere 5 títulos curtos (máximo 30 caracteres cada).
Sua resposta DEVE ser um JSON válido com a estrutura:
{ "shortTitles": ["...", "...", "...", "...", "..."] }`
  if (persona?.role && promptCfg?.description) {
    systemPrompt = `Seu papel: ${persona.role}
Seu objetivo: ${persona.objective ?? ''}
Seu contexto: ${persona.resume ?? ''}

## TAREFA
${promptCfg.description}

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "shortTitles": [
    "Título Curto 1", "Título Curto 2", "Título Curto 3", "Título Curto 4", "Título Curto 5"
  ]
}`
  }

  const userPrompt = `## Contexto do Corte

**Título do episódio original:** ${video.title || 'Sem título'}
**Tema:** ${video.theme || 'Não informado'}

[Transcrição anexada como arquivo]`

  const filePath = await createTranscriptionFile(transcription, 5)
  try {
    const result = await callGenAI<{ shortTitles: string[] }>(
      systemPrompt,
      userPrompt,
      120000,
      filePath,
      undefined,
      podcast.llmConfig?.textModel,
      podcast.llmConfig?.provider,
      undefined // bench: sem fallback
    )
    return result
  } finally {
    await cleanupTranscriptionFile(filePath)
  }
}

async function runOne(
  video: Video,
  basePodcast: Podcast,
  phase: BenchPhase,
  provider: Provider,
): Promise<{ data: unknown; promptTokens: number; completionTokens: number; latencyMs: number; costUsd: number }> {
  const podcast = buildPodcastForProvider(basePodcast, provider)
  const t0 = Date.now()

  let data: unknown
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number }

  if (phase === '5B') {
    const r = await runPhase5B(video, podcast)
    data = r.data
    usage = r.usage
  } else {
    const phaseNum = parseInt(phase, 10) as 5 | 6 | 7
    const result = await callLLM(phaseNum, video, podcast)
    if (!result.success) {
      throw new LLMError(result.error.code, result.error.message, result.error.retryable)
    }
    data = result.data
    usage = result.usage!
  }

  const latencyMs = Date.now() - t0
  const costUsd = calculateCost(BENCH_MODELS[provider], usage.promptTokens, usage.completionTokens)
  return {
    data,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    latencyMs,
    costUsd,
  }
}

// =============================================================================
// Output
// =============================================================================

function shuffleAB(): { gemini: 'A' | 'B'; claude: 'A' | 'B' } {
  return Math.random() < 0.5 ? { gemini: 'A', claude: 'B' } : { gemini: 'B', claude: 'A' }
}

function formatUsd(value: number): string {
  if (value === 0) return '$0.0000'
  if (value < 0.0001) return '<$0.0001'
  return `$${value.toFixed(4)}`
}

function generateSummaryMd(results: BenchResult[]): string {
  const lines: string[] = []
  lines.push('# LLM A/B Bench — Summary')
  lines.push('')
  lines.push(`Generated at: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('> Cego: julgue qual provider gerou outputs melhores **sem** olhar o `mapping.json`. Quando decidir, abra o mapping pra ver qual é A e qual é B.')
  lines.push('')
  lines.push('## Métricas por chamada')
  lines.push('')
  lines.push('| Vídeo | Fase | Provider | Tokens In | Tokens Out | Latência (ms) | Custo |')
  lines.push('|-------|------|----------|-----------|------------|---------------|-------|')
  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.video} | ${r.phase} | ${r.label} | — | — | — | erro: ${r.error} |`)
    } else {
      lines.push(`| ${r.video} | ${r.phase} | ${r.label} | ${r.promptTokens} | ${r.completionTokens} | ${r.latencyMs} | ${formatUsd(r.costUsd)} |`)
    }
  }
  lines.push('')

  // Totais por label
  const totalsByLabel: Record<'A' | 'B', { cost: number; latency: number; inTokens: number; outTokens: number; calls: number }> = {
    A: { cost: 0, latency: 0, inTokens: 0, outTokens: 0, calls: 0 },
    B: { cost: 0, latency: 0, inTokens: 0, outTokens: 0, calls: 0 },
  }
  for (const r of results) {
    if (r.error) continue
    totalsByLabel[r.label].cost += r.costUsd
    totalsByLabel[r.label].latency += r.latencyMs
    totalsByLabel[r.label].inTokens += r.promptTokens
    totalsByLabel[r.label].outTokens += r.completionTokens
    totalsByLabel[r.label].calls += 1
  }
  lines.push('## Agregado')
  lines.push('')
  lines.push('| Provider | Calls | Σ Tokens In | Σ Tokens Out | Σ Latência (ms) | Σ Custo |')
  lines.push('|----------|-------|-------------|--------------|-----------------|---------|')
  for (const label of ['A', 'B'] as const) {
    const t = totalsByLabel[label]
    lines.push(`| ${label} | ${t.calls} | ${t.inTokens} | ${t.outTokens} | ${t.latency} | ${formatUsd(t.cost)} |`)
  }
  lines.push('')
  lines.push('## Como julgar')
  lines.push('')
  lines.push('1. Abra cada par `A-{video}-phase{N}.json` vs `B-{video}-phase{N}.json` lado a lado')
  lines.push('2. Avalie qual escrita combina melhor com o estilo PPTNC')
  lines.push('3. Anote sua preferência por fase (não decida tudo num bloco — fases criativas têm preferências diferentes)')
  lines.push('4. Quando terminar, abra `mapping.json` pra ver qual provider venceu')
  return lines.join('\n')
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const { episodes, phases } = parseCliArgs()

  console.log(`Bench running: ${episodes.length} videos × ${phases.length} phases × 2 providers`)
  console.log(`Phases: ${phases.join(', ')}`)
  console.log(`Custo estimado: ~$${(episodes.length * phases.length * 0.08).toFixed(2)} (variação ±50%)`)
  console.log()

  const podcast = await loadPodcast()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
  const outDir = resolve(__dirname, '.bench-output', timestamp)
  await mkdir(outDir, { recursive: true })

  const mapping = shuffleAB()
  console.log(`Mapping (oculto até final): gemini→${mapping.gemini}, claude→${mapping.claude}`)
  console.log()

  const results: BenchResult[] = []

  for (const videoId of episodes) {
    const video = await loadVideo(videoId)
    console.log(`\n=== Video: ${videoId} (${video.title?.slice(0, 60) ?? 'sem título'}) ===`)

    for (const phase of phases) {
      for (const provider of ['gemini', 'claude'] as const) {
        const label = mapping[provider]
        const prefix = `[${videoId} phase${phase} ${label}]`
        try {
          process.stdout.write(`${prefix} ...`)
          const r = await runOne(video, podcast, phase, provider)
          process.stdout.write(` ${r.latencyMs}ms ${r.promptTokens}+${r.completionTokens} tok ${formatUsd(r.costUsd)}\n`)
          await writeFile(
            join(outDir, `${label}-${videoId}-phase${phase}.json`),
            JSON.stringify({ data: r.data }, null, 2),
            'utf-8',
          )
          results.push({
            video: videoId,
            phase,
            provider,
            label,
            data: r.data,
            promptTokens: r.promptTokens,
            completionTokens: r.completionTokens,
            latencyMs: r.latencyMs,
            costUsd: r.costUsd,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          process.stdout.write(` ERRO: ${msg}\n`)
          results.push({
            video: videoId,
            phase,
            provider,
            label,
            data: null,
            promptTokens: 0,
            completionTokens: 0,
            latencyMs: 0,
            costUsd: 0,
            error: msg,
          })
        }
      }
    }
  }

  // Summary cego
  await writeFile(join(outDir, 'summary.md'), generateSummaryMd(results), 'utf-8')
  await writeFile(join(outDir, 'mapping.json'), JSON.stringify(mapping, null, 2), 'utf-8')

  // Custo total
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0)
  console.log(`\nBench concluído. Custo total: ${formatUsd(totalCost)}`)
  console.log(`Output em: ${outDir}`)
  console.log(`Abra summary.md → julgue cego → depois mapping.json`)
}

main().catch((err) => {
  console.error('\nErro fatal:', err)
  process.exit(1)
})
