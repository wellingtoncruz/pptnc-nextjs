/**
 * Inspection Script: Discover subcollections in videos documents
 *
 * This script inspects the legacy `videos` collection to discover
 * what subcollections exist and their structure.
 *
 * Usage:
 *   pnpm tsx scripts/inspect-video-subcollections.ts
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage'
const SOURCE_COLLECTION = 'videos'

function initFirebase() {
  let app
  if (getApps().length === 0) {
    app = initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    })
  } else {
    app = getApps()[0]
  }
  return getFirestore(app, FIRESTORE_DATABASE_ID)
}

async function inspectSubcollections() {
  const db = initFirebase()
  console.log('\n=== INSPECTING VIDEO SUBCOLLECTIONS ===\n')

  // Get all video documents
  const videosSnapshot = await db.collection(SOURCE_COLLECTION).get()
  console.log(`Total videos: ${videosSnapshot.size}\n`)

  // Track subcollection statistics
  const subcollectionStats: Record<string, {
    count: number
    sampleDocIds: string[]
    sampleData: unknown[]
  }> = {}

  let inspected = 0
  const sampleSize = 50 // Inspect first N videos for subcollections

  for (const videoDoc of videosSnapshot.docs) {
    if (inspected >= sampleSize) break

    const videoId = videoDoc.id

    // List all subcollections for this document
    const collections = await videoDoc.ref.listCollections()

    for (const collection of collections) {
      const collName = collection.id

      if (!subcollectionStats[collName]) {
        subcollectionStats[collName] = {
          count: 0,
          sampleDocIds: [],
          sampleData: [],
        }
      }

      // Get documents in this subcollection
      const subDocs = await collection.get()

      if (subDocs.size > 0) {
        subcollectionStats[collName].count += subDocs.size

        if (subcollectionStats[collName].sampleDocIds.length < 3) {
          subcollectionStats[collName].sampleDocIds.push(videoId)

          // Store sample data from first document
          const firstDoc = subDocs.docs[0]
          subcollectionStats[collName].sampleData.push({
            videoId,
            subDocId: firstDoc.id,
            data: firstDoc.data(),
          })
        }
      }
    }

    inspected++
    if (inspected % 10 === 0) {
      console.log(`Inspected ${inspected}/${sampleSize} videos...`)
    }
  }

  // Print results
  console.log('\n=== SUBCOLLECTION DISCOVERY RESULTS ===\n')

  if (Object.keys(subcollectionStats).length === 0) {
    console.log('No subcollections found in the first', sampleSize, 'videos.')
  } else {
    for (const [name, stats] of Object.entries(subcollectionStats)) {
      console.log(`📁 Subcollection: "${name}"`)
      console.log(`   Documents found (in sample): ${stats.count}`)
      console.log(`   Sample video IDs: ${stats.sampleDocIds.join(', ')}`)
      console.log(`   Sample data:`)
      console.log(JSON.stringify(stats.sampleData[0], null, 2))
      console.log('')
    }
  }

  // Now do a full count if subcollections were found
  if (Object.keys(subcollectionStats).length > 0) {
    console.log('\n=== FULL COUNT (all videos) ===\n')
    console.log('Counting all subcollection documents...')

    const fullStats: Record<string, number> = {}

    for (const videoDoc of videosSnapshot.docs) {
      const collections = await videoDoc.ref.listCollections()

      for (const collection of collections) {
        const collName = collection.id
        const subDocs = await collection.get()
        fullStats[collName] = (fullStats[collName] || 0) + subDocs.size
      }
    }

    for (const [name, count] of Object.entries(fullStats)) {
      console.log(`📁 ${name}: ${count} documents total`)
    }
  }
}

inspectSubcollections().catch(console.error)
