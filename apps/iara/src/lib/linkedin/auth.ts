/**
 * LinkedIn OAuth 2.0 authentication module.
 *
 * Implements the 3-legged OAuth flow for LinkedIn Community Management API:
 * 1. Generate authorization URL with required scopes
 * 2. Exchange authorization code for access + refresh tokens
 * 3. Refresh expired access tokens
 * 4. Fetch user's organization pages
 *
 * @see https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 */

import { log } from '@/lib/logger'

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest'
const LINKEDIN_API_VERSION = '202503'

/**
 * LinkedIn OAuth configuration from environment variables.
 */
function getLinkedInConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing LinkedIn OAuth environment variables: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI')
  }

  return { clientId, clientSecret, redirectUri }
}

/**
 * Generates the LinkedIn OAuth authorization URL.
 *
 * @param state - CSRF protection token
 * @returns Full authorization URL for redirect
 */
export function getLinkedInAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getLinkedInConfig()

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: process.env.LINKEDIN_SCOPES || 'openid profile w_member_social',
  })

  return `${LINKEDIN_AUTH_URL}?${params.toString()}`
}

/**
 * Token response from LinkedIn OAuth.
 */
export interface LinkedInTokenResponse {
  accessToken: string
  refreshToken?: string
  expiresIn: number
}

/**
 * Exchanges authorization code for access and refresh tokens.
 *
 * @param code - Authorization code from LinkedIn callback
 * @returns Token response with access token and optional refresh token
 */
export async function exchangeLinkedInCode(code: string): Promise<LinkedInTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getLinkedInConfig()

  const response = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    log('ERROR', 'LinkedIn token exchange failed', {
      status: response.status,
      error: errorBody,
    })
    throw new Error(`LinkedIn token exchange failed: ${errorBody?.error_description || response.statusText}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/**
 * Refreshes a LinkedIn access token using the refresh token.
 *
 * @param refreshToken - The refresh token to use
 * @returns New token response
 */
export async function refreshLinkedInToken(refreshToken: string): Promise<LinkedInTokenResponse> {
  const { clientId, clientSecret } = getLinkedInConfig()

  const response = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    log('ERROR', 'LinkedIn token refresh failed', {
      status: response.status,
      error: errorBody,
    })
    throw new Error(`LinkedIn token refresh failed: ${errorBody?.error_description || response.statusText}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/**
 * Organization page data from LinkedIn API.
 */
export interface LinkedInOrganization {
  id: string
  name: string
}

/**
 * Fetches the organizations (company pages) administered by the authenticated user.
 *
 * Requires `r_organization_social` or `rw_organization_admin` scope.
 *
 * @param accessToken - Valid LinkedIn access token
 * @returns Array of organizations
 */
export async function getLinkedInOrganizations(accessToken: string): Promise<LinkedInOrganization[]> {
  const response = await fetch(
    `${LINKEDIN_API_BASE}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(localizedName),organization))`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  )

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    log('ERROR', 'LinkedIn organizations fetch failed', {
      status: response.status,
      error: errorBody,
    })
    throw new Error(`Failed to fetch LinkedIn organizations: ${response.statusText}`)
  }

  const data = await response.json()

  const organizations: LinkedInOrganization[] = (data.elements || []).map(
    (element: { organization: string; 'organization~': { localizedName: string } }) => ({
      id: element.organization.replace('urn:li:organization:', ''),
      name: element['organization~']?.localizedName || 'Unknown',
    })
  )

  log('INFO', 'LinkedIn organizations fetched', {
    count: organizations.length,
    orgs: organizations.map((o) => o.name),
  })

  return organizations
}

/**
 * LinkedIn user profile data from OpenID Connect userinfo.
 */
export interface LinkedInProfile {
  sub: string
  name: string
}

/**
 * Fetches the authenticated user's profile.
 * Used when publishing to personal profile (w_member_social scope).
 *
 * @param accessToken - Valid LinkedIn access token
 * @returns User profile with sub (member ID) and name
 */
export async function getLinkedInProfile(accessToken: string): Promise<LinkedInProfile> {
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    log('ERROR', 'LinkedIn profile fetch failed', { status: response.status, error: errorBody })
    throw new Error(`Failed to fetch LinkedIn profile: ${response.statusText}`)
  }

  const data = await response.json()
  return { sub: data.sub, name: data.name }
}

/**
 * Returns true if the current LinkedIn scopes include organization publishing.
 */
export function isOrganizationScope(): boolean {
  const scopes = process.env.LINKEDIN_SCOPES || 'openid profile w_member_social'
  return scopes.includes('w_organization_social')
}
