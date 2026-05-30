/**
 * ============================================================
 * AlphaStream AI — Request Validation Middleware (Zod)
 * ============================================================
 *
 * Provides a generic validation middleware factory that can
 * validate `req.body`, `req.params`, or `req.query` against
 * any Zod schema.
 *
 * Also exports pre-built Zod schemas for the most common
 * request payloads used across AlphaStream endpoints.
 *
 * Usage:
 *   import { validate, tickerParamSchema } from '../middleware/validator';
 *   router.get('/:symbol', validate(tickerParamSchema, 'params'), handler);
 *
 * On validation failure a `ValidationError` (400) is thrown
 * with detailed Zod issue descriptions.
 * ============================================================
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, z } from 'zod';
import { ValidationError } from './errorHandler';

// ══════════════════════════════════════════════════════════
// Middleware Factory
// ══════════════════════════════════════════════════════════

/**
 * Creates an Express middleware that validates a specific part
 * of the incoming request against the given Zod schema.
 *
 * @param schema  - A Zod schema describing the expected shape.
 * @param source  - Which part of the request to validate.
 *                  Defaults to `'body'`.
 *
 * @returns Express middleware function.
 *
 * @example
 * ```ts
 * router.post(
 *   '/reports',
 *   validate(generateReportSchema, 'body'),
 *   reportController.generate
 * );
 * ```
 */
export function validate(
  schema: ZodSchema,
  source: 'body' | 'params' | 'query' = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Parse the selected request segment. `.parse()` throws
      // a ZodError if validation fails.
      const parsed = schema.parse(req[source]);

      // Replace the raw segment with the parsed (coerced /
      // defaulted) version so downstream handlers always see
      // clean, typed data.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[source] = parsed;

      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        // ── Format Zod issues into a readable summary ──────
        const formattedIssues = error.issues.map((issue) => ({
          field: issue.path.join('.') || '<root>',
          message: issue.message,
          code: issue.code,
        }));

        // Human-readable summary string.
        const summary = formattedIssues
          .map((i) => `${i.field}: ${i.message}`)
          .join('; ');

        throw new ValidationError(
          `Validation failed for request ${source}: ${summary}`,
          formattedIssues
        );
      }

      // Re-throw unexpected non-Zod errors so the global
      // error handler deals with them.
      throw error;
    }
  };
}

// ══════════════════════════════════════════════════════════
// Pre-Built Zod Schemas
// ══════════════════════════════════════════════════════════

/**
 * Validates URL path parameters containing a stock ticker symbol.
 *
 * Constraints:
 *   • 1 – 10 uppercase ASCII letters (e.g. AAPL, MSFT, BRK.A
 *     would need a different regex — kept strict here).
 *
 * @example
 * ```ts
 * router.get('/:symbol', validate(tickerParamSchema, 'params'), handler);
 * ```
 */
export const tickerParamSchema = z.object({
  symbol: z
    .string()
    .min(1, 'Ticker symbol is required')
    .max(10, 'Ticker symbol must be at most 10 characters')
    .regex(
      /^[A-Z]{1,10}$/,
      'Ticker symbol must be 1-10 uppercase letters (e.g. AAPL)'
    ),
});

/**
 * Validates the request body for the report generation endpoint.
 *
 * Fields:
 *   • ticker — required, 1-10 uppercase letters.
 *   • uid    — optional, the requesting user's Firebase UID
 *              (may be injected server-side rather than sent
 *              by the client).
 *
 * @example
 * ```ts
 * router.post('/generate', validate(generateReportSchema), handler);
 * ```
 */
export const generateReportSchema = z.object({
  ticker: z
    .string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker must be at most 10 characters')
    .regex(
      /^[A-Z]{1,10}$/,
      'Ticker must be 1-10 uppercase letters (e.g. TSLA)'
    ),
  uid: z.string().optional(),
});

/**
 * Validates the request body when adding a ticker to the
 * user's watchlist.
 *
 * Fields:
 *   • ticker — required, 1-10 uppercase letters.
 *
 * @example
 * ```ts
 * router.post('/add', validate(watchlistAddSchema), handler);
 * ```
 */
export const watchlistAddSchema = z.object({
  ticker: z
    .string()
    .min(1, 'Ticker is required')
    .max(10, 'Ticker must be at most 10 characters')
    .regex(
      /^[A-Z]{1,10}$/,
      'Ticker must be 1-10 uppercase letters (e.g. GOOGL)'
    ),
});

/**
 * Validates the request body for the AI chat / Q&A endpoint.
 *
 * Fields:
 *   • query  — required, 1-1000 characters, the user's
 *              natural-language question.
 *   • ticker — optional, scopes the query to a specific stock.
 *
 * @example
 * ```ts
 * router.post('/ask', validate(chatQuerySchema), handler);
 * ```
 */
export const chatQuerySchema = z.object({
  query: z
    .string()
    .min(1, 'Query must not be empty')
    .max(1000, 'Query must be at most 1000 characters'),
  ticker: z.string().optional(),
});
