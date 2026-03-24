/**
 * Social media publisher interface and types.
 *
 * Defines the contract for social network adapters (LinkedIn, Twitter, Meta).
 * Each adapter implements publish() and comment() for its specific API.
 */

/**
 * Parameters for publishing a post.
 */
export interface PublishParams {
  content: string
  imageUrl?: string
  /** Network-specific configuration (target ID, type) */
  networkConfig: {
    targetId: string
    targetType: 'page' | 'profile'
  }
}

/**
 * Result of a publish operation.
 */
export interface PublishResult {
  success: boolean
  postId?: string
  error?: string
}

/**
 * Result of a comment operation.
 */
export interface CommentResult {
  success: boolean
  commentId?: string
  error?: string
}

/**
 * Social media publisher interface.
 * Each network adapter implements this contract.
 */
export interface SocialPublisher {
  /** Publish a post to the social network */
  publish(params: PublishParams): Promise<PublishResult>
  /** Add a comment to an existing post */
  comment(postId: string, text: string): Promise<CommentResult>
}

/**
 * Combined result of the full publish + comment flow.
 */
export type PublishWithCommentStatus =
  | 'published'
  | 'partially_published'
  | 'failed'

export interface PublishWithCommentResult {
  status: PublishWithCommentStatus
  postId?: string
  commentId?: string
  error?: string
}
