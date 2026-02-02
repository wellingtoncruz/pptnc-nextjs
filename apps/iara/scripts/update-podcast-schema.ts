/**
 * Migration script to update podcast document to new schema with
 * expanded prompts and personas structure.
 *
 * Run with: pnpm tsx scripts/update-podcast-schema.ts
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to
 * a service account JSON file with Firestore write permissions.
 *
 * This script:
 * 1. Backs up the existing document
 * 2. Updates prompts to new structure (PromptField objects)
 * 3. Adds personas field
 * 4. Preserves all other fields and subcollections
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// Configuration
const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage'
const PODCAST_ID = 'pptnc'

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

/**
 * Default Persona structure
 */
const DEFAULT_PERSONA = {
  role: '',
  objective: '',
  resume: '',
}

/**
 * New prompts structure
 */
const DEFAULT_PROMPTS = {
  episode: {
    critique: { ...DEFAULT_PROMPT_FIELD },
    editing: { ...DEFAULT_PROMPT_FIELD },
    compliance: { ...DEFAULT_PROMPT_FIELD },
    chapters: { ...DEFAULT_PROMPT_FIELD },
    titles: { ...DEFAULT_PROMPT_FIELD },
    description: { ...DEFAULT_PROMPT_FIELD },
    tags: { ...DEFAULT_PROMPT_FIELD },
  },
  cut: {
    titles: { ...DEFAULT_PROMPT_FIELD },
    thumbs: { ...DEFAULT_PROMPT_FIELD },
    description: { ...DEFAULT_PROMPT_FIELD },
    tags: { ...DEFAULT_PROMPT_FIELD },
  },
  reel: {
    titles: { ...DEFAULT_PROMPT_FIELD },
    description: { ...DEFAULT_PROMPT_FIELD },
    tags: { ...DEFAULT_PROMPT_FIELD },
  },
}

/**
 * New personas structure
 */
const DEFAULT_PERSONAS = {
  critic: { ...DEFAULT_PERSONA },
  writer: { ...DEFAULT_PERSONA },
}

async function updatePodcastSchema() {
  const podcastRef = db.collection('podcasts').doc(PODCAST_ID)

  // Get current document
  const existing = await podcastRef.get()
  if (!existing.exists) {
    console.error(`Podcast "${PODCAST_ID}" does not exist. Cannot update.`)
    process.exit(1)
  }

  const currentData = existing.data()
  console.log('Current document data:')
  console.log(JSON.stringify(currentData, null, 2))

  // Prepare update data - determine what changes are needed FIRST
  const updateData: Record<string, unknown> = {}

  // Check if prompts migration is needed
  const needsPromptsMigration =
    (currentData?.prompts && typeof currentData.prompts.episode === 'string') ||
    !currentData?.prompts

  // Check if personas are needed
  const needsPersonas = !currentData?.personas

  // Check if already fully migrated
  if (!needsPromptsMigration && !needsPersonas) {
    console.log('\nDocument already has new schema with prompts and personas.')
    console.log('Migration not needed.')
    return
  }

  // Migrate prompts if needed
  if (currentData?.prompts && typeof currentData.prompts.episode === 'string') {
    console.log('\nMigrating prompts from string format to PromptField structure...')
    updateData.prompts = DEFAULT_PROMPTS
    console.log('Using default prompts structure (old string values not preserved in new format)')
  } else if (!currentData?.prompts) {
    console.log('\nNo prompts found. Adding default prompts...')
    updateData.prompts = DEFAULT_PROMPTS
  }

  // Add personas if missing
  if (needsPersonas) {
    console.log('Adding personas field...')
    updateData.personas = DEFAULT_PERSONAS
  }

  // Only create backup if we have actual changes to make
  if (Object.keys(updateData).length > 0) {
    // Backup current document (write to backup collection)
    const backupRef = db.collection('_backups').doc(`podcast-${PODCAST_ID}-${Date.now()}`)
    await backupRef.set({
      ...currentData,
      _backupTimestamp: FieldValue.serverTimestamp(),
      _originalPath: `podcasts/${PODCAST_ID}`,
    })
    console.log(`\nBackup created at: _backups/${backupRef.id}`)

    // Add updatedAt timestamp
    updateData.updatedAt = FieldValue.serverTimestamp()

    // Apply update
    await podcastRef.update(updateData)
    console.log('\nDocument updated successfully!')
    console.log('Updated fields:', Object.keys(updateData))

    // Verify
    const updated = await podcastRef.get()
    console.log('\nUpdated document data:')
    console.log(JSON.stringify(updated.data(), null, 2))
  } else {
    console.log('\nNo updates needed.')
  }
}

updatePodcastSchema()
  .then(() => {
    console.log('\nMigration complete.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nMigration failed:', error)
    process.exit(1)
  })
