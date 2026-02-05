/**
 * Application version configuration.
 *
 * Reads from NEXT_PUBLIC_APP_VERSION environment variable.
 * Falls back to 'dev' for local development.
 *
 * Set in deployment via:
 * - Vercel: Environment Variables in project settings
 * - Docker: -e NEXT_PUBLIC_APP_VERSION=v2.0.1
 * - Cloud Run: --set-env-vars NEXT_PUBLIC_APP_VERSION=v2.0.1
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'
