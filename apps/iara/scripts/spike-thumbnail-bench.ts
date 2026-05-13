/**
 * Epic 22 — Spike bench: Imagen vs Gemini-2.5-image-output for thumbnails.
 *
 * Reads Base + Referência images from `podcast.prompts.{videoType}.thumbnail`
 * (populated in Story 22.1), runs N generations per (model, prompt) pair, and
 * writes every output + a manifest locally to `spike-tmp/{run-id}/` so
 * Wellington can browse images directly without an extra `gsutil cp` step.
 *
 * Default is `--video-type episode` because `cut` requires uploading a guest
 * photo at runtime (only available via the wizard, not yet implemented).
 *
 * ONE-OFF: not production code. Kept in scripts/ for reproducibility — see
 * the cleanup section in spike-image-generation-models.md once the ADR is
 * recorded.
 *
 * ===== Usage =====
 *
 *   pnpm --filter iara exec tsx scripts/spike-thumbnail-bench.ts \
 *     --podcast pptnc \
 *     --video-type episode \
 *     --models gemini-3.1-flash-image-preview,gemini-3-pro-image-preview \
 *     --iterations 5 \
 *     --prompts scripts/spike-prompts.json
 *
 * Defaults: --podcast pptnc, --video-type episode,
 *           --models gemini-3.1-flash-image-preview,gemini-3-pro-image-preview
 *           (see DEFAULT_MODELS), --iterations 5,
 *           --prompts scripts/spike-prompts.json
 *
 * --models accepts ANY Vertex AI image model ID; family (gemini vs imagen) is
 * derived from the prefix. Examples:
 *   - gemini-3.1-flash-image-preview  (Nano Banana 2, SOTA Feb/2026)
 *   - gemini-3-pro-image-preview      (Gemini 3 Pro Image, até 14 references)
 *   - gemini-2.5-flash-image          (Nano Banana, baseline antigo)
 *   - imagen-4.0-generate-001         (Imagen 4 stable)
 *   - imagen-3.0-capability-001       (Imagen 3 com references)
 *
 * ===== Prereqs =====
 *
 * 1. gcloud auth application-default login   (ADC for Firestore + Vertex AI)
 * 2. podcast.prompts.episode.thumbnail.baseImageUrl + referenceImageUrl
 *    populated via Settings UI (Story 22.1, validated 2026-05-12)
 * 3. Vertex AI quota for the chosen models in the configured VERTEX_AI_LOCATION
 *    (default 'global'). Preview models may need explicit allowlist no projeto.
 *
 * ===== Outputs =====
 *
 * - `spike-tmp/{ISO-timestamp}/{model}/{prompt-id}/iter-{n}.{ext}` — generated images
 * - `spike-tmp/{ISO-timestamp}/manifest.json` — timing + sizes + local paths + errors
 * - Stdout: per-call timing + final summary table
 *
 * The folder `spike-tmp/` is gitignored.
 *
 * ===== After running =====
 *
 * Wellington opens `spike-tmp/{run-id}/` directly in the file manager (or VS Code
 * with an image preview extension), reviews lado a lado, scores each model on
 * the 6 criteria from the spike doc, and fills the ADR.
 */

