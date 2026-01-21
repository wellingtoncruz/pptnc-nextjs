/**
 * Firestore client with dynamic import to prevent SSG build issues
 * Migrated from Datastore to Firestore Native mode for COUNT aggregation support
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
      projectId: process.env.GOOGLE_PROJECT_ID,
      databaseId: "pptnc", // Firestore Native database
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

// Firestore collection constants (collection names)
// Following architecture convention: plural snake_case

/** Collection for episode documents (stored as 'videos' in Firestore) */
export const COLLECTION_EPISODES = "videos";

/** Collection for topic documents */
export const COLLECTION_TOPICS = "topics";

/** Collection for empty search logs */
export const COLLECTION_EMPTY_SEARCHES = "empty_searches";

/** Collection for search logs */
export const COLLECTION_SEARCH_LOGS = "search_logs";

/** Collection for site metrics (midiakit) */
export const COLLECTION_METRICS = "metrics";

// Legacy aliases for backwards compatibility
export const KIND_EPISODES = COLLECTION_EPISODES;
export const KIND_TOPICS = COLLECTION_TOPICS;
export const KIND_EMPTY_SEARCHES = COLLECTION_EMPTY_SEARCHES;
export const KIND_SEARCH_LOGS = COLLECTION_SEARCH_LOGS;
