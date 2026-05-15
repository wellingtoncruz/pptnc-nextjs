/**
 * Spike Story 23.1 — Validação de viabilidade do Claude via Vertex AI.
 *
 * ONE-OFF: não é código de produção. Existe apenas para destravar o gate
 * go/no-go do Epic 23 antes de comprometer 12-17 dias de refactor.
 *
 * ===== ACs cobertos =====
 *
 *   AC2 — ADC auth (chamada simples "Hello Claude!" via global/regional endpoint)
 *   AC3 — Smoke test com prompt PPTNC mock (Phase 6 Descrição) comparado a Gemini
 *   AC4 — Cost measurement (tokens × pricing → USD)
 *   AC5 — Context window stress (transcrição sintética grande)
 *   AC6 — Streaming semantics (event shape vs Gemini)
 *
 * AC1 (Turbopack) é validado **fora** deste script — usa `apps/iara/src/app/api/spike-claude/route.ts`.
 *
 * ===== Pré-requisitos =====
 *
 * 1. `gcloud auth application-default login` (ADC pro service account ter acesso a Vertex AI)
 * 2. Service account com IAM `aiplatform.endpoints.predict` no projeto
 * 3. **Anthropic publisher access** habilitado no projeto (Vertex AI Model Garden → Claude
 *    family → request access). Se falhar com 404/403 em AC2, ESSE é o motivo.
 * 4. Vars de ambiente:
 *    - `GCP_PROJECT_ID` (default: `pptnc-stage`)
 *    - `ANTHROPIC_REGION` (default: `us-east5`; Claude no Vertex tem regiões
 *      específicas, **não** existe `global` endpoint pra Claude como existe pro Gemini)
 *    - `GEMINI_MODEL_FOR_COMPARISON` (default: `gemini-2.5-flash`)
 *    - `CLAUDE_MODEL` (default: `claude-sonnet-4-6`)
 *
 * ===== Uso =====
 *
 *   pnpm --filter iara exec tsx scripts/spike-claude-vertex.ts --ac=2
 *   pnpm --filter iara exec tsx scripts/spike-claude-vertex.ts --ac=3
 *   pnpm --filter iara exec tsx scripts/spike-claude-vertex.ts --ac=all
 *
 *   Outputs salvos em `spike-tmp/claude-{ISO}/`.
 *
 * ===== Saída =====
 *
 * - Stdout: log estruturado por AC (PASS / FAIL / WARN com motivo)
 * - `spike-tmp/claude-{ISO}/results.json` — métricas brutas
 * - `spike-tmp/claude-{ISO}/{ac}-output.txt` — saídas textuais de cada AC
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { config as loadEnv } from 'dotenv'
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'pptnc-stage'
const ANTHROPIC_REGION = process.env.ANTHROPIC_REGION || 'us-east5'
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'
const GEMINI_MODEL = process.env.GEMINI_MODEL_FOR_COMPARISON || 'gemini-2.5-flash'

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const OUT_DIR = join(process.cwd(), 'spike-tmp', `claude-${RUN_ID}`)

interface AcResult {
  ac: string
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP'
  message: string
  details?: Record<string, unknown>
  durationMs?: number
}

const results: AcResult[] = []

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(msg)
}

function record(r: AcResult) {
  results.push(r)
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : r.status === 'WARN' ? '⚠️' : '⏭️'
  log(`${icon} ${r.ac} — ${r.status}: ${r.message}`)
  if (r.details) {
    log(`   details: ${JSON.stringify(r.details)}`)
  }
}

function getClient(): AnthropicVertex {
  return new AnthropicVertex({
    projectId: GCP_PROJECT_ID,
    region: ANTHROPIC_REGION,
  })
}

/**
 * AC2 — ADC auth. Chamada minimalista pra validar conectividade,
 * autenticação e acesso ao publisher Anthropic.
 */