import { mkdir, writeFile, readFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'

import * as dotenv from 'dotenv'
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import {
  GoogleGenAI,
  RawReferenceImage,
  StyleReferenceImage,
} from '@google/genai'

// Load .env.local so we pick up NEWSLETTER_IMAGES_BUCKET (default `iara-images`
// for this project) and any other overrides the app uses at runtime. Without
// this the script falls back to the project-default bucket which Firebase
// Storage doesn't always create.
dotenv.config({ path: resolve(__dirname, '..', '.env.local') })

// =============================================================================
// CLI argument parsing (no extra deps)
// =============================================================================

/** Family of an image-generation model. Drives which SDK path the bench uses. */
type ModelFamily = 'gemini' | 'imagen'

interface ModelSpec {
  /** Vertex AI model ID (e.g. `gemini-3.1-flash-image-preview`). */
  id: string
  /** Family — derived from the ID prefix. */
  family: ModelFamily
}

interface CliArgs {
  podcast: string
  videoType: 'episode' | 'cut'
  models: ModelSpec[]
  iterations: number
  promptsFile: string
}

/**
 * Default models — updated 2026-05-12 after the first spike run revealed that
 * `gemini-2.5-flash-image` and `imagen-3.0-capability-001` are too defasados
 * for this use case. Wellington confirmed perfect results on Gemini Web with:
 *   - Nano Banana 2 = gemini-3.1-flash-image-preview (Feb/2026, SOTA)
 *   - Gemini 3 Pro Image = gemini-3-pro-image-preview (até 14 reference inputs)
 *
 * Both are preview models at the time of this script; check availability with
 *   gcloud ai models list --region={location}
 * before running. Override via --models if a model isn't enabled for your project.
 */
const DEFAULT_MODELS = ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']

function resolveFamily(id: string): ModelFamily {
  if (id.startsWith('gemini-')) return 'gemini'
  if (id.startsWith('imagen-')) return 'imagen'
  throw new Error(
    `Model ID "${id}" não reconhecido — prefixo deve ser 'gemini-' ou 'imagen-'. ` +
      'Pra adicionar suporte a outras famílias, estenda generateForModel().'
  )
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const get = (flag: string, fallback: string) => {
    const i = args.indexOf(flag)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
  }
  // Default = episode. `cut` would require a runtime guest photo upload that
  // only the wizard provides — out of scope for this spike (decided 2026-05-12).
  const videoType = get('--video-type', 'episode') as CliArgs['videoType']
  if (videoType !== 'episode' && videoType !== 'cut') {
    throw new Error(`--video-type deve ser 'episode' ou 'cut', recebido: ${videoType}`)
  }
  if (videoType === 'cut') {
    console.warn(
      "Aviso: --video-type cut foi escolhido manualmente. Spike padrão é 'episode' porque cut " +
        'depende de foto do convidado em tempo de execução (só disponível pelo wizard). ' +
        'Prossiga apenas se você tem certeza de que `podcast.prompts.cut.thumbnail` está populado e ' +
        'aceita rodar sem a foto do convidado como reference adicional.'
    )
  }
  const modelsArg = get('--models', DEFAULT_MODELS.join(','))
  const models: ModelSpec[] = modelsArg.split(',').map((id) => {
    const trimmed = id.trim()
    return { id: trimmed, family: resolveFamily(trimmed) }
  })
  return {
    podcast: get('--podcast', 'pptnc'),
    videoType,
    models,
    iterations: Number.parseInt(get('--iterations', '5'), 10),
    promptsFile: get('--prompts', 'scripts/spike-prompts.json'),
  }
}

// =============================================================================
// Config — mirrors apps/iara/src/lib/firebase/config.ts but standalone for this
// script. Hardcoded fallbacks match production stage values.
// =============================================================================

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'pptnc-stage'
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'pptnc-stage'
const VERTEX_AI_LOCATION = process.env.VERTEX_AI_LOCATION || 'global'
// Default `iara-images` matches .env.local in this project. The Story 22.1
// uploadThumbnailConfigImage writes into this same bucket.
const NEWSLETTER_IMAGES_BUCKET = process.env.NEWSLETTER_IMAGES_BUCKET || 'iara-images'

// Model IDs now come from CLI / DEFAULT_MODELS (see parseArgs). Kept as a fallback
// reference for one-off invocations: `imagen-3.0-capability-001` and
// `imagen-4.0-generate-001` are the known Imagen IDs with reference-image support.

// =============================================================================
// Firebase / Vertex AI init
// =============================================================================

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: NEWSLETTER_IMAGES_BUCKET,
  })
}
const db = getFirestore(undefined as never, FIRESTORE_DATABASE_ID)
const bucket = getStorage().bucket(NEWSLETTER_IMAGES_BUCKET)
const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: VERTEX_AI_LOCATION,
})

// =============================================================================
// Types
// =============================================================================

