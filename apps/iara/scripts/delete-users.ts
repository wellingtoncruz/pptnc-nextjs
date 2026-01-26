/**
 * Script to delete user documents from Firestore for testing.
 *
 * Run with: pnpm tsx scripts/delete-users.ts
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS environment variable.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Configuration - import from shared config
import { PROJECT_ID, FIRESTORE_DATABASE_ID, PODCAST_ID } from '../src/lib/firebase/config'

// Specific user IDs to delete (provided by user)
const USER_IDS_TO_DELETE = [
  'bbba949d-3bee-40db-a977-9ca3aea63aa9',
  'ce4a31e4-aede-4b7a-939c-02e017b68870',
]

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

console.log(`Project ID: ${PROJECT_ID}`)
console.log(`Database ID: ${FIRESTORE_DATABASE_ID}`)
console.log(`Podcast ID: ${PODCAST_ID}`)

const db = getFirestore(app, FIRESTORE_DATABASE_ID)

async function deleteUsers() {
  const usersRef = db.collection('podcasts').doc(PODCAST_ID).collection('users')

  console.log(`\nPath: podcasts/${PODCAST_ID}/users`)

  // Try to get the specific documents first
  console.log('\nTrying to access specific user documents...')
  for (const userId of USER_IDS_TO_DELETE) {
    const docRef = usersRef.doc(userId)
    const doc = await docRef.get()
    if (doc.exists) {
      console.log(`  Found: ${userId}`)
      console.log(`    Data: ${JSON.stringify(doc.data())}`)
    } else {
      console.log(`  NOT FOUND: ${userId}`)
    }
  }

  // List all users
  console.log('\nListing all users in collection...')
  const snapshot = await usersRef.get()

  if (snapshot.empty) {
    console.log('No user documents found in collection query.')
    console.log('\nTrying to delete specific documents anyway...')

    for (const userId of USER_IDS_TO_DELETE) {
      const docRef = usersRef.doc(userId)

      // Delete tokens subcollection first
      const tokensRef = docRef.collection('tokens')
      const tokensSnapshot = await tokensRef.get()
      for (const tokenDoc of tokensSnapshot.docs) {
        await tokenDoc.ref.delete()
        console.log(`  Deleted token: ${userId}/tokens/${tokenDoc.id}`)
      }

      // Delete the user document
      await docRef.delete()
      console.log(`  Deleted (or attempted): ${userId}`)
    }
    return
  }

  console.log(`Found ${snapshot.size} user document(s):`)
  snapshot.forEach((doc) => {
    const data = doc.data()
    console.log(`  - ${doc.id}: ${data.email} (${data.name || 'no name'}) - role: ${data.role}`)
  })

  console.log('\nDeleting all user documents...')

  // Delete each user document and their tokens subcollection
  for (const doc of snapshot.docs) {
    // Delete tokens subcollection first
    const tokensRef = doc.ref.collection('tokens')
    const tokensSnapshot = await tokensRef.get()
    for (const tokenDoc of tokensSnapshot.docs) {
      await tokenDoc.ref.delete()
      console.log(`  Deleted token: ${doc.id}/tokens/${tokenDoc.id}`)
    }

    // Delete the user document
    await doc.ref.delete()
    console.log(`  Deleted user: ${doc.id}`)
  }

  console.log('\nAll user documents deleted successfully.')
}

deleteUsers()
  .then(() => {
    console.log('\nDone.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nError:', error)
    process.exit(1)
  })
