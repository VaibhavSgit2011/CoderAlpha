/**
 * ============================================================
 * AlphaStream AI — Global Error Handling Middleware
 * ============================================================
 *
 * Provides a structured error hierarchy and a single Express
 * error-handling middleware that catches every thrown /
 * forwarded error and returns a consistent JSON response.
 *
 * Error classes:
 *   AppError (base)
 *     ├─ ValidationError        400
 *     ├─ AuthenticationError    401
 *     ├─ ForbiddenError         403
 *     ├─ NotFoundError          404
 *     ├─ RateLimitError         429
 *     ├─ InternalError          500
 *     └─ ServiceUnavailableError 503
 *
 * In **development** the full stack trace is included in the
 * response body for easier debugging.
 *
 * In **production** only the safe, user-facing message is
 * returned; the full error is still written to the log.
 *
 * Usage:
 *   // At the END of your Express middleware chain:
 *   app.use(globalErrorHandler);
 *
 *   // Throwing from any route handler:
 *   throw new NotFoundError('Ticker not found');
 * ============================================================
 */

import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { createChildLogger } from '../utils/logger';

// ── Logger scoped to this module ──────────────────────────
const logger = createChildLogger('error-handler');

// ══════════════════════════════════════════════════════════
// Error Classes
// ══════════════════════════════════════════════════════════

/**
 * Base application error.
 *
 * Every custom error extends this class so the global handler
 * can distinguish *operational* errors (expected failures such
 * as bad input) from *programmer* errors (bugs).
 */
export class AppError extends Error {
  /** HTTP status code to return to the client. */
  public readonly statusCode: number;

  /** Whether this error is an expected operational failure
   *  (true) or an unexpected bug (false). */
  public readonly isOperational: boolean;

  /** Optional machine-readable error code for clients. */
  public readonly code: string;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true
  ) {
    super(message);

    // Maintain correct prototype chain so instanceof works.
    Object.setPrototypeOf(this, new.target.prototype);

    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    // Capture a clean stack trace (excludes constructor frame).
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * **400 Bad Request** — the client sent invalid / malformed data.
 */
export class ValidationError extends AppError {
  /** Optional structured details (e.g. Zod issue array). */
  public readonly details?: unknown;

  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * **401 Unauthorized** — the request lacks valid authentication.
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * **403 Forbidden** — the authenticated user lacks permission.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN_ERROR');
  }
}

/**
 * **404 Not Found** — the requested resource does not exist.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

/**
 * **429 Too Many Requests** — rate limit exhausted.
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

/**
 * **500 Internal Server Error** — an unexpected failure occurred.
 *
 * Marked as non-operational by default because 500s usually
 * indicate bugs that need developer attention.
 */
export class InternalError extends AppError {
  constructor(message = 'An unexpected internal error occurred') {
    super(message, 500, 'INTERNAL_ERROR', false);
  }
}

/**
 * **503 Service Unavailable** — a downstream dependency is
 * unreachable or temporarily overloaded.
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    message = 'Service temporarily unavailable. Please try again later.'
  ) {
    super(message, 503, 'SERVICE_UNAVAILABLE_ERROR');
  }
}

// ══════════════════════════════════════════════════════════
// Global Error Handler Middleware
// ══════════════════════════════════════════════════════════

/**
 * Express error-handling middleware (4-parameter signature).
 *
 * Must be registered **after** all routes:
 * ```ts
 * app.use(globalErrorHandler);
 * ```
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ── Determine response metadata ─────────────────────────
  const isAppError = err instanceof AppError;

  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_ERROR';
  const isOperational = isAppError ? err.isOperational : false;

  // ── Always log the full error server-side ────────────────
  if (statusCode >= 500 || !isOperational) {
    // 5xx or non-operational → this is a bug, log as error.
    logger.error('Unhandled / server error caught by global handler', {
      statusCode,
      code,
      message: err.message,
      stack: err.stack,
      isOperational,
    });
  } else {
    // Operational 4xx → expected failure, log as warning.
    logger.warn('Operational error caught by global handler', {
      statusCode,
      code,
      message: err.message,
    });
  }

  // ── Build the response body ──────────────────────────────
  const isDev = env.NODE_ENV === 'development';

  // Decide what message the client sees.
  const clientMessage =
    isOperational || isDev
      ? err.message
      : 'An unexpected error occurred. Please try again later.';

  // Base response shape — always returned.
  const responseBody: Record<string, unknown> = {
    success: false,
    error: clientMessage,
    code,
  };

  // In development, attach extra debugging information.
  if (isDev) {
    responseBody.stack = err.stack;

    // If this is a ValidationError, include the structured details.
    if (err instanceof ValidationError && err.details) {
      responseBody.details = err.details;
    }
  }

  // ── Send the response ────────────────────────────────────
  // Guard against double-sending if headers were already flushed.
  if (res.headersSent) {
    logger.warn(
      'Headers already sent — error handler could not respond.',
      { statusCode, code }
    );
    return;
  }

  res.status(statusCode).json(responseBody);
}