interface SpikePrompt {
  /** Short ID used in output paths (e.g. "episode-padrao"). */
  id: string
  /** Human-readable note about what this scenario covers (logged only). */
  description: string
  /**
   * Video field values to substitute into `{{video.fieldName}}` placeholders
   * found in the thumbnail config (description / expectedOutput) and in the
   * optional `observation` below. Same syntax as src/lib/youtube/format-chapters.ts.
   */
  video: Record<string, string>
  /** Optional extra context appended after the interpolated config sections. */
  observation?: string
}

/**
 * Replaces {{video.fieldName}} placeholders in a template string.
 * Inline port of resolveVideoPlaceholders in src/lib/youtube/format-chapters.ts —
 * kept inline so this one-off script has no app imports.
 */
function resolveVideoPlaceholders(template: string, video: Record<string, string>): string {
  return template.replace(/\{\{video\.(\w+)\}\}/g, (_match, field: string) => {
    const value = video[field]
    if (value == null || value === '') return ''
    return String(value)
  })
}

interface ThumbnailConfig {
  description: string
  expectedOutput: string
  baseImageUrl?: string
  baseImageMimeType?: string
  referenceImageUrl?: string
  referenceImageMimeType?: string
}

interface RunResult {
  modelId: string
  family: ModelFamily
  promptId: string
  iteration: number
  startedAt: string
  durationMs: number
  outputLocalPath?: string
  outputBytes?: number
  outputMimeType?: string
  error?: string
}

// =============================================================================
// Helpers — load podcast config, decode proxy URL, download image bytes
// =============================================================================

/**
 * The Settings UI persists Cloud Storage paths as proxy URLs:
 *   /api/settings/thumbnail-config?path={gcs-path}
 * Extract the raw GCS path for direct bucket access.
 */
function extractGcsPath(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl, 'http://localhost')
    const p = url.searchParams.get('path')
    if (p) return p
  } catch {
    // fall through
  }
  // Already a raw path?
  return proxyUrl.replace(/^\/?/, '')
}

async function downloadFromGcs(gcsPath: string): Promise<Buffer> {
  const [contents] = await bucket.file(gcsPath).download()
  return contents
}

async function loadPodcastThumbnailConfig(
  podcastId: string,
  videoType: 'episode' | 'cut'
): Promise<ThumbnailConfig> {
  const doc = await db.collection('podcasts').doc(podcastId).get()
  if (!doc.exists) throw new Error(`podcast "${podcastId}" não encontrado`)
  const data = doc.data() as Record<string, unknown>
  const prompts = data.prompts as Record<string, unknown> | undefined
  const typed = prompts?.[videoType] as Record<string, unknown> | undefined
  const thumb = typed?.thumbnail as ThumbnailConfig | undefined
  if (!thumb) throw new Error(`prompts.${videoType}.thumbnail não configurado (rode Story 22.1 first)`)
  if (!thumb.baseImageUrl || !thumb.referenceImageUrl) {
    throw new Error(`baseImageUrl/referenceImageUrl ausentes em prompts.${videoType}.thumbnail`)
  }
  return thumb
}

// =============================================================================
// Generators
// =============================================================================

/**
 * Gemini family (2.5, 3.x and beyond) — text + reference images merged into a
 * single `contents` parts array. Uses `generateContent` with
 * responseModalities=['TEXT', 'IMAGE']. Works identically across Gemini 2.5
 * Flash Image, Gemini 3 Pro Image and Gemini 3.1 Flash Image (Nano Banana 2).
 */
async function generateGemini(
  modelId: string,
  prompt: string,
  refs: Array<{ data: string; mimeType: string }>
): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: modelId,
    contents: [
      ...refs.map((r) => ({ inlineData: { data: r.data, mimeType: r.mimeType } })),
      { text: prompt },
    ],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '16:9' },
    },
  })

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return {
        buffer: Buffer.from(part.inlineData.data, 'base64'),
        mimeType: part.inlineData.mimeType || 'image/png',
      }
    }
  }
  throw new Error(`${modelId} não retornou imagem inline`)
}

