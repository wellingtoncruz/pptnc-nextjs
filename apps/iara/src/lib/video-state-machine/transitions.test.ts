import { describe, it, expect, test } from 'vitest'

import { transition, canTransition, getValidActions, InvalidTransitionError } from './index'
import type { VideoStatus, VideoAction } from './index'

describe('video state machine', () => {
  describe('valid transitions', () => {
    test.each<[VideoStatus, VideoAction, VideoStatus]>([
      // new state transitions
      ['new', 'process', 'processing'],
      ['new', 'classify', 'new'], // self-loop for classification

      // processing state transitions
      ['processing', 'complete', 'draft'],
      ['processing', 'error', 'new'],

      // draft state transitions
      ['draft', 'process', 'processing'],
      ['draft', 'finalize', 'ready'],
      ['draft', 'edit', 'draft'],

      // ready state transitions
      ['ready', 'send', 'sending'],
      ['ready', 'edit', 'draft'],

      // sending state transitions
      ['sending', 'success', 'sent'],
      ['sending', 'error', 'ready'],

      // sent state transitions (reopen when visibility changes)
      ['sent', 'reopen', 'draft'],
    ])('transition(%s, %s) returns %s', (from, action, expected) => {
      expect(transition(from, action)).toBe(expected)
    })
  })

  describe('invalid transitions from new', () => {
    test.each<[VideoAction]>([
      ['complete'],
      ['error'],
      ['edit'],
      ['finalize'],
      ['send'],
      ['success'],
      ['reopen'],
    ])('transition(new, %s) throws InvalidTransitionError', (action) => {
      expect(() => transition('new', action)).toThrow(InvalidTransitionError)
    })
  })

  describe('invalid transitions from processing', () => {
    test.each<[VideoAction]>([
      ['classify'],
      ['process'],
      ['edit'],
      ['finalize'],
      ['send'],
      ['success'],
      ['reopen'],
    ])('transition(processing, %s) throws InvalidTransitionError', (action) => {
      expect(() => transition('processing', action)).toThrow(InvalidTransitionError)
    })
  })

  describe('invalid transitions from draft', () => {
    test.each<[VideoAction]>([
      ['classify'],
      ['complete'],
      ['error'],
      ['send'],
      ['success'],
      ['reopen'],
    ])('transition(draft, %s) throws InvalidTransitionError', (action) => {
      expect(() => transition('draft', action)).toThrow(InvalidTransitionError)
    })
  })

  describe('invalid transitions from ready', () => {
    test.each<[VideoAction]>([
      ['classify'],
      ['process'],
      ['complete'],
      ['error'],
      ['finalize'],
      ['success'],
      ['reopen'],
    ])('transition(ready, %s) throws InvalidTransitionError', (action) => {
      expect(() => transition('ready', action)).toThrow(InvalidTransitionError)
    })
  })

  describe('invalid transitions from sending', () => {
    test.each<[VideoAction]>([
      ['classify'],
      ['process'],
      ['complete'],
      ['edit'],
      ['finalize'],
      ['send'],
      ['reopen'],
    ])('transition(sending, %s) throws InvalidTransitionError', (action) => {
      expect(() => transition('sending', action)).toThrow(InvalidTransitionError)
    })
  })

  describe('sent state transitions', () => {
    it('allows reopen to return to draft', () => {
      expect(transition('sent', 'reopen')).toBe('draft')
    })

    test.each<[VideoAction]>([
      ['classify'],
      ['process'],
      ['complete'],
      ['error'],
      ['edit'],
      ['finalize'],
      ['send'],
      ['success'],
    ])('transition(sent, %s) throws InvalidTransitionError', (action) => {
      expect(() => transition('sent', action)).toThrow(InvalidTransitionError)
    })
  })

  describe('InvalidTransitionError properties', () => {
    it('contains currentStatus and action', () => {
      try {
        transition('new', 'send')
        expect.fail('Should have thrown InvalidTransitionError')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError)
        if (error instanceof InvalidTransitionError) {
          expect(error.currentStatus).toBe('new')
          expect(error.action).toBe('send')
          expect(error.message).toContain('new')
          expect(error.message).toContain('send')
          expect(error.name).toBe('InvalidTransitionError')
        }
      }
    })

    it('has descriptive error message', () => {
      try {
        transition('sent', 'process')
        expect.fail('Should have thrown InvalidTransitionError')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        if (error instanceof InvalidTransitionError) {
          expect(error.message).toBe(
            "Invalid transition: cannot apply action 'process' to status 'sent'"
          )
        }
      }
    })
  })

  describe('pure function property', () => {
    it('returns same result for same inputs', () => {
      const result1 = transition('new', 'process')
      const result2 = transition('new', 'process')
      expect(result1).toBe(result2)
      expect(result1).toBe('processing')
    })

    it('returns consistent results across multiple calls', () => {
      const results: VideoStatus[] = []
      for (let i = 0; i < 100; i++) {
        results.push(transition('draft', 'finalize'))
      }
      expect(results.every((r) => r === 'ready')).toBe(true)
    })
  })

  describe('complete workflow simulation', () => {
    it('completes full happy path: new -> sent', () => {
      let status: VideoStatus = 'new'
      status = transition(status, 'process')
      expect(status).toBe('processing')

      status = transition(status, 'complete')
      expect(status).toBe('draft')

      status = transition(status, 'finalize')
      expect(status).toBe('ready')

      status = transition(status, 'send')
      expect(status).toBe('sending')

      status = transition(status, 'success')
      expect(status).toBe('sent')
    })

    it('handles reprocessing flow: draft -> processing -> draft', () => {
      let status: VideoStatus = 'draft'
      status = transition(status, 'process')
      expect(status).toBe('processing')

      status = transition(status, 'complete')
      expect(status).toBe('draft')
    })

    it('handles error recovery flow: processing error -> new', () => {
      let status: VideoStatus = 'new'
      status = transition(status, 'process')
      expect(status).toBe('processing')

      status = transition(status, 'error')
      expect(status).toBe('new')

      // Can retry
      status = transition(status, 'process')
      expect(status).toBe('processing')
    })

    it('handles publish error recovery: sending error -> ready', () => {
      let status: VideoStatus = 'ready'
      status = transition(status, 'send')
      expect(status).toBe('sending')

      status = transition(status, 'error')
      expect(status).toBe('ready')

      // Can retry
      status = transition(status, 'send')
      expect(status).toBe('sending')
    })

    it('handles edit from ready: ready -> draft', () => {
      let status: VideoStatus = 'ready'
      status = transition(status, 'edit')
      expect(status).toBe('draft')

      // Must finalize again
      status = transition(status, 'finalize')
      expect(status).toBe('ready')
    })

    it('handles classify self-loop on new', () => {
      let status: VideoStatus = 'new'
      status = transition(status, 'classify')
      expect(status).toBe('new')

      // Can still process after classify
      status = transition(status, 'process')
      expect(status).toBe('processing')
    })

    it('handles reopen flow: sent -> draft when visibility changes', () => {
      // Video was published (sent), then user changed YouTube visibility to private
      let status: VideoStatus = 'sent'
      status = transition(status, 'reopen')
      expect(status).toBe('draft')

      // Can now edit and re-finalize
      status = transition(status, 'finalize')
      expect(status).toBe('ready')

      // And send again
      status = transition(status, 'send')
      expect(status).toBe('sending')

      status = transition(status, 'success')
      expect(status).toBe('sent')
    })
  })

  describe('canTransition helper', () => {
    it('returns true for valid transitions', () => {
      expect(canTransition('new', 'process')).toBe(true)
      expect(canTransition('new', 'classify')).toBe(true)
      expect(canTransition('draft', 'finalize')).toBe(true)
      expect(canTransition('ready', 'send')).toBe(true)
    })

    it('returns false for invalid transitions', () => {
      expect(canTransition('new', 'send')).toBe(false)
      expect(canTransition('processing', 'classify')).toBe(false)
      expect(canTransition('sent', 'process')).toBe(false)
    })

    it('returns true for reopen on sent state', () => {
      expect(canTransition('sent', 'reopen')).toBe(true)
    })

    it('returns false for most actions on sent state', () => {
      const invalidActions: VideoAction[] = [
        'classify',
        'process',
        'complete',
        'error',
        'edit',
        'finalize',
        'send',
        'success',
      ]
      invalidActions.forEach((action) => {
        expect(canTransition('sent', action)).toBe(false)
      })
    })
  })

  describe('getValidActions helper', () => {
    it('returns valid actions for new state', () => {
      const actions = getValidActions('new')
      expect(actions).toContain('process')
      expect(actions).toContain('classify')
      expect(actions).toHaveLength(2)
    })

    it('returns valid actions for processing state', () => {
      const actions = getValidActions('processing')
      expect(actions).toContain('complete')
      expect(actions).toContain('error')
      expect(actions).toHaveLength(2)
    })

    it('returns valid actions for draft state', () => {
      const actions = getValidActions('draft')
      expect(actions).toContain('process')
      expect(actions).toContain('finalize')
      expect(actions).toContain('edit')
      expect(actions).toHaveLength(3)
    })

    it('returns valid actions for ready state', () => {
      const actions = getValidActions('ready')
      expect(actions).toContain('send')
      expect(actions).toContain('edit')
      expect(actions).toHaveLength(2)
    })

    it('returns valid actions for sending state', () => {
      const actions = getValidActions('sending')
      expect(actions).toContain('success')
      expect(actions).toContain('error')
      expect(actions).toHaveLength(2)
    })

    it('returns reopen action for sent state', () => {
      const actions = getValidActions('sent')
      expect(actions).toContain('reopen')
      expect(actions).toHaveLength(1)
    })
  })
})
