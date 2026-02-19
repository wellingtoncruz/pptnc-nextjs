/**
 * Seed script to create initial podcast document in Firestore.
 *
 * Usage:
 *   pnpm tsx scripts/seed-podcast.ts <podcastId> <podcastName> <channelId>
 *
 * Example:
 *   pnpm tsx scripts/seed-podcast.ts pptnc "Papo de Podcaster" UC_CHANNEL_ID
 *
 * Environment variables (optional):
 *   GCP_PROJECT_ID        GCP project (default: pptnc-stage)
 *   FIRESTORE_DATABASE_ID Firestore database (default: pptnc-stage)
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to
 * a service account JSON file with Firestore write permissions,
 * or `gcloud auth application-default login`.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// Parse CLI arguments
const [podcastId, podcastName, channelId] = process.argv.slice(2)

if (!podcastId || !podcastName || !channelId) {
  console.error(`Usage: tsx scripts/seed-podcast.ts <podcastId> <podcastName> <channelId>

Example:
  tsx scripts/seed-podcast.ts pptnc "Papo de Podcaster" UC_CHANNEL_ID

Environment variables (optional):
  GCP_PROJECT_ID        GCP project (default: pptnc-stage)
  FIRESTORE_DATABASE_ID Firestore database (default: pptnc-stage)`)
  process.exit(1)
}

// Configuration from env vars with fallback
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'pptnc-stage'
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'pptnc-stage'

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
  console.log(`Seeding podcast "${podcastId}" in project ${PROJECT_ID} (db: ${FIRESTORE_DATABASE_ID})`)

  const podcastRef = db.collection('podcasts').doc(podcastId)

  // Check if already exists
  const existing = await podcastRef.get()
  if (existing.exists) {
    console.log(`Podcast "${podcastId}" already exists. Skipping seed.`)
    console.log('Existing data:', existing.data())
    return
  }

  const podcastData = {
    name: podcastName,
    channelId,
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
  console.log(`Podcast "${podcastId}" created successfully!`)
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
