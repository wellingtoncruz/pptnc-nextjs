/**
 * Migration Script: videos → podcasts/{podcastId}/videos
 *
 * This script migrates the legacy flat `videos` collection to the
 * white-label ready subcollection structure.
 *
 * Features:
 * - Idempotent: Can be run multiple times safely
 * - Soft migration: Original documents are NOT deleted
 * - Adds fields: podcastId, migratedAt
 * - Generates migration report
 *
 * Prerequisites:
 * - gcloud auth application-default login
 * - Access to pptnc-stage Firestore
 *
 * Usage:
 *   pnpm migrate:videos
 *
 * @see architecture-iara.md#Data Architecture
 * @see retrospective-epic-1-iara.md#Lessons Learned - LL1
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

// Configuration
const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage' // Named database, not (default)
const PODCAST_ID = 'pptnc'
const SOURCE_COLLECTION = 'videos'
const TARGET_COLLECTION = `podcasts/${PODCAST_ID}/videos`

// Types
interface MigrationReport {
  sourceCount: number
  migrated: number
  skipped: number
  errors: number
  errorDetails: Array<{ docId: string; error: string }>
  startTime: Date
  endTime: Date
  durationMs: number
}

interface VideoDocument {
  [key: string]: unknown
}

// Initialize Firebase Admin
function initFirebase() {
  let app
  if (getApps().length === 0) {
    app = initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    })
    console.log(`✓ Firebase initialized for project: ${PROJECT_ID}`)
  } else {
    app = getApps()[0]
  }
  // Use named database, not (default)
  return getFirestore(app, FIRESTORE_DATABASE_ID)
}

// Structured logging helper
function log(
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  context?: Record<string, unknown>
) {
  const entry = {
    severity: level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  }
  console.log(JSON.stringify(entry))
}

// Main migration function
async function migrate(): Promise<MigrationReport> {
  const startTime = new Date()
  const db = initFirebase()

  const report: MigrationReport = {
    sourceCount: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
    startTime,
    endTime: new Date(),
    durationMs: 0,
  }

  console.log('\n========================================')
  console.log('  VIDEO MIGRATION TO SUBCOLLECTION')
  console.log('========================================')
  console.log(`Source: ${SOURCE_COLLECTION}`)
  console.log(`Target: ${TARGET_COLLECTION}`)
  console.log(`Project: ${PROJECT_ID}`)
  console.log('========================================\n')

  // Step 1: Read all source documents
  log('INFO', 'Reading source collection', { collection: SOURCE_COLLECTION })
  const sourceSnapshot = await db.collection(SOURCE_COLLECTION).get()
  report.sourceCount = sourceSnapshot.size

  log('INFO', 'Source documents found', { count: report.sourceCount })

  if (report.sourceCount === 0) {
    log('WARN', 'No documents found in source collection')
    report.endTime = new Date()
    report.durationMs = report.endTime.getTime() - startTime.getTime()
    return report
  }

  // Step 2: Migrate each document
  for (const doc of sourceSnapshot.docs) {
    const docId = doc.id
    const sourceData = doc.data() as VideoDocument

    // Check if already exists in target
    const targetRef = db.collection(TARGET_COLLECTION).doc(docId)
    const targetDoc = await targetRef.get()

    if (targetDoc.exists) {
      log('INFO', 'Document already exists, skipping', {
        docId,
        collection: TARGET_COLLECTION,
      })
      report.skipped++
      continue
    }

    // Migrate document
    try {
      const migratedData = {
        ...sourceData,
        podcastId: PODCAST_ID,
        migratedAt: FieldValue.serverTimestamp(),
      }

      await targetRef.set(migratedData)

      log('INFO', 'Document migrated successfully', {
        docId,
        podcastId: PODCAST_ID,
      })
      report.migrated++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log('ERROR', 'Failed to migrate document', {
        docId,
        error: errorMessage,
      })
      report.errors++
      report.errorDetails.push({ docId, error: errorMessage })
    }
  }

  // Step 3: Validate counts
  const targetSnapshot = await db.collection(TARGET_COLLECTION).get()
  const targetCount = targetSnapshot.size

  log('INFO', 'Validation complete', {
    sourceCount: report.sourceCount,
    targetCount,
    migrated: report.migrated,
    skipped: report.skipped,
    errors: report.errors,
  })

  report.endTime = new Date()
  report.durationMs = report.endTime.getTime() - startTime.getTime()

  return report
}

// Print final report
function printReport(report: MigrationReport) {
  console.log('\n========================================')
  console.log('        MIGRATION REPORT')
  console.log('========================================')
  console.log(`Source documents:    ${report.sourceCount}`)
  console.log(`Migrated (new):      ${report.migrated}`)
  console.log(`Skipped (existing):  ${report.skipped}`)
  console.log(`Errors:              ${report.errors}`)
  console.log(`Duration:            ${report.durationMs}ms`)
  console.log('========================================')

  if (report.errors > 0) {
    console.log('\n⚠️  ERRORS OCCURRED:')
    for (const err of report.errorDetails) {
      console.log(`  - ${err.docId}: ${err.error}`)
    }
  }

  // Validation check
  const expectedTarget = report.migrated + report.skipped
  if (expectedTarget === report.sourceCount && report.errors === 0) {
    console.log('\n✅ MIGRATION SUCCESSFUL')
    console.log(`   All ${report.sourceCount} documents accounted for.`)
  } else if (report.errors > 0) {
    console.log('\n⚠️  MIGRATION COMPLETED WITH ERRORS')
    console.log(`   ${report.errors} document(s) failed to migrate.`)
  } else {
    console.log('\n✅ MIGRATION COMPLETE')
  }

  console.log('')
}

// Entry point
async function main() {
  try {
    const report = await migrate()
    printReport(report)

    // Exit with error code if there were errors
    if (report.errors > 0) {
      process.exit(1)
    }
  } catch (error) {
    log('ERROR', 'Migration failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    console.error('\n❌ MIGRATION FAILED')
    console.error(error)
    process.exit(1)
  }
}

main()
