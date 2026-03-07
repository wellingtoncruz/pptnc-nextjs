/**
 * Firestore client with dynamic import to prevent SSG build issues
 * Migrated from Datastore to Firestore Native mode for COUNT aggregation support
 *
 * Note: packages/datastore exports the same client for use by other apps (admin).
 * This file is kept in the web app for test mock compatibility.
 */

import type { Firestore } from "@google-cloud/firestore";

/**
 * Singleton Firestore client instance
 * Reuses connection across requests for better performance
 */
let firestoreClient: Firestore | null = null;

/**
 * Returns a singleton Firestore client instance
 * Uses dynamic import to prevent module loading during SSG
 *
 * @returns Configured Firestore client for database 'pptnc'
 * @throws Error if Firestore cannot be initialized
 */
export async function getFirestoreClient(): Promise<Firestore> {
  if (!firestoreClient) {
    // Dynamic import to prevent loading during SSG
    const { Firestore } = await import("@google-cloud/firestore");
    firestoreClient = new Firestore({
      projectId: process.env.GOOGLE_PROJECT_ID || "pptnc-stage",
      databaseId: "pptnc-stage", // Shared database with IAra backoffice
      // ADC handles credentials automatically via:
      // - GOOGLE_APPLICATION_CREDENTIALS env var
      // - gcloud auth application-default login
      // - GCE/Cloud Run metadata service
    });
  }
  return firestoreClient;
}

/**
 * Resets the Firestore client singleton
 * Useful for testing to ensure clean state between tests
 */
export function resetFirestoreClient(): void {
  firestoreClient = null;
}

// Legacy alias for backwards compatibility during migration
export const getDatastoreClient = getFirestoreClient;
export const resetDatastoreClient = resetFirestoreClient;

// Firestore collection constants
// All collections scoped under the podcast tenant root

/** Podcast tenant ID */
export const PODCAST_ID = "pptnc";

/** Root path for all podcast-scoped collections */
export const PODCAST_ROOT = `podcasts/${PODCAST_ID}`;

/** Collection for episode/video documents */
export const COLLECTION_EPISODES = `${PODCAST_ROOT}/videos`;

/** Collection for topic documents */
export const COLLECTION_TOPICS = `${PODCAST_ROOT}/topics`;

/** Collection for site metrics (midiakit) */
export const COLLECTION_METRICS = `${PODCAST_ROOT}/metrics`;

/** Collection for empty search logs */
export const COLLECTION_EMPTY_SEARCHES = `${PODCAST_ROOT}/empty_searches`;

/** Collection for search logs */
export const COLLECTION_SEARCH_LOGS = `${PODCAST_ROOT}/search_logs`;
