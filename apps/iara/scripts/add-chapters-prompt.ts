/**
 * Migration script to add 'chapters' prompt field to existing podcast documents.
 *
 * Run with: pnpm tsx scripts/add-chapters-prompt.ts
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to
 * a service account JSON file with Firestore write permissions.
 *
 * This script:
 * 1. Finds all podcasts that don't have prompts.episode.chapters
 * 2. Adds the chapters field with default empty values
 * 3. Reports results
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// Configuration
const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage'

// Initialize Firebase Admin if not already initialized
let app
if (getApps().length === 0) {
  app = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  })
} else {
  app = getApps()[0]
}

const db = getFirestore(app, FIRESTORE_DATABASE_ID)

/**
 * Default PromptField structure
 */
const DEFAULT_PROMPT_FIELD = {
  description: '',
  expectedOutput: '',
}

async function addChaptersPrompt() {
  const podcastsRef = db.collection('podcasts')
  const snapshot = await podcastsRef.get()

  if (snapshot.empty) {
    console.log('No podcasts found.')
    return
  }

  console.log(`Found ${snapshot.size} podcast(s). Checking for chapters field...`)

  let updated = 0
  let skipped = 0

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const podcastId = doc.id

    // Check if chapters already exists
    if (data?.prompts?.episode?.chapters) {
      console.log(`[SKIP] ${podcastId}: chapters field already exists`)
      skipped++
      continue
    }

    // Check if prompts.episode exists
    if (!data?.prompts?.episode) {
      console.log(`[WARN] ${podcastId}: prompts.episode not found, skipping`)
      skipped++
      continue
    }

    // Add chapters field
    console.log(`[UPDATE] ${podcastId}: Adding chapters field...`)

    await doc.ref.update({
      'prompts.episode.chapters': DEFAULT_PROMPT_FIELD,
      updatedAt: FieldValue.serverTimestamp(),
    })

    updated++
    console.log(`[OK] ${podcastId}: chapters field added`)
  }

  console.log('\n--- Summary ---')
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Total: ${snapshot.size}`)
}

addChaptersPrompt()
  .then(() => {
    console.log('\nMigration complete.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nMigration failed:', error)
    process.exit(1)
  })
