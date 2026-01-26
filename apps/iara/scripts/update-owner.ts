/**
 * Script to update podcast owner ID.
 * Run with: pnpm tsx scripts/update-owner.ts
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage'
const PODCAST_ID = 'pptnc'
const NEW_OWNER_ID = 'b53daee5-13ab-495e-b822-506dddcb617c'

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

async function updateOwner() {
  const podcastRef = db.collection('podcasts').doc(PODCAST_ID)

  const doc = await podcastRef.get()
  if (!doc.exists) {
    console.error(`Podcast "${PODCAST_ID}" not found`)
    process.exit(1)
  }

  console.log('Current owner:', doc.data()?.ownerId)

  await podcastRef.update({
    ownerId: NEW_OWNER_ID,
    updatedAt: FieldValue.serverTimestamp(),
  })

  console.log(`Owner updated to: ${NEW_OWNER_ID}`)
}

updateOwner()
  .then(() => {
    console.log('Done.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Failed:', error)
    process.exit(1)
  })
