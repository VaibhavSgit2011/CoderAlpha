/**
 * @file logger.ts
 * @description Structured Winston logger for the AlphaStream AI backend.
 *
 * Provides a centralized, production-quality logging solution with:
 *   - Colorized console transport for human-readable dev output
 *   - ISO 8601 timestamps on every log entry
 *   - Structured JSON metadata support for machine parsing
 *   - Configurable log level via LOG_LEVEL env var (default: 'info')
 *   - `createChildLogger(module)` factory that prefixes every message
 *     with the originating module name for easy grep/filtering.
 *
 * Usage:
 *   import { logger, createChildLogger } from '../utils/logger';
 *   const log = createChildLogger('MyService');
 *   log.info('Startup complete', { port: 3000 });
 */

import winston from 'winston';

// ---------------------------------------------------------------------------
// Custom log levels — ordered from highest severity (0) to lowest (4).
// Winston uses numeric priority: lower number = higher severity.
// ---------------------------------------------------------------------------
const LOG_LEVELS: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// ---------------------------------------------------------------------------
// Colour mapping for each level — used by the colorize transport so that
// terminal output is visually scannable at a glance.
// ---------------------------------------------------------------------------
const LOG_COLORS: Record<string, string> = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan',
};

// Register our custom colour palette with Winston.
winston.addColors(LOG_COLORS);

// ---------------------------------------------------------------------------
// Determine the active log level.
// In production we default to 'info'; developers can override via LOG_LEVEL.
// If an invalid level is supplied we fall back to 'info' to avoid crashes.
// ---------------------------------------------------------------------------
const resolveLogLevel = (): string => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();

  // Only accept levels that actually exist in our custom set.
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel;
  }

  // Default: surface info and above in all environments.
  return 'info';
};

// ---------------------------------------------------------------------------
// Shared format pipeline — every transport reuses this so output is uniform.
//
// 1. timestamp   → ISO 8601 string  (e.g. 2026-05-24T12:00:00.000Z)
// 2. errors      → captures stack traces into the `stack` field
// 3. printf      → human-readable one-liner with optional JSON metadata
// ---------------------------------------------------------------------------
const timestampFormat = winston.format.timestamp({
  format: 'YYYY-MM-DDTHH:mm:ss.SSSZ', // ISO 8601 with timezone offset
});

const errorStackFormat = winston.format.errors({ stack: true });

/**
 * Custom printf formatter.
 * Output pattern:  [TIMESTAMP] LEVEL: message  { ...metadata }
 *
 * If a `stack` field exists (i.e. an Error was logged), we append the full
 * stack trace on the next line so it doesn't get lost.
 */
const printFormat = winston.format.printf(
  ({ timestamp, level, message, stack, ...metadata }) => {
    // Build the base line.
    let log = `[${timestamp}] ${level}: ${message}`;

    // Append structured metadata if any extra keys were supplied.
    const metaKeys = Object.keys(metadata);
    if (metaKeys.length > 0) {
      log += `  ${JSON.stringify(metadata)}`;
    }

    // Append stack trace when present (logged errors).
    if (stack) {
      log += `\n${stack}`;
    }

    return log;
  }
);

// ---------------------------------------------------------------------------
// Console transport — colorized for local development ergonomics.
// In CI / production the colours degrade gracefully to plain text.
// ---------------------------------------------------------------------------
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize({ all: true }), // apply colours to the entire line
  ),
});

// ---------------------------------------------------------------------------
// Root logger instance.
// All child loggers delegate to this, so configuration is centralised.
// ---------------------------------------------------------------------------
const logger = winston.createLogger({
  level: resolveLogLevel(),
  levels: LOG_LEVELS,
  format: winston.format.combine(
    timestampFormat,
    errorStackFormat,
    printFormat,
  ),
  transports: [consoleTransport],
  // Do not exit the process on an unhandled exception inside Winston itself.
  exitOnError: false,
});

// ---------------------------------------------------------------------------
// Child logger factory.
// ---------------------------------------------------------------------------

/**
 * Creates a child logger that automatically prefixes every message with the
 * given module name enclosed in square brackets.
 *
 * This makes it trivial to filter logs by module:
 *   grep "\[IngestionService\]" app.log
 *
 * @param moduleName - Descriptive name of the calling module / service.
 * @returns A Winston Logger instance with the module's defaultMeta set.
 *
 * @example
 * ```ts
 * const log = createChildLogger('IngestionService');
 * log.info('Processing started', { documentId: 'abc-123' });
 * // => [2026-05-24T12:00:00.000+0000] info: [IngestionService] Processing started  {"documentId":"abc-123"}
 * ```
 */
const createChildLogger = (moduleName: string): winston.Logger => {
  return logger.child({ module: moduleName });
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export { logger, createChildLogger };
export default logger;
