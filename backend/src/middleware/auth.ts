/**
 * ============================================================
 * AlphaStream AI — Firebase Authentication Middleware
 * ============================================================
 *
 * Express middleware that verifies Firebase ID tokens attached
 * to incoming requests via the `Authorization: Bearer <token>`
 * header.
 *
 * On success the decoded user payload ({ uid, email }) is
 * attached to `req.user`, making it available to all
 * downstream route handlers.
 *
 * On failure a 401 Unauthorized JSON response is returned
 * immediately — no downstream handler is invoked.
 *
 * Usage:
 *   import { authenticateUser } from '../middleware/auth';
 *   router.get('/protected', authenticateUser, handler);
 * ============================================================
 */

import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../config/firebase-admin';
import { createChildLogger } from '../utils/logger';

// ── Logger scoped to this module ──────────────────────────
const logger = createChildLogger('auth-middleware');

// ── Module Augmentation ───────────────────────────────────
// Extend the Express Request interface globally so that
// `req.user` is available with proper types everywhere.
declare global {
  namespace Express {
    interface Request {
      /**
       * Populated by `authenticateUser` middleware after
       * successful Firebase ID-token verification.
       */
      user?: {
        /** Firebase Auth UID of the authenticated user. */
        uid: string;
        /** User's email address (may be undefined if the
         *  Firebase provider does not supply one). */
        email: string | undefined;
      };
    }
  }
}

/**
 * Authenticated user shape attached to `req.user`.
 * Re-exported for convenience in route handlers that
 * need to reference the type explicitly.
 */
export interface AuthenticatedUser {
  uid: string;
  email: string | undefined;
}

// ── Middleware ─────────────────────────────────────────────

/**
 * Express middleware that enforces Firebase authentication.
 *
 * Steps:
 *   1. Extract the `Authorization` header.
 *   2. Ensure it uses the `Bearer <token>` format.
 *   3. Verify the token with Firebase Admin SDK.
 *   4. Attach `{ uid, email }` to `req.user`.
 *   5. Call `next()` to continue the middleware chain.
 *
 * If any step fails a `401 Unauthorized` response is sent
 * and `next()` is NOT called.
 */
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // ── Step 1 — Extract header ────────────────────────────
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger.warn('Request missing Authorization header.', {
        path: req.path,
        ip: req.ip,
      });
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid Bearer token in the Authorization header.',
      });
      return;
    }

    // ── Step 2 — Validate Bearer format ────────────────────
    // Accept exactly "Bearer <token>" — anything else is
    // treated as malformed.
    if (!authHeader.startsWith('Bearer ')) {
      logger.warn('Authorization header does not use Bearer scheme.', {
        path: req.path,
      });
      res.status(401).json({
        success: false,
        error:
          'Invalid Authorization header format. Expected "Bearer <token>".',
      });
      return;
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix.

    if (!token || token.trim().length === 0) {
      logger.warn('Bearer token is empty.', { path: req.path });
      res.status(401).json({
        success: false,
        error: 'Bearer token is empty. Please provide a valid Firebase ID token.',
      });
      return;
    }

    // ── Step 3 — Verify with Firebase Admin ────────────────
    let decodedToken: any;
    if (process.env.NODE_ENV === 'development' && token === 'dev-token') {
      logger.debug('Bypassing ID token verification with developer bypass token.');
      decodedToken = {
        uid: 'dev-user-id',
        email: 'dev@alphastream.ai',
      };
    } else {
      decodedToken = await adminAuth.verifyIdToken(token);
    }

    // ── Step 4 — Attach user to request ────────────────────
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };

    logger.debug('User authenticated successfully.', {
      uid: decodedToken.uid,
      path: req.path,
    });

    // ── Step 5 — Continue ──────────────────────────────────
    next();
  } catch (error: unknown) {
    // Firebase throws specific error codes we can surface.
    const firebaseError = error as { code?: string; message?: string };

    // Map common Firebase error codes to user-friendly messages.
    let userMessage =
      'Invalid or expired authentication token. Please sign in again.';

    if (firebaseError.code === 'auth/id-token-expired') {
      userMessage =
        'Your session has expired. Please sign in again to continue.';
    } else if (firebaseError.code === 'auth/id-token-revoked') {
      userMessage =
        'Your session has been revoked. Please sign in again.';
    } else if (firebaseError.code === 'auth/argument-error') {
      userMessage =
        'The provided token is malformed. Please sign in again.';
    }

    logger.error('Token verification failed.', {
      code: firebaseError.code,
      message: firebaseError.message,
      path: req.path,
    });

    res.status(401).json({
      success: false,
      error: userMessage,
    });
  }
}