async function runAc2(): Promise<void> {
  log('\n=== AC2 — ADC Auth + chamada Claude minimalista ===\n')
  const t0 = Date.now()
  try {
    const client = getClient()
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Responda apenas "ok".' }],
    })
    const content = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
    const durationMs = Date.now() - t0

    writeFileSync(
      join(OUT_DIR, 'ac2-output.txt'),
      `Model: ${CLAUDE_MODEL}\nRegion: ${ANTHROPIC_REGION}\nProject: ${GCP_PROJECT_ID}\n\nResponse:\n${content}\n\nUsage: ${JSON.stringify(response.usage, null, 2)}`
    )

    record({
      ac: 'AC2',
      status: 'PASS',
      message: 'ADC autenticou; Claude respondeu',
      durationMs,
      details: {
        model: CLAUDE_MODEL,
        region: ANTHROPIC_REGION,
        responseLen: content.length,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    })
  } catch (error) {
    const e = error as { status?: number; message?: string }
    record({
      ac: 'AC2',
      status: 'FAIL',
      message: `Erro ${e.status ?? '?'}: ${e.message ?? String(error)}`,
      details: {
        likelyAllowlist: e.status === 404 || e.status === 403,
        likelyAuth: e.status === 401,
      },
    })
  }
}

const PPTNC_PHASE6_SYSTEM_PROMPT = `Você é Wellington, anfitrião do podcast PPT Não Compila. Sua voz é direta, técnica, com humor seco quando cabe. Escreva descrições de YouTube que: (1) ganchem nos primeiros 2 segundos; (2) tenham 3-5 parágrafos curtos; (3) terminem com call-to-action sutil. Português brasileiro, gírias técnicas permitidas.`

const PPTNC_PHASE6_USER_PROMPT_TEMPLATE = (transcriptExcerpt: string) => `Episódio com este trecho da transcrição:

"""
${transcriptExcerpt}
"""

Escreva a descrição do YouTube. Não invente conteúdo que não está na transcrição.`

const SAMPLE_TRANSCRIPT = `Wellington: Pessoal, bem-vindos a mais um PPT Não Compila. Hoje tô com o pessoal do time de plataforma de uma fintech grande, e o tema é o pesadelo que é gerenciar segredos em ambiente multi-conta.

Convidado: Cara, primeiro: a gente teve o equivalente a uns três incidentes em seis meses só por causa de segredo que vazou em log, em commit, em variável de ambiente errada. A gente tava usando Vault, mas o Vault só resolve uma parte do problema.

Wellington: Conta mais. Porque na real eu vejo muita gente falando de Vault como bala de prata.

Convidado: Não é. O Vault gerencia bem o ciclo de vida do segredo, mas se sua app não tem uma cultura de não logar payload sensível, se seu CI/CD não tem hook pra pegar segredo hardcoded antes do merge, se sua aplicação não tem rotação automatizada de credenciais — você ainda vai vazar.

Wellington: Então o que vocês fizeram?

Convidado: Primeira coisa, hardening de pipeline. Gitleaks no pre-commit hook, no pre-push, no pipeline de CI. Bloqueia merge se detecta padrão de segredo. Segunda coisa, refatoramos todo logger pra ter um redactor configurável que mascara qualquer campo cujo nome tenha "token", "secret", "key", "password", "auth" — antes de ir pro destino, seja stdout, Cloud Logging, ou Datadog. Terceiro, rotação curta de credenciais com short-lived tokens via Workload Identity Federation onde dava, e onde não dava, rotação manual a cada 30 dias com calendário compartilhado.

Wellington: Esse último parece o mais doloroso.

Convidado: É o mais doloroso. Time de plataforma virou guardião de calendário. Mas funcionou. Zero incidente por segredo nos últimos 18 meses.`

/**
 * AC3 — Smoke test com prompt PPTNC realista (Phase 6 Descrição), comparando
 * Gemini e Claude no mesmo input. Para AC3 só rodamos Claude — Gemini fica
 * pra Wellington comparar manualmente com Gemini através do app normal ou
 * outro spike. O foco aqui é validar que Claude entende prompt+system+user
 * em PT-BR e produz output coerente.
 */
