/**
 * Firebase and tenant configuration.
 *
 * These values are hardcoded per tenant deployment.
 * For white-label, each podcast has its own deploy with different PODCAST_ID.
 *
 * To deploy a new tenant:
 * 1. Clone the codebase
 * 2. Update PODCAST_ID to the new podcast's ID
 * 3. Deploy to Cloud Run
 */

/** Firebase project ID */
export const PROJECT_ID = 'pptnc-stage'

/** Firestore database ID */
export const FIRESTORE_DATABASE_ID = 'pptnc-stage'

/**
 * Podcast ID for this tenant deployment.
 *
 * This is the root of all Firestore paths for this tenant:
 * - podcasts/{PODCAST_ID}/users/{userId}/tokens/oauth
 * - podcasts/{PODCAST_ID}/videos/{videoId}
 *
 * CRITICAL: Change this value when deploying a new tenant.
 */
export const PODCAST_ID = 'pptnc'
