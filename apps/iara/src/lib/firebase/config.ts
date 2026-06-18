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

/** GCP region (Cloud Run, Firestore, Artifact Registry) */
export const GCP_REGION = process.env.GCP_REGION || 'us-east1'

/**
 * Vertex AI endpoint location.
 *
 * Defaults to `'global'` so requests are routed across all regions with
 * available capacity, mitigating Dynamic Shared Quota saturation that
 * causes 429 RESOURCE_EXHAUSTED on regional endpoints (notably us-east1)
 * for Gemini 2.5 models even at low traffic.
 *
 * Override via `VERTEX_AI_LOCATION` env var if a regional endpoint is
 * needed (e.g., for data residency or debugging a specific region).
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429
 */
export const VERTEX_AI_LOCATION = process.env.VERTEX_AI_LOCATION || 'global'

/** Firestore database ID */
export const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'pptnc-stage'

/**
 * Ambiente de deploy. **Trava de segurança da publicação final no YouTube.**
 *
 * - `PRD` → produção: publicação real liberada.
 * - qualquer outro valor (default `DEV`) → ambiente de testes: a publicação
 *   final é **bloqueada** (botão desabilitado no Wizard + guard 403 na rota),
 *   evitando que dados de teste subam ao YouTube por engano.
 *
 * **Fail-safe:** se a var não estiver setada, assume DEV (bloqueia). Só é PRD
 * quando explicitamente `ENVIRONMENT=PRD` (setado no deploy de produção via
 * Cloud Run env — mesmo caminho do FIRESTORE_DATABASE_ID). Epic 27 (append).
 */
export const ENVIRONMENT: 'PRD' | 'DEV' = process.env.ENVIRONMENT === 'PRD' ? 'PRD' : 'DEV'

/** True somente em produção. Libera a publicação final no YouTube. */
export const IS_PRODUCTION = ENVIRONMENT === 'PRD'

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
    message: `[STARTUP] Tenant: ${PODCAST_ID} | Project: ${PROJECT_ID} | Region: ${GCP_REGION} | Vertex: ${VERTEX_AI_LOCATION} | DB: ${FIRESTORE_DATABASE_ID} | Env: ${ENVIRONMENT}`,
    timestamp: new Date().toISOString(),
    podcastId: PODCAST_ID,
  }))
}