async function runAc3(): Promise<void> {
  log('\n=== AC3 — Smoke test PPTNC (Phase 6 Descrição) ===\n')
  const t0 = Date.now()
  try {
    const client = getClient()
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: PPTNC_PHASE6_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: PPTNC_PHASE6_USER_PROMPT_TEMPLATE(SAMPLE_TRANSCRIPT) }],
    })
    const content = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
    const durationMs = Date.now() - t0

    writeFileSync(
      join(OUT_DIR, 'ac3-output.txt'),
      `Model: ${CLAUDE_MODEL}\nDuration: ${durationMs}ms\nInput tokens: ${response.usage.input_tokens}\nOutput tokens: ${response.usage.output_tokens}\n\n--- SYSTEM PROMPT ---\n${PPTNC_PHASE6_SYSTEM_PROMPT}\n\n--- USER PROMPT ---\n${PPTNC_PHASE6_USER_PROMPT_TEMPLATE(SAMPLE_TRANSCRIPT)}\n\n--- CLAUDE RESPONSE ---\n${content}`
    )

    record({
      ac: 'AC3',
      status: 'PASS',
      message: 'Claude produziu output coerente para prompt PPTNC',
      durationMs,
      details: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        outputLen: content.length,
      },
    })
  } catch (error) {
    record({
      ac: 'AC3',
      status: 'FAIL',
      message: `${(error as Error).message ?? String(error)}`,
    })
  }
}

/**
 * AC4 — Cost measurement. Usa pricing de 2026-05-14:
 *   Sonnet 4.6 global: $3/$15 por 1M tokens
 *   Sonnet 4.6 regional: $3.30/$16.50 (10% premium)
 *   Haiku 4.5: aproximadamente $1/$5 (validar empiricamente)
 *   Opus 4.7: $15/$75
 */
const PRICING_USD_PER_M = (model: string, region: string) => {
  const regionalPremium = region === 'global' ? 1.0 : 1.1
  if (model.includes('opus')) return { input: 15 * regionalPremium, output: 75 * regionalPremium }
  if (model.includes('haiku')) return { input: 1 * regionalPremium, output: 5 * regionalPremium }
  // default sonnet
  return { input: 3 * regionalPremium, output: 15 * regionalPremium }
}

function runAc4(): void {
  log('\n=== AC4 — Cost measurement (com base em AC3) ===\n')
  const ac3 = results.find((r) => r.ac === 'AC3')
  if (!ac3 || ac3.status !== 'PASS' || !ac3.details) {
    record({ ac: 'AC4', status: 'SKIP', message: 'AC3 não passou; sem dados de tokens' })
    return
  }
  const inputTokens = ac3.details.inputTokens as number
  const outputTokens = ac3.details.outputTokens as number
  const pricing = PRICING_USD_PER_M(CLAUDE_MODEL, ANTHROPIC_REGION)
  const costUsd = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
  const costPerVideo = costUsd * 7 // 7 fases LLM por vídeo (placeholder)
  const costPerMonth = costPerVideo * 22 * 4 // 22 vídeos/semana × 4 semanas

  writeFileSync(
    join(OUT_DIR, 'ac4-output.txt'),
    `Pricing model: ${CLAUDE_MODEL} @ ${ANTHROPIC_REGION}\nInput: $${pricing.input}/1M\nOutput: $${pricing.output}/1M\n\nMeasured call (AC3):\n  Input tokens: ${inputTokens}\n  Output tokens: ${outputTokens}\n  Cost: $${costUsd.toFixed(6)}\n\nProjection (per video, 7 LLM phases):\n  Cost per video: $${costPerVideo.toFixed(4)}\n\nMonthly projection (22 videos/week × 4 weeks):\n  Cost per month: $${costPerMonth.toFixed(2)}\n\nNote: Phase 6 used a small transcript excerpt (~500 tokens). Real phase 1-3 calls\nuse full transcript (~30K-50K tokens) so cost per video is likely 5-10x this.\nRecommend re-measuring with real PPTNC transcript via integrated app.`
  )

  record({
    ac: 'AC4',
    status: 'PASS',
    message: `Custo da chamada AC3: $${costUsd.toFixed(6)} | Projeção mensal preliminar: $${costPerMonth.toFixed(2)}`,
    details: { inputTokens, outputTokens, costUsd, costPerMonth },
  })
}

/**
 * AC5 — Context window stress test. Gera texto sintético próximo do limite
 * pra ver como Claude se comporta. Sonnet 4.6 = 1M context, então 180K
 * (10% do limite) é stress ainda longe do teto.
 */