/**
 * Imagen family (3.x / 4.x capability models) — uses editImage with style +
 * raw references. Same SDK shape works across versions; only the model ID
 * changes (`imagen-3.0-capability-001`, `imagen-4.0-capability-*`, etc.).
 *
 * Mapping (initial guess, ajuste conforme o resultado):
 * - Base config    → RawReferenceImage (composition starting point)
 * - Reference config → StyleReferenceImage (reproduce visual characteristics)
 */
async function generateImagen(
  modelId: string,
  prompt: string,
  baseBytes: Buffer,
  baseMimeType: string,
  referenceBytes: Buffer,
  referenceMimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const baseRef = new RawReferenceImage()
  baseRef.referenceId = 1
  baseRef.referenceImage = { imageBytes: baseBytes.toString('base64'), mimeType: baseMimeType }

  const styleRef = new StyleReferenceImage()
  styleRef.referenceId = 2
  styleRef.referenceImage = { imageBytes: referenceBytes.toString('base64'), mimeType: referenceMimeType }
  styleRef.config = { styleDescription: 'O estilo visual da imagem [2]' }

  // Prompt is augmented with reference markers so the model knows which slots
  // map to which references (Imagen convention: [N] refers to referenceId=N).
  const augmentedPrompt = `${prompt}\n\nUse a composição da imagem [1] e o estilo visual da imagem [2].`

  const response = await ai.models.editImage({
    model: modelId,
    prompt: augmentedPrompt,
    referenceImages: [baseRef, styleRef],
    config: { numberOfImages: 1, aspectRatio: '16:9', includeRaiReason: true },
  })

  const first = response.generatedImages?.[0]
  const bytes = first?.image?.imageBytes
  if (!bytes) {
    const reason = first?.raiFilteredReason || `sem detalhe do ${modelId}`
    throw new Error(`${modelId} não retornou bytes (${reason})`)
  }
  return {
    buffer: Buffer.from(bytes, 'base64'),
    mimeType: first?.image?.mimeType || 'image/png',
  }
}

