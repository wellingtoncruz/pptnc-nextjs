/**
 * GCP and tenant configuration.
 *
 * These values are hardcoded per tenant deployment.
 * For white-label, each podcast has its own deploy with different PODCAST_ID.
 *
 * To deploy a new tenant:
 * 1. Clone the codebase
 * 2. Update PODCAST_ID to the new podcast's ID
 * 3. Deploy to Cloud Run
 */

/** GCP project ID */
export const PROJECT_ID = 'pptnc-stage'

/** GCP region (Cloud Run, Vertex AI, Artifact Registry) */
export const GCP_REGION = 'us-east1'

/** Firestore database ID */
export const FIRESTORE_DATABASE_ID = 'pptnc-stage'

/**
 * Vertex AI model for LLM calls.
 * If not defined, defaults to 'gemini-2.5-flash' in the LLM client.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models
 */
export const VERTEX_AI_MODEL: string | undefined = undefined

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
