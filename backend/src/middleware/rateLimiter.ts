/**
 * ============================================================
 * AlphaStream AI — Rate Limiting Middleware
 * ============================================================
 *
 * Provides tiered rate limiters for different API categories:
 *
 *   • defaultLimiter  — 30 req / min   (general endpoints)
 *   • strictLimiter   —  5 req / min   (expensive operations)
 *   • reportLimiter   —  3 req / min   (report generation)
 *   • chatLimiter     — 10 req / min   (AI chat queries)
 *
 * Each limiter:
 *   1. Keys on the authenticated user's UID when available,
 *      falling back to the client IP address.
 *   2. Returns a standardised JSON error body on exhaustion.
 *   3. Sends standard `RateLimit-*` and `Retry-After` headers.
 *
 * Usage:
 *   import { defaultLimiter, strictLimiter } from '../middleware/rateLimiter';
 *   router.use(defaultLimiter);
 *   router.post('/refresh', strictLimiter, handler);
 * ============================================================
 */

import rateLimit, { type RateLimitRequestHandler, type Options } from 'express-rate-limit';
import { Request } from 'express';
import { env } from '../config/env';

// ── Key Generator ─────────────────────────────────────────
// Use the Firebase UID attached by the auth middleware when
// present; otherwise fall back to the raw IP. This ensures
// that authenticated users get per-account limits while
// unauthenticated endpoints still get per-IP limits.
const keyGenerator = (req: Request): string => {
  return req.user?.uid || req.ip || 'unknown';
};

// ── Factory ───────────────────────────────────────────────
/**
 * Creates a rate limiter with the given quota.
 *
 * @param windowMs  - Sliding window duration in milliseconds.
 * @param max       - Maximum number of requests within the window.
 * @param label     - Human-readable label for logging / error messages.
 * @returns Configured express-rate-limit middleware.
 */
function createLimiter(
  windowMs: number,
  max: number,
  label: string
): RateLimitRequestHandler {
  const options: Partial<Options> = {
    // ── Window & quota ────────────────────────────────────
    windowMs,
    max,

    // ── Per-user keying ───────────────────────────────────
    keyGenerator,

    // ── Standard rate-limit headers (draft-6) ─────────────
    standardHeaders: true,
    legacyHeaders: false, // Disable X-RateLimit-* in favour of RateLimit-*

    // ── Custom JSON error response ────────────────────────
    handler: (_req, res, _next, options) => {
      // Calculate how many seconds until the window resets.
      const retryAfterSeconds = Math.ceil(windowMs / 1000);

      res.status(options.statusCode).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: retryAfterSeconds,
        message:
          `You have exceeded the ${label} rate limit of ${max} requests ` +
          `per ${retryAfterSeconds} seconds. Please wait before retrying.`,
      });
    },

    // ── Skip successful pre-flight requests ───────────────
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  };

  return rateLimit(options);
}

// ── Exported Limiters ─────────────────────────────────────

/**
 * **Default limiter** — suitable for most GET / list endpoints.
 *
 * Quota: `RATE_LIMIT_MAX_REQUESTS` requests per
 * `RATE_LIMIT_WINDOW_MS` (defaults: 30 req / 60 000 ms).
 */
export const defaultLimiter: RateLimitRequestHandler = createLimiter(
  env.RATE_LIMIT_WINDOW_MS,
  env.NODE_ENV === 'development' ? 10000 : env.RATE_LIMIT_MAX_REQUESTS,
  'default'
);

/**
 * **Strict limiter** — for expensive / mutation-heavy operations
 * such as forced data refresh or bulk imports.
 *
 * Quota: 5 requests per minute.
 */
export const strictLimiter: RateLimitRequestHandler = createLimiter(
  60_000, // 1 minute
  env.NODE_ENV === 'development' ? 10000 : 5,
  'strict'
);

/**
 * **Report limiter** — for AI report generation which is both
 * computationally expensive and rate-limited by upstream APIs.
 *
 * Quota: 3 requests per minute.
 */
export const reportLimiter: RateLimitRequestHandler = createLimiter(
  60_000, // 1 minute
  env.NODE_ENV === 'development' ? 10000 : 3,
  'report'
);

/**
 * **Chat limiter** — for conversational AI endpoints where each
 * request incurs LLM inference cost.
 *
 * Quota: 10 requests per minute.
 */
export const chatLimiter: RateLimitRequestHandler = createLimiter(
  60_000, // 1 minute
  env.NODE_ENV === 'development' ? 10000 : 10,
  'chat'
);
