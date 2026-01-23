/**
 * Structured logger for Cloud Logging compatibility
 * Replaces console.log/warn/error throughout the codebase
 *
 * In production (Cloud Run), logs are automatically collected by Cloud Logging
 * In development, logs are formatted for terminal readability
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface StructuredLog {
  severity: string;
  message: string;
  timestamp: string;
  context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SEVERITY_MAP: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
};

const isDevelopment = process.env.NODE_ENV === 'development';
const minLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
}

function formatForDev(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString().slice(11, 23);
  const prefix = {
    debug: '\x1b[36m[DEBUG]\x1b[0m',
    info: '\x1b[32m[INFO]\x1b[0m',
    warn: '\x1b[33m[WARN]\x1b[0m',
    error: '\x1b[31m[ERROR]\x1b[0m',
  }[level];

  let output = `${timestamp} ${prefix} ${message}`;
  if (context && Object.keys(context).length > 0) {
    output += ` ${JSON.stringify(context)}`;
  }
  return output;
}

function formatForProduction(level: LogLevel, message: string, context?: LogContext): string {
  const log: StructuredLog = {
    severity: SEVERITY_MAP[level],
    message,
    timestamp: new Date().toISOString(),
  };

  if (context && Object.keys(context).length > 0) {
    log.context = context;
  }

  return JSON.stringify(log);
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const formatted = isDevelopment
    ? formatForDev(level, message, context)
    : formatForProduction(level, message, context);

  // Use appropriate console method for log level
  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};

export default logger;
