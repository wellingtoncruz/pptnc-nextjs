type LogLevel = 'INFO' | 'WARN' | 'ERROR'

interface LogPayload {
  [key: string]: unknown
}

/**
 * Structured logging function for Cloud Logging compatibility.
 * Outputs JSON format with severity, message, timestamp, and optional payload.
 *
 * @param level - Log level: INFO, WARN, or ERROR
 * @param message - Human-readable log message
 * @param payload - Optional structured data to include in the log entry
 *
 * @example
 * log('INFO', 'User authenticated', { userId: 'abc123' })
 * log('ERROR', 'Failed to fetch videos', { error: err.message, podcastId })
 */
export function log(level: LogLevel, message: string, payload?: LogPayload): void {
  const entry = {
    severity: level,
    message,
    timestamp: new Date().toISOString(),
    ...payload,
  }

  if (level === 'ERROR') {
    console.error(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }
}