// =============================================================================
// Main loop
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs()
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const localOutDir = resolve(process.cwd(), 'spike-tmp', runId)
  await mkdir(localOutDir, { recursive: true })

  console.log(`Spike bench iniciando — run-id: ${runId}`)
  console.log(`  podcast: ${args.podcast}`)
  console.log(`  videoType: ${args.videoType}`)
  console.log(`  models: ${args.models.map((m) => m.id).join(', ')}`)
  console.log(`  iterations per (model, prompt): ${args.iterations}`)
  console.log(`  output: ${localOutDir}`)
  console.log(`  vertex location: ${VERTEX_AI_LOCATION}`)

  // 1. Load podcast thumbnail config
  const cfg = await loadPodcastThumbnailConfig(args.podcast, args.videoType)
  console.log(`\nThumbnail config carregada:`)
  console.log(`  description: "${cfg.description.slice(0, 80)}..."`)
  console.log(`  baseImageUrl: ${cfg.baseImageUrl}`)
  console.log(`  referenceImageUrl: ${cfg.referenceImageUrl}`)

  // 2. Download Base + Reference
  const basePath = extractGcsPath(cfg.baseImageUrl!)
  const refPath = extractGcsPath(cfg.referenceImageUrl!)
  console.log(`\nBaixando imagens de referência do GCS...`)
  const [baseBytes, refBytes] = await Promise.all([downloadFromGcs(basePath), downloadFromGcs(refPath)])
  console.log(`  Base: ${baseBytes.length} bytes (${cfg.baseImageMimeType})`)
  console.log(`  Reference: ${refBytes.length} bytes (${cfg.referenceImageMimeType})`)

  // 3. Load prompts
  const promptsRaw = await readFile(resolve(process.cwd(), args.promptsFile), 'utf8')
  const prompts = JSON.parse(promptsRaw) as SpikePrompt[]
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error(`Arquivo de prompts vazio ou inválido: ${args.promptsFile}`)
  }
  console.log(`\n${prompts.length} prompts carregados de ${args.promptsFile}`)

  // 4. Build full prompt = thumbnail.description + thumbnail.expectedOutput + observação,
  //    then resolve {{video.fieldName}} placeholders against the scenario's video fields.
  //    The same resolution applies to every section so a placeholder in description /
  //    expectedOutput (typed by the producer in Settings) is also substituted.
  const buildPrompt = (p: SpikePrompt): string => {
    const raw = [
      cfg.description,
      cfg.expectedOutput ? `Saída esperada: ${cfg.expectedOutput}` : '',
      p.observation ? `Observação do produtor: ${p.observation}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    return resolveVideoPlaceholders(raw, p.video)
  }

  // 5. Run combinatorial bench
  const results: RunResult[] = []
  const baseInline = { data: baseBytes.toString('base64'), mimeType: cfg.baseImageMimeType || 'image/png' }
  const refInline = { data: refBytes.toString('base64'), mimeType: cfg.referenceImageMimeType || 'image/png' }

  for (const model of args.models) {
    for (const prompt of prompts) {
      const fullPrompt = buildPrompt(prompt)
      for (let iter = 1; iter <= args.iterations; iter++) {
        const label = `${model.id}/${prompt.id}/${iter}`
        const startedAt = new Date().toISOString()
        const t0 = Date.now()
        try {
          const { buffer, mimeType } =
            model.family === 'gemini'
              ? await generateGemini(model.id, fullPrompt, [baseInline, refInline])
              : await generateImagen(
                  model.id,
                  fullPrompt,
                  baseBytes,
                  cfg.baseImageMimeType || 'image/png',
                  refBytes,
                  cfg.referenceImageMimeType || 'image/png'
                )

          const ext = mimeType.includes('jpeg') ? 'jpg' : 'png'
          const relPath = `${model.id}/${prompt.id}/iter-${iter}.${ext}`
          const absPath = join(localOutDir, relPath)
          await mkdir(dirname(absPath), { recursive: true })
          await writeFile(absPath, buffer)
          const durationMs = Date.now() - t0
          results.push({
            modelId: model.id,
            family: model.family,
            promptId: prompt.id,
            iteration: iter,
            startedAt,
            durationMs,
            outputLocalPath: relPath,
            outputBytes: buffer.length,
            outputMimeType: mimeType,
          })
          console.log(`  ✓ ${label}: ${durationMs}ms, ${buffer.length}b → ${relPath}`)
        } catch (err) {
          const durationMs = Date.now() - t0
          const error = err instanceof Error ? err.message : String(err)
          results.push({
            modelId: model.id,
            family: model.family,
            promptId: prompt.id,
            iteration: iter,
            startedAt,
            durationMs,
            error,
          })
          console.error(`  ✗ ${label}: ${error}`)
        }
      }
    }
  }

  // 6. Write local manifest
  const manifestPath = join(localOutDir, 'manifest.json')
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        runId,
        args,
        config: { baseImageUrl: cfg.baseImageUrl, referenceImageUrl: cfg.referenceImageUrl },
        prompts,
        results,
      },
      null,
      2
    )
  )

  // 7. Summary
  console.log(`\n=== Resumo ===`)
  for (const model of args.models) {
    const subset = results.filter((r) => r.modelId === model.id)
    const ok = subset.filter((r) => !r.error)
    const failed = subset.length - ok.length
    const avgMs = ok.length > 0 ? Math.round(ok.reduce((s, r) => s + r.durationMs, 0) / ok.length) : 0
    const avgBytes = ok.length > 0 ? Math.round(ok.reduce((s, r) => s + (r.outputBytes || 0), 0) / ok.length) : 0
    console.log(`  ${model.id}: ${ok.length}/${subset.length} ok, ${failed} fail, avg ${avgMs}ms, avg ${avgBytes}b`)
  }
  console.log(`\nManifest: ${manifestPath}`)
  console.log(`Imagens: ${localOutDir}/`)
  console.log(`Abra o diretório no seu file manager ou VS Code para revisar lado a lado.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Spike bench falhou:', err)
    process.exit(1)
  })