async function runAc5(): Promise<void> {
  log('\n=== AC5 — Context window stress (~180K tokens sintéticos) ===\n')
  // ~180K tokens ≈ ~700KB de texto. Repetimos um parágrafo realista.
  const filler = 'A engenharia de software é um campo em constante evolução. '.repeat(15000)
  const t0 = Date.now()
  try {
    const client = getClient()
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Aqui está um texto longo:\n\n${filler}\n\nResponda em uma frase: qual era o tema desse texto?`,
        },
      ],
    })
    const content = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
    const durationMs = Date.now() - t0

    writeFileSync(
      join(OUT_DIR, 'ac5-output.txt'),
      `Input tokens (Claude reported): ${response.usage.input_tokens}\nOutput tokens: ${response.usage.output_tokens}\nDuration: ${durationMs}ms\n\nResponse: ${content}`
    )

    record({
      ac: 'AC5',
      status: 'PASS',
      message: `Lida com ~180K tokens sintéticos em ${(durationMs / 1000).toFixed(1)}s`,
      durationMs,
      details: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    })
  } catch (error) {
    record({
      ac: 'AC5',
      status: 'FAIL',
      message: `${(error as Error).message ?? String(error)}`,
    })
  }
}

/**
 * AC6 — Streaming semantics. Captura tipos de eventos do stream pra
 * comparar com chunks do `GoogleGenAI` no design do adapter.
 */
async function runAc6(): Promise<void> {
  log('\n=== AC6 — Streaming semantics ===\n')
  const t0 = Date.now()
  try {
    const client = getClient()
    const stream = await client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: 'Conte de 1 a 5 separado por vírgula.' }],
    })

    const events: string[] = []
    let accumulated = ''

    for await (const event of stream) {
      events.push(event.type)
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        accumulated += event.delta.text
      }
    }

    const finalMessage = await stream.finalMessage()
    const durationMs = Date.now() - t0

    writeFileSync(
      join(OUT_DIR, 'ac6-output.txt'),
      `Stream events (in order): ${events.join(' → ')}\n\nAccumulated text: ${accumulated}\n\nFinal message usage: ${JSON.stringify(finalMessage.usage, null, 2)}`
    )

    record({
      ac: 'AC6',
      status: 'PASS',
      message: 'Streaming funcionou; eventos capturados',
      durationMs,
      details: {
        eventTypes: Array.from(new Set(events)),
        textLen: accumulated.length,
      },
    })
  } catch (error) {
    record({
      ac: 'AC6',
      status: 'FAIL',
      message: `${(error as Error).message ?? String(error)}`,
    })
  }
}

async function main() {
  const argAc = process.argv.find((a) => a.startsWith('--ac='))?.split('=')[1] ?? 'all'

  mkdirSync(OUT_DIR, { recursive: true })
  log(`Output dir: ${OUT_DIR}`)
  log(`Project: ${GCP_PROJECT_ID}`)
  log(`Region: ${ANTHROPIC_REGION}`)
  log(`Claude model: ${CLAUDE_MODEL}`)
  log(`Gemini comparison model: ${GEMINI_MODEL} (not invoked in this script — separate run)\n`)

  const toRun = argAc === 'all' ? ['2', '3', '4', '5', '6'] : [argAc]

  if (toRun.includes('2')) await runAc2()
  if (toRun.includes('3')) await runAc3()
  if (toRun.includes('4')) runAc4()
  if (toRun.includes('5')) await runAc5()
  if (toRun.includes('6')) await runAc6()

  writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2))

  log(`\n=== Summary ===`)
  log(`Total ACs: ${results.length}`)
  log(`PASS: ${results.filter((r) => r.status === 'PASS').length}`)
  log(`FAIL: ${results.filter((r) => r.status === 'FAIL').length}`)
  log(`WARN: ${results.filter((r) => r.status === 'WARN').length}`)
  log(`SKIP: ${results.filter((r) => r.status === 'SKIP').length}`)
  log(`\nResults JSON: ${join(OUT_DIR, 'results.json')}`)

  const anyFail = results.some((r) => r.status === 'FAIL')
  process.exit(anyFail ? 1 : 0)
}

main().catch((e) => {
  log(`Fatal error: ${e}`)
  process.exit(2)
})
