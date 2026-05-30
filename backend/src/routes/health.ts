// =============================================================================
// AlphaStream AI — Health Check Route
// =============================================================================
// Provides a comprehensive system health snapshot at GET /api/health.
// This endpoint is intentionally unauthenticated so monitoring tools,
// load balancers, and uptime checkers can poll it freely.
//
// The response aggregates:
//   - Basic server info (uptime, version, timestamp)
//   - Circuit breaker states for every external service
//   - Ingestion pipeline run status
//   - Error manager statistics
// =============================================================================

import { Router, Request, Response } from 'express';
import { BrightDataService } from '../services/brightdata';
import { HuggingFaceService } from '../services/huggingface';
import { FirestoreService } from '../services/firestore';
import { ErrorManager } from '../services/errorManager';
import { ingestionPipeline } from '../pipelines/ingestion';
import { logger } from '../utils/logger';

// Create the Express router for this route module
const router = Router();

// Track when the server started — used to calculate uptime
const serverStartTime = Date.now();

// -----------------------------------------------------------------------------
// GET / — System Health Check
// -----------------------------------------------------------------------------

/**
 * Returns a comprehensive health status for the entire AlphaStream backend.
 *
 * This endpoint is designed to be:
 * - Fast: No heavy computation, just status reads
 * - Safe: Catches all errors and still returns a response
 * - Informative: Gives operators a full picture of system state
 *
 * The response shape matches what the frontend dashboard and monitoring
 * tools expect. Services that are unreachable will show an error state
 * rather than crashing the health check.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // ── Gather service statuses ───────────────────────────────────────
    // Each service exposes a `getCircuitBreakerStatus()` or similar method
    // that returns the current state without making any external calls.

    // BrightData has SERP API circuit breaker
    let brightdataStatus: object;
    try {
      const brightdata = BrightDataService.getInstance();
      brightdataStatus = brightdata.getServiceStatus();
    } catch {
      brightdataStatus = { serp: 'UNKNOWN', error: 'Service unavailable' };
    }

    // HuggingFace has circuit breakers for triage, reasoning, and embedding models
    let huggingfaceStatus: object;
    try {
      const huggingface = HuggingFaceService.getInstance();
      huggingfaceStatus = huggingface.getServiceStatus();
    } catch {
      huggingfaceStatus = { error: 'Service unavailable' };
    }

    // Pinecone service is fully deprecated and removed

    // Firestore connection status
    let firestoreStatus: string;
    try {
      FirestoreService.getInstance();
      firestoreStatus = 'connected';
    } catch {
      firestoreStatus = 'UNKNOWN';
    }

    // Error manager accumulated statistics
    let errorStats: object;
    try {
      const errorManager = ErrorManager.getInstance();
      errorStats = errorManager.getErrorStats();
    } catch {
      errorStats = { error: 'ErrorManager unavailable' };
    }

    // ── Calculate uptime ──────────────────────────────────────────────
    const uptimeMs = Date.now() - serverStartTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    // ── Assemble the health response ──────────────────────────────────
    const healthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      version: '1.0.0',
      services: {
        brightdata: brightdataStatus,
        huggingface: huggingfaceStatus,
        firestore: firestoreStatus,
      },
      pipeline: {
        lastIngestionRun: ingestionPipeline.getLastRunStatus(),
        errors: errorStats,
      },
    };

    res.status(200).json(healthResponse);
  } catch (err) {
    // Even if something goes wrong assembling the health check, we still
    // return a response so the endpoint never 500s completely.
    const errorMessage = err instanceof Error ? err.message : 'Unknown health check error';
    logger.error(`[Health] Health check failed: ${errorMessage}`);

    res.status(200).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      version: '1.0.0',
      error: errorMessage,
      services: {
        brightdata: { serp: 'UNKNOWN' },
        huggingface: { error: 'Unable to determine' },
        firestore: 'UNKNOWN',
      },
      pipeline: {
        lastIngestionRun: { status: 'unknown' },
        errors: { error: 'Unable to determine' },
      },
    });
  }
});

// =============================================================================
// Export
// =============================================================================

export const healthRouter = router;
