/**
 * Migration Script: video subcollections → podcasts/{podcastId}/videos subcollections
 *
 * This script migrates all subcollections (e.g., chunks) from the legacy
 * `videos/{videoId}` structure to the new `podcasts/{podcastId}/videos/{videoId}` structure.
 *
 * Features:
 * - Discovers all subcollections automatically
 * - Idempotent: Can be run multiple times safely
 * - Preserves original document IDs
 * - Generates migration report
 *
 * Prerequisites:
 * - gcloud auth application-default login
 * - Access to pptnc-stage Firestore
 * - Main videos already migrated (run migrate-videos-to-subcollection.ts first)
 *
 * Usage:
 *   pnpm migrate:video-subcollections
 *
 * @see architecture-iara.md#Data Architecture
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

// Configuration
const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage'
const PODCAST_ID = 'pptnc'
const SOURCE_COLLECTION = 'videos'
const TARGET_BASE = `podcasts/${PODCAST_ID}/videos`

// Types
interface MigrationReport {
  videosProcessed: number
  subcollectionsFound: Record<string, number>
  documentsMigrated: Record<string, number>
  documentsSkipped: Record<string, number>
  errors: number
  errorDetails: Array<{ path: string; error: string }>
  startTime: Date
  endTime: Date
  durationMs: number
}

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
  return getFirestore(app, FIRESTORE_DATABASE_ID)
}

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

async function migrate(): Promise<MigrationReport> {
  const startTime = new Date()
  const db = initFirebase()

  const report: MigrationReport = {
    videosProcessed: 0,
    subcollectionsFound: {},
    documentsMigrated: {},
    documentsSkipped: {},
    errors: 0,
    errorDetails: [],
    startTime,
    endTime: new Date(),
    durationMs: 0,
  }

  console.log('\n========================================')
  console.log('  VIDEO SUBCOLLECTION MIGRATION')
  console.log('========================================')
  console.log(`Source: ${SOURCE_COLLECTION}/{videoId}/*`)
  console.log(`Target: ${TARGET_BASE}/{videoId}/*`)
  console.log(`Project: ${PROJECT_ID}`)
  console.log('========================================\n')

  // Get all source video documents
  log('INFO', 'Reading source videos', { collection: SOURCE_COLLECTION })
  const sourceVideos = await db.collection(SOURCE_COLLECTION).get()

  log('INFO', 'Videos to process', { count: sourceVideos.size })

  for (const videoDoc of sourceVideos.docs) {
    const videoId = videoDoc.id
    report.videosProcessed++

    // List all subcollections for this video
    const subcollections = await videoDoc.ref.listCollections()

    for (const subcollection of subcollections) {
      const subcollName = subcollection.id

      // Initialize counters for this subcollection type
      if (!report.subcollectionsFound[subcollName]) {
        report.subcollectionsFound[subcollName] = 0
        report.documentsMigrated[subcollName] = 0
        report.documentsSkipped[subcollName] = 0
      }

      // Get all documents in the subcollection
      const subDocs = await subcollection.get()
      report.subcollectionsFound[subcollName] += subDocs.size

      for (const subDoc of subDocs.docs) {
        const subDocId = subDoc.id
        const sourcePath = `${SOURCE_COLLECTION}/${videoId}/${subcollName}/${subDocId}`
        const targetPath = `${TARGET_BASE}/${videoId}/${subcollName}/${subDocId}`

        // Check if already exists in target
        const targetRef = db.doc(targetPath)
        const targetDoc = await targetRef.get()

        if (targetDoc.exists) {
          report.documentsSkipped[subcollName]++
          continue
        }

        // Migrate the document
        try {
          const sourceData = subDoc.data()

          await targetRef.set({
            ...sourceData,
            _migratedAt: FieldValue.serverTimestamp(),
          })

          report.documentsMigrated[subcollName]++

          // Log progress every 100 documents
          const totalMigrated = Object.values(report.documentsMigrated).reduce((a, b) => a + b, 0)
          if (totalMigrated % 100 === 0) {
            log('INFO', 'Migration progress', {
              migrated: totalMigrated,
              videosProcessed: report.videosProcessed,
            })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          log('ERROR', 'Failed to migrate subcollection document', {
            sourcePath,
            targetPath,
            error: errorMessage,
          })
          report.errors++
          report.errorDetails.push({ path: sourcePath, error: errorMessage })
        }
      }
    }

    // Log progress every 100 videos
    if (report.videosProcessed % 100 === 0) {
      console.log(`Processed ${report.videosProcessed}/${sourceVideos.size} videos...`)
    }
  }

  report.endTime = new Date()
  report.durationMs = report.endTime.getTime() - startTime.getTime()

  return report
}

function printReport(report: MigrationReport) {
  console.log('\n========================================')
  console.log('     SUBCOLLECTION MIGRATION REPORT')
  console.log('========================================')
  console.log(`Videos processed:    ${report.videosProcessed}`)
  console.log(`Duration:            ${Math.round(report.durationMs / 1000)}s`)
  console.log(`Errors:              ${report.errors}`)
  console.log('')

  console.log('--- Subcollection Summary ---')
  for (const subcollName of Object.keys(report.subcollectionsFound)) {
    const found = report.subcollectionsFound[subcollName]
    const migrated = report.documentsMigrated[subcollName]
    const skipped = report.documentsSkipped[subcollName]
    console.log(`📁 ${subcollName}:`)
    console.log(`   Found:    ${found}`)
    console.log(`   Migrated: ${migrated}`)
    console.log(`   Skipped:  ${skipped}`)
  }

  console.log('========================================')

  if (report.errors > 0) {
    console.log('\n⚠️  ERRORS OCCURRED:')
    for (const err of report.errorDetails.slice(0, 10)) {
      console.log(`  - ${err.path}: ${err.error}`)
    }
    if (report.errorDetails.length > 10) {
      console.log(`  ... and ${report.errorDetails.length - 10} more`)
    }
  }

  const totalMigrated = Object.values(report.documentsMigrated).reduce((a, b) => a + b, 0)
  const totalFound = Object.values(report.subcollectionsFound).reduce((a, b) => a + b, 0)

  if (totalMigrated + Object.values(report.documentsSkipped).reduce((a, b) => a + b, 0) === totalFound && report.errors === 0) {
    console.log('\n✅ SUBCOLLECTION MIGRATION SUCCESSFUL')
    console.log(`   All ${totalFound} subcollection documents accounted for.`)
  } else if (report.errors > 0) {
    console.log('\n⚠️  MIGRATION COMPLETED WITH ERRORS')
  } else {
    console.log('\n✅ MIGRATION COMPLETE')
  }

  console.log('')
}

async function main() {
  try {
    const report = await migrate()
    printReport(report)

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
