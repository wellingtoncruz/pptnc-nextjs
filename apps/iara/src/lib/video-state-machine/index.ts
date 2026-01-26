/**
 * Video State Machine Module
 *
 * Manages video status transitions in the IAra system.
 * Provides a pure, validated state machine for video lifecycle management.
 *
 * @example
 * ```typescript
 * import { transition, canTransition, getValidActions, VideoStatus } from '@/lib/video-state-machine'
 *
 * // Execute transition (throws if invalid)
 * const newStatus = transition('new', 'process') // 'processing'
 *
 * // Check if transition is valid (no exception)
 * if (canTransition('draft', 'send')) { ... }
 *
 * // Get all valid actions for a status
 * const actions = getValidActions('draft') // ['process', 'finalize', 'edit']
 * ```
 *
 * @module video-state-machine
 */

export { transition, canTransition, getValidActions } from './transitions'
export { InvalidTransitionError } from './types'
export type { VideoStatus, VideoAction } from './types'
