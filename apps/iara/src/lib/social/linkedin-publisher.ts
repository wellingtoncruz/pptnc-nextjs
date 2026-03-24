/**
 * LinkedIn publisher adapter.
 *
 * Implements the SocialPublisher interface for LinkedIn Community Management API.
 * Supports publishing text posts, posts with images, and adding first comments.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */

import { log } from '@/lib/logger'

import type { CommentResult, PublishParams, PublishResult, SocialPublisher } from './publisher'

const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest'
const LINKEDIN_API_VERSION = '202503'

/**
 * Common headers for LinkedIn REST API calls.
 */
function getHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

/**
 * LinkedIn publisher adapter.
 *
 * Publishes posts and comments to a LinkedIn Company Page via the
 * Community Management API.
 */
export class LinkedInPublisher implements SocialPublisher {
  private authorUrn = ''

  constructor(private readonly accessToken: string) {}

  /**
   * Publishes a post to LinkedIn (Company Page or personal profile).
   *
   * If imageUrl is provided, uploads the image first via the Images API,
   * then references it in the post.
   */
  async publish(params: PublishParams): Promise<PublishResult> {
    const { content, imageUrl, networkConfig } = params
    this.authorUrn = networkConfig.targetType === 'page'
      ? `urn:li:organization:${networkConfig.targetId}`
      : `urn:li:person:${networkConfig.targetId}`

    try {
      let imageUrn: string | undefined

      // Upload image if provided
      // NOTE: Image upload requires w_organization_social scope (Community Management API).
      // With w_member_social (personal profile), the Images API returns "Upgrade Required".
      // When the Community Management app is approved, remove this try/catch fallback.
      // @see spike-linkedin-mentions.md
      if (imageUrl) {
        try {
          imageUrn = await this.uploadImage(this.authorUrn, imageUrl)
        } catch (err) {
          log('WARN', 'LinkedIn image upload failed — publishing without image', {
            error: err instanceof Error ? err.message : String(err),
          })
          // Continue without image — text-only post
        }
      }

      // Build post body
      const body: Record<string, unknown> = {
        author: this.authorUrn,
        lifecycleState: 'PUBLISHED',
        visibility: 'PUBLIC',
        commentary: content,
        distribution: {
          feedDistribution: 'MAIN_FEED',
        },
      }

      // Attach image if uploaded
      if (imageUrn) {
        body.content = {
          media: {
            id: imageUrn,
          },
        }
      }

      const response = await fetch(`${LINKEDIN_API_BASE}/posts`, {
        method: 'POST',
        headers: getHeaders(this.accessToken),
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const errorMessage = this.formatError(response.status, errorBody)
        log('ERROR', 'LinkedIn post failed', {
          status: response.status,
          error: errorBody,
        })
        return { success: false, error: errorMessage }
      }

      // Post ID is in the x-restli-id header
      const postUrn = response.headers.get('x-restli-id') || ''

      log('INFO', 'LinkedIn post published', { postUrn })
      return { success: true, postId: postUrn }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log('ERROR', 'LinkedIn publish error', { error: message })
      return { success: false, error: message }
    }
  }

  /**
   * Adds a comment to an existing LinkedIn post.
   */
  async comment(postId: string, text: string): Promise<CommentResult> {
    try {
      // The comments endpoint uses the share URN, URL-encoded in the path
      const encodedUrn = encodeURIComponent(postId)

      const body = {
        actor: this.authorUrn,
        object: postId,
        message: { text },
      }

      const response = await fetch(
        `${LINKEDIN_API_BASE}/socialActions/${encodedUrn}/comments`,
        {
          method: 'POST',
          headers: getHeaders(this.accessToken),
          body: JSON.stringify(body),
        }
      )

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const errorMessage = this.formatError(response.status, errorBody)
        log('ERROR', 'LinkedIn comment failed', {
          postId,
          status: response.status,
          error: errorBody,
        })
        return { success: false, error: errorMessage }
      }

      const data = await response.json()
      const commentId = data.id || response.headers.get('x-restli-id') || ''

      log('INFO', 'LinkedIn comment posted', { postId, commentId })
      return { success: true, commentId }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log('ERROR', 'LinkedIn comment error', { postId, error: message })
      return { success: false, error: message }
    }
  }

  /**
   * Uploads an image to LinkedIn via the Images API.
   *
   * Two-step process:
   * 1. Initialize upload → get upload URL
   * 2. Upload binary to the provided URL
   *
   * @returns The image URN for referencing in posts
   */
  private async uploadImage(authorUrn: string, imageUrl: string): Promise<string> {
    // Step 1: Initialize upload
    const initResponse = await fetch(`${LINKEDIN_API_BASE}/images?action=initializeUpload`, {
      method: 'POST',
      headers: getHeaders(this.accessToken),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
        },
      }),
    })

    if (!initResponse.ok) {
      throw new Error(`LinkedIn image upload init failed: ${initResponse.statusText}`)
    }

    const initData = await initResponse.json()
    const uploadUrl = initData.value.uploadUrl
    const imageId = initData.value.image

    // Step 2: Download image and upload to LinkedIn
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image from ${imageUrl}`)
    }

    const imageBuffer = await imageResponse.arrayBuffer()

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: imageBuffer,
    })

    if (!uploadResponse.ok) {
      throw new Error(`LinkedIn image upload failed: ${uploadResponse.statusText}`)
    }

    log('INFO', 'LinkedIn image uploaded', { imageId })
    return imageId
  }

  /**
   * Formats LinkedIn API errors into user-friendly messages.
   */
  private formatError(status: number, body: Record<string, unknown>): string {
    if (status === 429) return 'LinkedIn rate limit exceeded. Try again in a few minutes.'
    if (status === 401) return 'LinkedIn token expired or revoked. Reconnect in Settings.'
    if (status === 403) return 'LinkedIn permission denied. Check app permissions.'
    const message = (body as { message?: string })?.message || `LinkedIn API error (${status})`
    return message
  }
}
