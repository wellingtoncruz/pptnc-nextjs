/**
 * Firebase Admin SDK initialization for server-side operations.
 *
 * This module provides access to Firestore via the Admin SDK for use in:
 * - Route Handlers
 * - Server Components
 * - Server Actions
 *
 * Authentication uses Application Default Credentials (ADC):
 * - Local development: Run `gcloud auth application-default login`
 * - Cloud Run: Automatically uses the service account assigned to the service
 *
 * CRITICAL: Never expose admin SDK to the client.
 * Use getAdminDb() only in server-side code.
 *
 * @see https://firebase.google.com/docs/admin/setup
 * @see https://cloud.google.com/docs/authentication/application-default-credentials
 */

import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

import { log } from '../logger'

import { FIRESTORE_DATABASE_ID, PROJECT_ID } from './config'

let adminApp: App | undefined
let adminDb: Firestore | undefined

/**
 * Gets or initializes the Firebase Admin app.
 * Uses Application Default Credentials (ADC) for authentication.
 *
 * Exported for use cases requiring direct app access (Auth, Storage, etc.)
 */
export function getAdminApp(): App {
  if (adminApp) return adminApp

  const apps = getApps()
  if (apps.length > 0) {
    adminApp = apps[0]
    return adminApp
  }

  adminApp = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  })

  log('INFO', 'Firebase Admin SDK initialized', { projectId: PROJECT_ID })
  return adminApp
}

/**
 * Gets the Firestore admin instance.
 * Initializes the admin app if not already initialized.
 *
 * @returns Firestore admin instance
 */
export function getAdminDb(): Firestore {
  if (adminDb) return adminDb
  const app = getAdminApp()
  adminDb = getFirestore(app, FIRESTORE_DATABASE_ID)
  return adminDb
}
