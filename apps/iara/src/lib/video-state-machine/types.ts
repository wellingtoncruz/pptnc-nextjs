/**
 * Video Status - Represents the lifecycle states of a video in the IAra system.
 *
 * State flow:
 * new -> processing -> draft -> ready -> sending -> sent
 *
 * Special transition:
 * sent -> draft (via 'reopen' when YouTube visibility changes from public to private/unlisted)
 *
 * @see architecture-iara.md#State Machine
 */
export type VideoStatus = 'new' | 'processing' | 'draft' | 'ready' | 'sending' | 'sent'

/**
 * Video Action - Actions that trigger state transitions.
 *
 * @see project-context-iara.md#State Machine - VideoStatus
 */
export type VideoAction =
  | 'classify'
  | 'process'
  | 'complete'
  | 'error'
  | 'edit'
  | 'finalize'
  | 'send'
  | 'success'
  | 'reopen' // Allows sent videos to return to draft when visibility changes

/**
 * InvalidTransitionError - Thrown when an invalid state transition is attempted.
 *
 * Contains context for debugging: currentStatus and action attempted.
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly currentStatus: VideoStatus,
    public readonly action: VideoAction
  ) {
    super(`Invalid transition: cannot apply action '${action}' to status '${currentStatus}'`)
    this.name = 'InvalidTransitionError'
  }
}
