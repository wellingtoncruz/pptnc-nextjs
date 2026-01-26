import type { VideoStatus, VideoAction } from './types'
import { InvalidTransitionError } from './types'

/**
 * State transition map - defines all valid transitions.
 *
 * State flow:
 *   new -> processing (via process) | new (via classify, self-loop)
 *   processing -> draft (via complete) | new (via error)
 *   draft -> processing (via process) | ready (via finalize) | draft (via edit)
 *   ready -> sending (via send) | draft (via edit)
 *   sending -> sent (via success) | ready (via error)
 *   sent -> (terminal - no valid transitions)
 */
const transitions: Record<VideoStatus, Partial<Record<VideoAction, VideoStatus>>> = {
  new: { process: 'processing', classify: 'new' },
  processing: { complete: 'draft', error: 'new' },
  draft: { process: 'processing', finalize: 'ready', edit: 'draft' },
  ready: { send: 'sending', edit: 'draft' },
  sending: { success: 'sent', error: 'ready' },
  sent: {}, // terminal state - no transitions allowed
}

/**
 * Executes a state transition for a video.
 *
 * This is a pure function with no side effects. It validates the transition
 * and returns the new status, or throws InvalidTransitionError if invalid.
 *
 * @param current - The current VideoStatus
 * @param action - The VideoAction to apply
 * @returns The new VideoStatus after the transition
 * @throws InvalidTransitionError if the transition is not allowed
 *
 * @example
 * ```typescript
 * const nextStatus = transition('new', 'process') // returns 'processing'
 * const invalid = transition('new', 'send') // throws InvalidTransitionError
 * ```
 */
export function transition(current: VideoStatus, action: VideoAction): VideoStatus {
  const next = transitions[current]?.[action]
  if (!next) {
    throw new InvalidTransitionError(current, action)
  }
  return next
}

/**
 * Checks if a transition is valid without throwing an exception.
 *
 * Use this for UI logic to determine which actions are available,
 * or when you need to validate before attempting a transition.
 *
 * @param current - The current VideoStatus
 * @param action - The VideoAction to check
 * @returns true if the transition is valid, false otherwise
 *
 * @example
 * ```typescript
 * if (canTransition('new', 'process')) {
 *   // Show "Start Processing" button
 * }
 * ```
 */
export function canTransition(current: VideoStatus, action: VideoAction): boolean {
  return transitions[current]?.[action] !== undefined
}

/**
 * Returns all valid actions for a given status.
 *
 * Use this to populate UI elements showing available actions,
 * or for validation logic that needs to know all options.
 *
 * @param current - The current VideoStatus
 * @returns Array of valid VideoAction values for this status
 *
 * @example
 * ```typescript
 * const actions = getValidActions('draft')
 * // returns ['process', 'finalize', 'edit']
 * ```
 */
export function getValidActions(current: VideoStatus): VideoAction[] {
  return Object.keys(transitions[current] || {}) as VideoAction[]
}
