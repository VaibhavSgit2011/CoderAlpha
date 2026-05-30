/**
 * @file retry.ts
 * @description Exponential-backoff retry utility for the AlphaStream AI backend.
 *
 * Wraps any async operation with automatic retry logic that:
 *   - Uses exponential backoff with optional random jitter
 *   - Guards against thundering-herd via jitter (0–500 ms)
 *   - Caps the maximum delay to prevent unbounded waits
 *   - Provides hooks for per-retry logging and custom retry predicates
 *   - Ships sensible defaults that cover common transient HTTP errors
 *     (429, 502, 503, 504) and Node.js network errors (ECONNRESET, etc.)
 *
 * Usage:
 *   import { retryWithBackoff } from '../utils/retry';
 *   const data = await retryWithBackoff(() => fetchFromApi('/items'));
 */

import { createChildLogger } from '../utils/logger';

// Module-scoped logger — all retry log lines are tagged [Retry].
const log = createChildLogger('Retry');

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * Configuration options for `retryWithBackoff`.
 * Every field is optional; sensible defaults are applied internally.
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts **after** the initial call.
   * Total invocations of `fn` = 1 (initial) + maxRetries.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds before the first retry.
   * Subsequent delays grow as `2^attempt * baseDelayMs`.
   * @default 1000
   */
  baseDelayMs?: number;

  /**
   * Upper cap for the computed delay.  Prevents absurdly long waits
   * when the exponential curve grows past a useful threshold.
   * @default 10000
   */
  maxDelayMs?: number;

  /**
   * When `true`, a random 0–500 ms jitter is added to every delay.
   * This prevents the "thundering herd" problem where many clients
   * retry at exactly the same instant.
   * @default true
   */
  jitter?: boolean;

  /**
   * Predicate that decides whether a given error is retryable.
   * Return `true` to retry, `false` to propagate immediately.
   *
   * The default implementation retries on:
   *   - HTTP status codes 429, 502, 503, 504
   *   - Node.js network errors: ECONNRESET, ETIMEDOUT, ENOTFOUND
   */
  retryOn?: (error: unknown) => boolean;

  /**
   * Optional callback invoked **before** each retry sleep.
   * Useful for custom metrics, alerting, or telemetry.
   *
   * @param attempt - The 1-based retry attempt number.
   * @param error   - The error that triggered the retry.
   */
  onRetry?: (attempt: number, error: unknown) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** HTTP status codes that typically indicate a transient server issue. */
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([
  429, // Too Many Requests (rate limiting)
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/** Node.js-level network error codes that are safe to retry. */
const RETRYABLE_NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',  // Connection reset by peer
  'ETIMEDOUT',   // TCP connect / DNS timeout
  'ENOTFOUND',   // DNS resolution failure (transient)
]);

/**
 * Extracts a numeric HTTP status code from an error, if one exists.
 * Handles Axios-style (`error.response.status`), fetch-style
 * (`error.status`), and plain `error.statusCode` patterns.
 */
const extractStatusCode = (error: unknown): number | undefined => {
  if (error === null || error === undefined || typeof error !== 'object') {
    return undefined;
  }

  const err = error as Record<string, unknown>;

  // Axios-style: error.response.status
  if (
    err.response &&
    typeof err.response === 'object' &&
    'status' in (err.response as Record<string, unknown>)
  ) {
    const status = (err.response as Record<string, unknown>).status;
    if (typeof status === 'number') return status;
  }

  // fetch / generic: error.status
  if (typeof err.status === 'number') return err.status;

  // Explicit statusCode field
  if (typeof err.statusCode === 'number') return err.statusCode;

  return undefined;
};

/**
 * Extracts a Node.js error code string (e.g. 'ECONNRESET') from an error.
 */
const extractErrorCode = (error: unknown): string | undefined => {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
};

/**
 * Default retry predicate.
 * Returns `true` for transient HTTP errors and well-known network errors.
 */
const defaultRetryOn = (error: unknown): boolean => {
  // Check HTTP status code first.
  const status = extractStatusCode(error);
  if (status !== undefined && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  // Check Node.js network error code.
  const code = extractErrorCode(error);
  if (code !== undefined && RETRYABLE_NETWORK_CODES.has(code)) {
    return true;
  }

  return false;
};

/**
 * Sleeps for the given number of milliseconds.
 * Wraps `setTimeout` in a promise for clean async/await usage.
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Core retry function
// ---------------------------------------------------------------------------

/**
 * Executes an async function with exponential-backoff retry logic.
 *
 * The delay between retries grows as:
 *   `Math.min(2^attempt * baseDelayMs + jitter, maxDelayMs)`
 *
 * where `jitter` is a random value in [0, 500] ms when enabled.
 *
 * @typeParam T - The resolved type of the wrapped async function.
 * @param fn      - The async operation to execute (and potentially retry).
 * @param options - Optional configuration overrides.
 * @returns The resolved value of `fn` on the first successful invocation.
 * @throws  The last error encountered when all retries are exhausted, or
 *          immediately if `retryOn` returns `false`.
 *
 * @example
 * ```ts
 * const html = await retryWithBackoff(
 *   () => fetch('https://example.com').then(r => r.text()),
 *   { maxRetries: 5, baseDelayMs: 500 },
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  // Merge caller-supplied options with defaults.
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 10000;
  const useJitter = options?.jitter ?? true;
  const retryOn = options?.retryOn ?? defaultRetryOn;
  const onRetry = options?.onRetry;

  // Track the last error so we can re-throw after exhausting retries.
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Attempt the operation.
      const result = await fn();
      return result; // Success — return immediately.
    } catch (error: unknown) {
      lastError = error;

      // If we've used all retries, break out and throw.
      if (attempt >= maxRetries) {
        log.error(
          `All ${maxRetries} retries exhausted. Propagating error.`,
          { error: error instanceof Error ? error.message : String(error) },
        );
        break;
      }

      // Check whether this error qualifies for a retry.
      if (!retryOn(error)) {
        log.warn(
          'Error is not retryable — propagating immediately.',
          { error: error instanceof Error ? error.message : String(error) },
        );
        throw error;
      }

      // ---------------------------------------------------------------
      // Compute the backoff delay.
      // Formula: min(2^attempt * baseDelay + jitter, maxDelay)
      // ---------------------------------------------------------------
      const exponentialDelay = Math.pow(2, attempt) * baseDelayMs;
      const jitterMs = useJitter ? Math.random() * 500 : 0;
      const delay = Math.min(exponentialDelay + jitterMs, maxDelayMs);

      // Fire the onRetry callback (custom telemetry / metrics hook).
      if (onRetry) {
        try {
          onRetry(attempt + 1, error);
        } catch {
          // Never let a callback crash the retry loop.
        }
      }

      log.warn(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`,
        {
          error: error instanceof Error ? error.message : String(error),
          statusCode: extractStatusCode(error),
          errorCode: extractErrorCode(error),
        },
      );

      // Wait before the next attempt.
      await sleep(delay);
    }
  }

  // All retries exhausted — propagate the last captured error.
  throw lastError;
}
