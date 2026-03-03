/**
 * Migration Script: Generate embeddings for all existing episodes.
 *
 * Replaces invalid embeddings from the old Python batch (which used
 * wrong fields `titulo`/`descricao`) with correct ones using `title`/`description`.
 *
 * Features:
 * - Idempotent: Can be run multiple times safely (overwrites existing embeddings)
 * - Best-effort: Individual failures don't stop processing
 * - Batched: Processes 50 videos per batch with delay between batches
 * - Reports progress and final summary
 *
 * Prerequisites:
 * - gcloud auth application-default login
 * - Access to pptnc-stage Firestore
 *
 * Usage:
 *   npx tsx scripts/migrate-embeddings.ts
 *
 * @see epic-17-video-embeddings.md#Story 17.4
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'
import { GoogleGenAI } from '@google/genai'

// ============================================
// Configuration
// ============================================

const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage'
const GCP_REGION = 'us-east1'
const PODCAST_ID = 'pptnc'
const EMBEDDING_MODEL = 'text-embedding-004'
const EMBEDDING_DIMENSIONS = 768
const BATCH_SIZE = 50
const DELAY_BETWEEN_BATCHES_MS = 1000
const FALLBACK_TEXT = 'Vídeo sem título e descrição'

// ============================================
// Types
// ============================================

export interface MigrationReport {
  totalEpisodes: number
  succeeded: number
  failed: number
  errors: Array<{ videoId: string; error: string }>
  durationMs: number
}

// ============================================
// Initialization
// ============================================

function initFirebase(): Firestore {
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    })
    console.log(`✓ Firebase initialized for project: ${PROJECT_ID}`)
  }
  return getFirestore(getApps()[0], FIRESTORE_DATABASE_ID)
}

function initVertexAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: PROJECT_ID,
    location: GCP_REGION,
  })
}

// ============================================
// Core Logic (exported for testing)
// ============================================

/**
 * Generates embedding for the given text using Vertex AI.
 */
export async function generateEmbedding(ai: GoogleGenAI, text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  })

  if (!response.embeddings || response.embeddings.length === 0) {
    throw new Error('Empty embeddings response from Vertex AI')
  }

  const values = response.embeddings[0].values
  if (!values || values.length === 0) {
    throw new Error('Empty values in embedding response')
  }

  return values
}

/**
 * Main migration logic — processes all episodes and generates embeddings.
 *
 * Exported for testing. The `main()` function calls this with real Firebase/AI instances.
 *
 * @param db - Firestore instance
 * @param ai - GoogleGenAI instance
 * @returns Migration report with counts and errors
 */
export async function migrateEmbeddings(db: Firestore, ai: GoogleGenAI): Promise<MigrationReport> {
  const startTime = Date.now()

  // Query all episodes (ignore hasEmbedding — regenerate all)
  const videosRef = db.collection('podcasts').doc(PODCAST_ID).collection('videos')
  const snapshot = await videosRef.where('videoType', '==', 'episode').get()

  console.log(`Found ${snapshot.size} episodes to process`)

  let succeeded = 0
  let failed = 0
  const errors: Array<{ videoId: string; error: string }> = []

  // Process in batches
  const docs = snapshot.docs
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(docs.length / BATCH_SIZE)

    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} videos)...`)

    for (const doc of batch) {
      const data = doc.data()
      const title = data.title || ''
      const description = data.description || ''
      const text = `${title} ${description}`.trim() || FALLBACK_TEXT

      try {
        const embedding = await generateEmbedding(ai, text)
        await doc.ref.update({
          summaryVector: FieldValue.vector(embedding),
          hasEmbedding: true,
          updatedAt: FieldValue.serverTimestamp(),
        })
        succeeded++
      } catch (error) {
        failed++
        const msg = error instanceof Error ? error.message : String(error)
        errors.push({ videoId: doc.id, error: msg })
        console.error(`  ✗ ${doc.id}: ${msg}`)
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`  Batch ${batchNum} done. Progress: ${succeeded + failed}/${docs.length} (${elapsed}s)`)

    // Delay between batches (except last)
    if (i + BATCH_SIZE < docs.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS))
    }
  }

  return {
    totalEpisodes: docs.length,
    succeeded,
    failed,
    errors,
    durationMs: Date.now() - startTime,
  }
}

// ============================================
// Report
// ============================================

function printReport(report: MigrationReport): void {
  const durationSec = (report.durationMs / 1000).toFixed(1)

  console.log('\n========================================')
  console.log('        MIGRATION REPORT')
  console.log('========================================')
  console.log(`Total episodes:  ${report.totalEpisodes}`)
  console.log(`Succeeded:       ${report.succeeded}`)
  console.log(`Failed:          ${report.failed}`)
  console.log(`Duration:        ${durationSec}s`)

  if (report.errors.length > 0) {
    console.log('\n⚠️  ERRORS:')
    for (const { videoId, error } of report.errors) {
      console.log(`  - ${videoId}: ${error}`)
    }
  }

  if (report.failed === 0) {
    console.log('\n✅ MIGRATION SUCCESSFUL')
  } else {
    console.log(`\n⚠️  MIGRATION COMPLETED WITH ${report.failed} ERRORS`)
  }
}

// ============================================
// Entry Point
// ============================================

async function main(): Promise<void> {
  console.log('═'.repeat(60))
  console.log('  MIGRATE EMBEDDINGS — Epic 17.4')
  console.log('═'.repeat(60))
  console.log()

  try {
    const db = initFirebase()
    const ai = initVertexAI()
    const report = await migrateEmbeddings(db, ai)
    printReport(report)

    if (report.failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ MIGRATION FAILED')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Only run when executed directly (not imported by tests)
if (!process.env.VITEST) {
  main()
}
