// =============================================================================
// AlphaStream AI — Report Routes
// =============================================================================
// Handles all report-related HTTP endpoints:
//   POST /api/reports/generate  — Trigger deep dive report generation (RAG)
//   GET  /api/reports/          — List all reports for the authenticated user
//   GET  /api/reports/:id       — Get a specific report by ID
//
// Reports are generated asynchronously using the RAG pipeline. The POST
// endpoint returns 202 Accepted with the report_id, and the frontend
// can then poll the GET endpoint or use Firestore real-time listeners
// to know when the report is ready.
//
// Security: Users can only view reports they requested (ownership check).
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateUser } from '../middleware/auth';
import { reportLimiter } from '../middleware/rateLimiter';
import { validate, generateReportSchema } from '../middleware/validator';
import { FirestoreService } from '../services/firestore';
import { ragPipeline } from '../pipelines/rag';
import { logger } from '../utils/logger';

// Create the Express router for this route module
const router = Router();

// =============================================================================
// POST /generate — Trigger Deep Dive Report Generation
// =============================================================================

/**
 * Initiates the generation of a comprehensive due diligence report for a
 * given ticker symbol. This triggers the full RAG pipeline:
 *   1. Embed the query
 *   2. Retrieve relevant vectors from Pinecone
 *   3. Synthesize a report using a heavy reasoning model
 *   4. Save to Firestore
 *
 * The endpoint returns 202 immediately with the report_id. The actual
 * generation happens asynchronously. Rate-limited to prevent abuse
 * (these are expensive LLM calls).
 *
 * Request body: { ticker: "NVDA" }
 * Response:     { success: true, reportId: "...", message: "..." }
 */
router.post(
  '/generate',
  authenticateUser,
  reportLimiter,
  validate(generateReportSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticker } = req.body;
      const uid = req.user?.uid;

      // This should never happen because authenticateUser guarantees req.user,
      // but TypeScript doesn't know that — defensive coding.
      if (!uid) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'You must be logged in to generate reports.',
        });
        return;
      }

      const upperTicker = ticker.toUpperCase().trim();
      logger.info(`[Report] Report generation requested for ${upperTicker} by user ${uid}`);

      // Start report generation — this runs the full RAG pipeline synchronously
      // but we wrap it in a try/catch to handle failures gracefully.
      // Note: For a production system, you might want to make this truly async
      // using a job queue. For the hackathon MVP, synchronous-but-fast is fine.
      try {
        const reportId = await ragPipeline.generateReport(upperTicker, uid);

        res.status(202).json({
          success: true,
          reportId,
          message: `Report generation completed for ${upperTicker}. Retrieve it at GET /api/reports/${reportId}`,
        });
      } catch (genErr) {
        // Report generation failed — still return a proper error response
        const errorMessage = genErr instanceof Error ? genErr.message : 'Unknown generation error';
        logger.error(`[Report] Generation failed for ${upperTicker}: ${errorMessage}`);

        res.status(500).json({
          success: false,
          error: 'Report generation failed',
          message: `Unable to generate report for ${upperTicker}. Please try again later.`,
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        });
      }
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// GET / — List All Reports for Authenticated User
// =============================================================================

/**
 * Returns an array of all reports that were generated for (requested by)
 * the authenticated user. Reports are sorted by generation date (newest first).
 *
 * This powers the "My Reports" section of the frontend dashboard.
 */
router.get(
  '/',
  authenticateUser,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uid = req.user?.uid;

      if (!uid) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const firestore = FirestoreService.getInstance();
      logger.info(`[Report] Listing reports for user ${uid}`);
      const reports = await firestore.getReportsByUser(uid);

      res.status(200).json({
        success: true,
        count: reports.length,
        data: reports,
      });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// GET /:id — Get a Specific Report
// =============================================================================

/**
 * Returns a single report by its Firestore document ID.
 *
 * Security check: The authenticated user must be the one who requested
 * the report. If the report belongs to a different user, we return 403
 * Forbidden (not 404, because revealing existence is acceptable here
 * and 403 gives the user a clear error message).
 */
router.get(
  '/:id',
  authenticateUser,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const uid = req.user?.uid;

      if (!uid) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Validate that the report ID looks reasonable (Firestore doc IDs are
      // typically 20-character alphanumeric strings, but we allow some flexibility)
      if (!id || id.length < 1 || id.length > 128) {
        res.status(400).json({
          success: false,
          error: 'Invalid report ID',
          message: 'Report ID must be between 1 and 128 characters.',
        });
        return;
      }

      const firestore = FirestoreService.getInstance();
      logger.info(`[Report] Fetching report ${id} (requested by: ${uid})`);
      const report = await firestore.getReport(id);

      // Report not found
      if (!report) {
        res.status(404).json({
          success: false,
          error: 'Report not found',
          message: `No report found with ID '${id}'.`,
        });
        return;
      }

      // Ownership check: ensure the user owns this report
      if (report.requested_by !== uid) {
        logger.warn(
          `[Report] Unauthorized access attempt: user ${uid} tried to access ` +
          `report ${id} owned by ${report.requested_by}`
        );
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have permission to view this report.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// Export
// =============================================================================

export const reportRouter = router;
