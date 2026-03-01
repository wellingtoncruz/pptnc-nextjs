/**
 * GCP and tenant configuration.
 *
 * All values are read from environment variables at runtime with fallback
 * to hardcoded defaults. This allows the same Docker image to serve any
 * podcast without rebuild — just set env vars in the Cloud Run service.
 *
 * To deploy a new tenant:
 * 1. Set PODCAST_ID, GCP_PROJECT_ID, FIRESTORE_DATABASE_ID env vars
 * 2. Deploy the same image to a new Cloud Run service
 */

/** GCP project ID */
export const PROJECT_ID = process.env.GCP_PROJECT_ID || 'pptnc-stage'

/** GCP region (Cloud Run, Vertex AI, Artifact Registry) */
export const GCP_REGION = process.env.GCP_REGION || 'us-east1'

/** Firestore database ID */
export const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'pptnc-stage'

/**
 * Gemini model for LLM calls.
 * If not defined, defaults to 'gemini-2.5-flash' in the LLM client.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models
 */
export const VERTEX_AI_MODEL: string | undefined = process.env.VERTEX_AI_MODEL || undefined

/**
 * Podcast ID for this tenant deployment.
 *
 * This is the root of all Firestore paths for this tenant:
 * - podcasts/{PODCAST_ID}/users/{userId}/tokens/oauth
 * - podcasts/{PODCAST_ID}/videos/{videoId}
 */
export const PODCAST_ID = process.env.PODCAST_ID || 'pptnc'

/** Cloud Storage bucket for newsletter images (empty = use project default bucket) */
export const NEWSLETTER_IMAGES_BUCKET = process.env.NEWSLETTER_IMAGES_BUCKET || ''

// =============================================================================
// STARTUP VALIDATION — fail-fast if required config is empty
// =============================================================================

if (!PODCAST_ID) {
  throw new Error('[CONFIG] PODCAST_ID is required but empty. Set PODCAST_ID env var.')
}
if (!PROJECT_ID) {
  throw new Error('[CONFIG] PROJECT_ID is required but empty. Set GCP_PROJECT_ID env var.')
}
if (!FIRESTORE_DATABASE_ID) {
  throw new Error('[CONFIG] FIRESTORE_DATABASE_ID is required but empty. Set FIRESTORE_DATABASE_ID env var.')
}

// Startup log (server-side only — skip in browser and test environments)
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  console.log(JSON.stringify({
    severity: 'INFO',
    message: `[STARTUP] Tenant: ${PODCAST_ID} | Project: ${PROJECT_ID} | Region: ${GCP_REGION} | DB: ${FIRESTORE_DATABASE_ID}`,
    timestamp: new Date().toISOString(),
    podcastId: PODCAST_ID,
  }))
}
