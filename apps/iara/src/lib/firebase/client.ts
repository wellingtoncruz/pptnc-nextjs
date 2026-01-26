/**
 * Firebase Client SDK initialization for client-side operations.
 *
 * This module provides access to Firestore via the Client SDK for use in:
 * - Client Components
 * - Browser-side operations
 *
 * Note: Only NEXT_PUBLIC_ prefixed env vars are exposed to the client.
 * These are public Firebase config values, not secrets.
 *
 * @see https://firebase.google.com/docs/web/setup
 */

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'

import { FIRESTORE_DATABASE_ID } from './config'

/**
 * Validates that required Firebase Client SDK environment variables are defined.
 * Throws a descriptive error if any are missing, making debugging easier.
 */
function validateFirebaseConfig() {
  const required = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  ] as const

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(
      `Missing required Firebase environment variables: ${missing.join(', ')}. ` +
        'Check your .env.local file or deployment configuration.'
    )
  }
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let app: FirebaseApp | undefined
let db: Firestore | undefined

/**
 * Gets or initializes the Firebase app.
 * Uses singleton pattern to avoid multiple initializations.
 */
function getApp(): FirebaseApp {
  if (app) return app

  const apps = getApps()
  if (apps.length > 0) {
    app = apps[0]
    return app
  }

  // Validate env vars before initializing
  validateFirebaseConfig()

  app = initializeApp(firebaseConfig)
  return app
}

/**
 * Gets the Firestore client instance.
 * Initializes the Firebase app if not already initialized.
 *
 * @returns Firestore client instance
 */
export function getDb(): Firestore {
  if (db) return db
  const app = getApp()
  db = getFirestore(app, FIRESTORE_DATABASE_ID)
  return db
}
