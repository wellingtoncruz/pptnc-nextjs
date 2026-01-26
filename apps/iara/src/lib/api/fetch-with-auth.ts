'use client'

/**
 * Error thrown when the session has expired and user needs to re-authenticate.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired')
    this.name = 'SessionExpiredError'
  }
}

/**
 * Fetch wrapper that handles authentication errors by redirecting to login.
 *
 * Use this for all authenticated API calls in the frontend.
 * If a 401 response is received, the user is redirected to the login page
 * with the current URL preserved for post-login redirect.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @returns The fetch response (if successful)
 * @throws {SessionExpiredError} If the response is 401 (after redirect is initiated)
 *
 * @example
 * ```typescript
 * try {
 *   const response = await fetchWithAuth('/api/videos')
 *   const data = await response.json()
 * } catch (error) {
 *   if (error instanceof SessionExpiredError) {
 *     // User is being redirected to login
 *     return
 *   }
 *   // Handle other errors
 * }
 * ```
 */
export async function fetchWithAuth(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const response = await fetch(url, options)

  if (response.status === 401) {
    // Preserve current URL for post-login redirect
    const currentPath = window.location.pathname + window.location.search

    // Redirect to login with callback and expired flag
    window.location.href = `/login?callbackUrl=${encodeURIComponent(currentPath)}&expired=true`

    throw new SessionExpiredError()
  }

  return response
}

/**
 * JSON fetch wrapper with authentication handling.
 *
 * Convenience wrapper that fetches JSON data and handles 401 errors.
 * Automatically parses the response as JSON.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @returns The parsed JSON response
 * @throws {SessionExpiredError} If the response is 401
 * @throws {Error} If the response is not ok or JSON parsing fails
 *
 * @example
 * ```typescript
 * const videos = await fetchJsonWithAuth<Video[]>('/api/videos')
 * ```
 */
export async function fetchJsonWithAuth<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetchWithAuth(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message = errorBody?.error?.message || `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return response.json()
}
