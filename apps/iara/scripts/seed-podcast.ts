/**
 * Seed script to create initial podcast document in Firestore.
 *
 * Run with: pnpm tsx scripts/seed-podcast.ts
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to
 * a service account JSON file with Firestore write permissions.
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

const DEFAULT_VIDEO_TYPES = {
  episode: { minDuration: 1200, maxDuration: null },
  cut: { minDuration: 180, maxDuration: 1199 },
  reel: { minDuration: 0, maxDuration: 179 },
}

async function seedPodcast() {
  const podcastRef = db.collection('podcasts').doc(PODCAST_ID)

  // Check if already exists
  const existing = await podcastRef.get()
  if (existing.exists) {
    console.log(`Podcast "${PODCAST_ID}" already exists. Skipping seed.`)
    console.log('Existing data:', existing.data())
    return
  }

  const podcastData = {
    name: 'Papo de Podcaster',
    channelId: 'UC_REPLACE_WITH_REAL_CHANNEL_ID', // Replace with actual YouTube channel ID
    ownerId: 'seed-script', // Will be updated when real user logs in
    prompts: {
      episode: 'Você é um assistente especializado em criar metadados para episódios completos de podcast sobre tecnologia e negócios.',
      cut: 'Você é um assistente especializado em criar metadados para cortes de podcast - trechos de 3-20 minutos extraídos de episódios.',
      reel: 'Você é um assistente especializado em criar metadados para reels/shorts - vídeos verticais de até 3 minutos.',
    },
    videoTypes: DEFAULT_VIDEO_TYPES,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  await podcastRef.set(podcastData)
  console.log(`Podcast "${PODCAST_ID}" created successfully!`)
  console.log('Data:', podcastData)
}

seedPodcast()
  .then(() => {
    console.log('Seed complete.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
