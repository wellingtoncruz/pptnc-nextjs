/**
 * Script to revert sync: delete only videos created TODAY with status 'new'
 *
 * Run with: npx tsx scripts/revert-sync.ts
 *
 * Uses Application Default Credentials (ADC):
 * - Run `gcloud auth application-default login` first
 */

import { initializeApp, applicationDefault, getApps, getApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage'
const PODCAST_ID = 'pptnc'

async function revertSync() {
  // Initialize Firebase Admin if not already initialized
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    })
  }

  const db = getFirestore(getApp(), FIRESTORE_DATABASE_ID)
  const videosRef = db.collection('podcasts').doc(PODCAST_ID).collection('videos')

  // Get start of today (UTC)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayTimestamp = Timestamp.fromDate(today)

  console.log(`🔍 Fetching videos from podcasts/${PODCAST_ID}/videos/...`)
  console.log(`📅 Looking for videos created after: ${today.toISOString()}`)
  console.log(`🏷️  With status: 'new'`)
  console.log('')

  // First, let's count total videos
  const totalSnapshot = await videosRef.count().get()
  console.log(`📊 Total videos in subcollection: ${totalSnapshot.data().count}`)

  // Fetch all videos and filter in memory (avoids composite index requirement)
  const allVideosSnapshot = await videosRef.get()

  const videosToDelete = allVideosSnapshot.docs.filter(doc => {
    const data = doc.data()
    const createdAt = data.createdAt?.toDate?.() || new Date(0)
    return data.status === 'new' && createdAt >= today
  })

  const toDelete = videosToDelete.length

  if (toDelete === 0) {
    console.log('✅ No new videos from today to delete')
    return
  }

  console.log(`⚠️  Found ${toDelete} videos to delete (created today with status 'new')`)
  console.log('')

  // Show sample of videos to delete
  console.log('📋 Sample of videos to delete:')
  videosToDelete.slice(0, 5).forEach(doc => {
    const data = doc.data()
    console.log(`   - ${doc.id}: "${data.youtubeData?.title?.substring(0, 50)}..."`)
  })
  if (toDelete > 5) {
    console.log(`   ... and ${toDelete - 5} more`)
  }
  console.log('')

  console.log('⏳ Press Ctrl+C within 10 seconds to cancel...')
  await new Promise(resolve => setTimeout(resolve, 10000))

  console.log('🗑️  Deleting in batches of 500...')

  // Delete in batches
  const BATCH_SIZE = 500
  let deleted = 0
  const docsToDelete = videosToDelete

  for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const batchDocs = docsToDelete.slice(i, i + BATCH_SIZE)

    batchDocs.forEach(doc => {
      batch.delete(doc.ref)
    })

    await batch.commit()
    deleted += batchDocs.length
    console.log(`  Deleted ${deleted}/${toDelete}`)
  }

  // Verify final count
  const finalSnapshot = await videosRef.count().get()
  console.log('')
  console.log(`✅ Successfully deleted ${deleted} videos`)
  console.log(`📊 Remaining videos in subcollection: ${finalSnapshot.data().count}`)
}

revertSync().catch(console.error)
