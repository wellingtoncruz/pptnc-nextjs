/**
 * Publish orchestrator — coordinates post + first comment flow.
 *
 * Handles the two-step publishing process:
 * 1. Publish the main post (text + optional image)
 * 2. If successful and firstComment exists, add the comment
 *
 * Manages partial failure: if post succeeds but comment fails,
 * returns 'partially_published' status with the post ID preserved.
 */

import { log } from '@/lib/logger'
import { getProviderTokensWithExpiry } from '@/lib/firebase/tokens'
import { refreshLinkedInToken } from '@/lib/linkedin/auth'
import { saveProviderTokens } from '@/lib/firebase/tokens'

import { LinkedInPublisher } from './linkedin-publisher'
import type { PublishWithCommentResult, SocialPublisher } from './publisher'

/**
 * Gets the appropriate publisher for a network, handling token refresh.
 *
 * @param userId - The user ID for token lookup
 * @param network - The social network name
 * @returns Publisher instance with valid token
 */
async function getPublisher(userId: string, network: string): Promise<SocialPublisher> {
  const tokens = await getProviderTokensWithExpiry(userId, network)

  if (!tokens) {
    throw new Error(`No ${network} tokens found for user ${userId}. Connect in Settings.`)
  }

  let accessToken = tokens.accessToken

  // Refresh if needed
  if (tokens.needsRefresh) {
    if (!tokens.refreshToken) {
      throw new Error(`${network} token expired and no refresh token available. Reconnect in Settings.`)
    }

    log('INFO', `Refreshing ${network} token before publish`, { userId })

    if (network === 'linkedin') {
      const refreshed = await refreshLinkedInToken(tokens.refreshToken)
      const expiresAt = Math.floor(Date.now() / 1000) + refreshed.expiresIn

      await saveProviderTokens(userId, network, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt,
      })

      accessToken = refreshed.accessToken
    } else {
      throw new Error(`Token refresh not implemented for network: ${network}`)
    }
  }

  switch (network) {
    case 'linkedin':
      return new LinkedInPublisher(accessToken)
    default:
      throw new Error(`Unsupported network: ${network}`)
  }
}

/**
 * Publishes content with optional first comment.
 *
 * Orchestrates the full flow:
 * 1. Get/refresh token for the network
 * 2. Publish the main post
 * 3. If firstComment provided and post succeeded, add comment
 *
 * @param userId - User ID for token lookup
 * @param network - Target social network
 * @param params - Content and configuration
 * @returns Result with status and IDs
 */
export async function publishWithComment(
  userId: string,
  network: string,
  params: {
    content: string
    imageUrl?: string
    firstComment?: string
    networkConfig: { targetId: string; targetType: 'page' | 'profile' }
  }
): Promise<PublishWithCommentResult> {
  try {
    const publisher = await getPublisher(userId, network)

    // Step 1: Publish main post
    const postResult = await publisher.publish({
      content: params.content,
      imageUrl: params.imageUrl,
      networkConfig: params.networkConfig,
    })

    if (!postResult.success) {
      return {
        status: 'failed',
        error: postResult.error,
      }
    }

    // Step 2: Add first comment if provided
    // NOTE: With w_member_social scope, the Social Actions API (comments) is not available.
    // When this fails with ACCESS_DENIED, treat as published (post succeeded).
    // When the Community Management app is approved, comments will work automatically.
    if (params.firstComment && postResult.postId) {
      const commentResult = await publisher.comment(postResult.postId, params.firstComment)

      if (!commentResult.success) {
        const isPermissionError = commentResult.error?.includes('permission') || commentResult.error?.includes('ACCESS_DENIED')

        if (isPermissionError) {
          log('WARN', 'Comment skipped — scope does not support Social Actions API', {
            postId: postResult.postId,
          })
          // Treat as published — the post itself succeeded
          return {
            status: 'published',
            postId: postResult.postId,
          }
        }

        log('WARN', 'Post published but comment failed', {
          postId: postResult.postId,
          error: commentResult.error,
        })
        return {
          status: 'partially_published',
          postId: postResult.postId,
          error: commentResult.error,
        }
      }

      return {
        status: 'published',
        postId: postResult.postId,
        commentId: commentResult.commentId,
      }
    }

    // No first comment — post only
    return {
      status: 'published',
      postId: postResult.postId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log('ERROR', 'Publish orchestration failed', {
      userId,
      network,
      error: message,
    })
    return {
      status: 'failed',
      error: message,
    }
  }
}
