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

const DEFAULT_PROMPT_FIELD = { description: '', expectedOutput: '' }

/** Default Thumbnail prompt sub-section (Epic 22, Story 22.1). */
const DEFAULT_THUMBNAIL_PROMPT_FIELD = { description: '', expectedOutput: '' }

const DEFAULT_PROMPTS = {
  episode: {
    critique: { ...DEFAULT_PROMPT_FIELD },
    editing: { ...DEFAULT_PROMPT_FIELD },
    compliance: { ...DEFAULT_PROMPT_FIELD },
    chapters: { ...DEFAULT_PROMPT_FIELD },
    titles: { ...DEFAULT_PROMPT_FIELD },
    description: { ...DEFAULT_PROMPT_FIELD },
    tags: { ...DEFAULT_PROMPT_FIELD },
    topics: { ...DEFAULT_PROMPT_FIELD },
    social: {},
    adwords: { ...DEFAULT_PROMPT_FIELD },
    thumbnail: { ...DEFAULT_THUMBNAIL_PROMPT_FIELD },
  },
  cut: {
    titles: { ...DEFAULT_PROMPT_FIELD },
    thumbs: { ...DEFAULT_PROMPT_FIELD },
    description: { ...DEFAULT_PROMPT_FIELD },
    tags: { ...DEFAULT_PROMPT_FIELD },
    topics: { ...DEFAULT_PROMPT_FIELD },
    social: {},
    thumbnail: { ...DEFAULT_THUMBNAIL_PROMPT_FIELD },
  },
  reel: {
    titles: { ...DEFAULT_PROMPT_FIELD },
    description: { ...DEFAULT_PROMPT_FIELD },
    tags: { ...DEFAULT_PROMPT_FIELD },
    topics: { ...DEFAULT_PROMPT_FIELD },
    social: {},
  },
  news: {
    news_social: { ...DEFAULT_PROMPT_FIELD },
  },
}

const DEFAULT_PERSONA = { role: '', objective: '', resume: '' }

const DEFAULT_PERSONAS = {
  critic: { ...DEFAULT_PERSONA },
  writer: { ...DEFAULT_PERSONA },
  socialmedia: { ...DEFAULT_PERSONA },
  adwords: { ...DEFAULT_PERSONA },
}

const DEFAULT_SOCIAL_NETWORKS = {
  instagram: { name: 'Instagram', icon: '📸' },
  linkedin: { name: 'LinkedIn', icon: '💼' },
}

async function seedSocialNetworks() {
  console.log('Seeding social networks...')
  const networksRef = db.collection('socialNetworks')

  for (const [networkId, data] of Object.entries(DEFAULT_SOCIAL_NETWORKS)) {
    const docRef = networksRef.doc(networkId)
    const existing = await docRef.get()

    if (existing.exists) {
      console.log(`  socialNetworks/${networkId} already exists, skipping`)
      continue
    }

    await docRef.set({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    })
    console.log(`  socialNetworks/${networkId} created`)
  }

  console.log('Social networks seeded.')
}

async function seedPodcast() {
  console.log(`Seeding podcast "${podcastId}" in project ${PROJECT_ID} (db: ${FIRESTORE_DATABASE_ID})`)

  // Seed global social networks BEFORE podcast check (global infrastructure)
  await seedSocialNetworks()

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
    ownerId: 'seed-script',
    prompts: DEFAULT_PROMPTS,
    personas: DEFAULT_PERSONAS,
    videoTypes: DEFAULT_VIDEO_TYPES,
    features: {
      editorial: true,
      news: true,
      includeLivestreams: false,
      socialMedia: false,
      adwords: false,
      llmDebugMode: false,
      socialPublish: false,
    },
    enabledSocialNetworks: [],
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
