/**
 * ============================================================
 * AlphaStream AI — Firebase Admin SDK Initialisation
 * ============================================================
 *
 * Initialises the Firebase Admin SDK using one of two
 * credential strategies (checked in priority order):
 *
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON  — inline JSON string
 *      (preferred for containerised / serverless deployments)
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH  — path to a local key
 *      file (convenient for local development)
 *
 * If neither is provided the SDK falls back to Application
 * Default Credentials (useful on GCP where ADC is auto-injected).
 *
 * Exports:
 *   • db        — Firestore database instance
 *   • adminAuth — Firebase Authentication admin instance
 * ============================================================
 */

import admin from 'firebase-admin';
import { env } from './env';
import { createChildLogger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

// ── Logger scoped to this module ──────────────────────────
const logger = createChildLogger('firebase-admin');

/**
 * Resolves the Firebase credential to use for initialisation.
 *
 * Priority:
 *   1. Inline JSON from FIREBASE_SERVICE_ACCOUNT_JSON
 *   2. File path from FIREBASE_SERVICE_ACCOUNT_PATH
 *   3. Application Default Credentials (no explicit credential)
 *
 * @returns An admin.credential.Credential or `null` to signal ADC.
 */
function resolveCredential(): admin.credential.Credential | null {
  // ── Strategy 1: Inline JSON ──────────────────────────────
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(
        env.FIREBASE_SERVICE_ACCOUNT_JSON
      ) as admin.ServiceAccount;

      logger.info(
        'Using inline service-account JSON (FIREBASE_SERVICE_ACCOUNT_JSON).'
      );
      return admin.credential.cert(serviceAccount);
    } catch (parseError) {
      logger.error(
        'Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON — the value is not valid JSON.',
        { error: parseError }
      );
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is set but contains invalid JSON. ' +
          'Please check the value in your environment / secrets.'
      );
    }
  }

  // ── Strategy 2: File path ────────────────────────────────
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    try {
      const absolutePath = path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_PATH)
        ? env.FIREBASE_SERVICE_ACCOUNT_PATH
        : path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);

      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      const serviceAccount = JSON.parse(fileContent) as admin.ServiceAccount;

      logger.info(
        `Using service-account file at "${absolutePath}".`
      );
      return admin.credential.cert(serviceAccount);
    } catch (fileError) {
      logger.error(
        `Failed to load service-account file at "${env.FIREBASE_SERVICE_ACCOUNT_PATH}".`,
        { error: fileError }
      );
      throw new Error(
        `Could not read Firebase service-account from path ` +
          `"${env.FIREBASE_SERVICE_ACCOUNT_PATH}". Ensure the file exists ` +
          `and is valid JSON.`
      );
    }
  }

  // ── Strategy 3: Application Default Credentials ──────────
  logger.warn(
    'No explicit Firebase credentials provided. ' +
      'Falling back to Application Default Credentials (ADC). ' +
      'This only works on GCP or when GOOGLE_APPLICATION_CREDENTIALS is set.'
  );
  return null;
}

// ── Initialise the Admin app ──────────────────────────────
// Guard against double-initialisation (e.g. hot-reload in dev).
function initializeFirebaseAdmin(): admin.app.App {
  // If the default app already exists, return it directly.
  if (admin.apps.length > 0) {
    logger.info('Firebase Admin SDK already initialised — reusing existing app.');
    return admin.app();
  }

  try {
    const credential = resolveCredential();

    const appOptions: admin.AppOptions = {
      projectId: env.FIREBASE_PROJECT_ID,
    };

    // Only attach explicit credential when one was resolved.
    if (credential) {
      appOptions.credential = credential;
    }

    const app = admin.initializeApp(appOptions);
    logger.info(
      `Firebase Admin SDK initialised successfully for project "${env.FIREBASE_PROJECT_ID}".`
    );
    return app;
  } catch (initError) {
    logger.error('Fatal: Firebase Admin SDK initialisation failed.', {
      error: initError,
    });
    throw initError;
  }
}

// ── Run initialisation ────────────────────────────────────
const firebaseApp = initializeFirebaseAdmin();

// ── Exported Instances ────────────────────────────────────

/**
 * Firestore database instance — use this throughout the
 * application for all document reads / writes.
 */
export const db = firebaseApp.firestore();

/**
 * Firebase Authentication admin instance — use for
 * server-side token verification & user management.
 */
export const adminAuth = firebaseApp.auth();
