import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { log } from './logger'

describe('log', () => {
  const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-24T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    mockConsoleLog.mockClear()
    mockConsoleError.mockClear()
  })

  it('logs INFO level to console.log with JSON format', () => {
    log('INFO', 'Test message')

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify({
        severity: 'INFO',
        message: 'Test message',
        timestamp: '2026-01-24T12:00:00.000Z',
      })
    )
  })

  it('logs WARN level to console.log with JSON format', () => {
    log('WARN', 'Warning message')

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify({
        severity: 'WARN',
        message: 'Warning message',
        timestamp: '2026-01-24T12:00:00.000Z',
      })
    )
  })

  it('logs ERROR level to console.error with JSON format', () => {
    log('ERROR', 'Error occurred')

    expect(mockConsoleError).toHaveBeenCalledWith(
      JSON.stringify({
        severity: 'ERROR',
        message: 'Error occurred',
        timestamp: '2026-01-24T12:00:00.000Z',
      })
    )
  })

  it('includes optional payload in log entry', () => {
    log('INFO', 'User action', { userId: 'abc123', action: 'login' })

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify({
        severity: 'INFO',
        message: 'User action',
        timestamp: '2026-01-24T12:00:00.000Z',
        userId: 'abc123',
        action: 'login',
      })
    )
  })

  it('handles nested objects in payload', () => {
    log('ERROR', 'API error', { error: { code: 'NOT_FOUND', details: { id: '123' } } })

    expect(mockConsoleError).toHaveBeenCalledWith(
      JSON.stringify({
        severity: 'ERROR',
        message: 'API error',
        timestamp: '2026-01-24T12:00:00.000Z',
        error: { code: 'NOT_FOUND', details: { id: '123' } },
      })
    )
  })
})
