/**
 * ============================================================================
 * AlphaStream AI — Global Error Manager
 * ============================================================================
 *
 * Centralised error handling service that acts as the backend's "global
 * try-catch". Every unhandled or significant error in the ingestion and
 * RAG pipelines is routed through this singleton so that:
 *
 * 1. **Full context logging** — Errors are logged with pipeline name,
 *    ticker context, and any additional metadata so they are easy to
 *    trace in production.
 *
 * 2. **Firestore status persistence** — The `system/status` document in
 *    Firestore is updated to `"degraded"` whenever a pipeline error occurs.
 *    The Next.js frontend reads this document to display graceful fallback
 *    UI (e.g. "Service temporarily unavailable").
 *
 * 3. **In-memory statistics** — Per-pipeline error counts and last-error
 *    timestamps are tracked in RAM for the `/health` API endpoint.
 *
 * 4. **Error clearing** — When a pipeline recovers, the error state is
 *    cleared both in memory and in Firestore.
 *
 * @module services/errorManager
 */

import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

/**
 * In-memory snapshot of error statistics exposed by `getErrorStats()`.
 */
export interface ErrorStats {
  /** Total number of errors recorded since the process started. */
  totalErrors: number;
  /** Breakdown of error counts keyed by pipeline name. */
  errorsByPipeline: Record<string, number>;
  /** The most recent error message, or `null` if no errors have occurred. */
  lastError: string | null;
  /** Timestamp of the most recent error, or `null`. */
  lastErrorAt: Date | null;
}

// ---------------------------------------------------------------------------
// ErrorManager
// ---------------------------------------------------------------------------

/**
 * Singleton error management service.
 * Access via the default export `errorManager`.
 */
class ErrorManager {
  private static instance: ErrorManager;

  // ---- In-memory error tracking ----
  private totalErrors: number = 0;
  private errorsByPipeline: Record<string, number> = {};
  private lastError: string | null = null;
  private lastErrorAt: Date | null = null;

  private constructor() {
    logger.info('[ErrorManager] Initialized');
  }

  public static getInstance(): ErrorManager {
    if (!ErrorManager.instance) {
      ErrorManager.instance = new ErrorManager();
    }
    return ErrorManager.instance;
  }

  // --------------------------------------------------------------------------
  // Public — Pipeline-Level Error Handling
  // --------------------------------------------------------------------------

  /**
   * Handles an error that occurred inside a named pipeline (e.g. "ingestion",
   * "rag", "embedding").
   *
   * ### Side Effects
   * - Increments in-memory error counters.
   * - Logs the full error with structured context.
   * - Writes a `"degraded"` status to the Firestore `system/status` document
   *   so the frontend can show a graceful fallback.
   *
   * @param pipelineName — Identifier for the pipeline that failed.
   * @param error        — The caught error (may be `unknown` type).
   * @param context      — Optional bag of extra metadata for logging.
   */
  public async handlePipelineError(
    pipelineName: string,
    error: unknown,
    context?: Record<string, unknown>,
  ): Promise<void> {
    // ---- Extract a human-readable message ----
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);

    const stack =
      error instanceof Error ? error.stack : undefined;

    // ---- Update in-memory counters ----
    this.totalErrors += 1;
    this.errorsByPipeline[pipelineName] =
      (this.errorsByPipeline[pipelineName] || 0) + 1;
    this.lastError = message;
    this.lastErrorAt = new Date();

    // ---- Log with full context ----
    logger.error(`[ErrorManager] Pipeline "${pipelineName}" error: ${message}`, {
      pipeline: pipelineName,
      errorMessage: message,
      stack,
      context,
      totalPipelineErrors: this.errorsByPipeline[pipelineName],
    });

    // ---- Persist degraded status to Firestore ----
    try {
      // Lazy-import the Firestore service to break the circular dependency
      // (errorManager ↔ firestoreService). This is fine because the import
      // only runs on the error path, which is not performance-critical.
      const { default: firestoreService } = await import('./firestore');

      await firestoreService.updateSystemStatus({
        status: 'degraded',
        lastError: message,
        lastErrorAt: new Date().toISOString(),
        pipeline: pipelineName,
      });

      logger.info(
        `[ErrorManager] Wrote degraded status to Firestore ` +
        `(pipeline: ${pipelineName})`,
      );
    } catch (firestoreError) {
      // If even Firestore is down, we can only log and continue.
      // The in-memory stats are still available via the /health endpoint.
      logger.error(
        `[ErrorManager] CRITICAL — Failed to write status to Firestore: ` +
        `${firestoreError instanceof Error ? firestoreError.message : firestoreError}`,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Public — Ticker-Level Error Handling
  // --------------------------------------------------------------------------

  /**
   * Handles an error specific to a single ticker (e.g. scraping failure for
   * "TSLA"). Sets the ticker's status to `"error"` in Firestore so the
   * frontend can display a per-ticker warning.
   *
   * @param ticker — The stock symbol that failed.
   * @param error  — The caught error.
   */
  public async handleTickerError(
    ticker: string,
    error: unknown,
  ): Promise<void> {
    const sanitizedTicker = ticker.trim().toUpperCase();

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);

    // ---- Update in-memory counters (filed under "ticker-<SYMBOL>") ----
    const pipelineKey = `ticker-${sanitizedTicker}`;
    this.totalErrors += 1;
    this.errorsByPipeline[pipelineKey] =
      (this.errorsByPipeline[pipelineKey] || 0) + 1;
    this.lastError = `[${sanitizedTicker}] ${message}`;
    this.lastErrorAt = new Date();

    logger.error(
      `[ErrorManager] Ticker "${sanitizedTicker}" error: ${message}`,
      {
        ticker: sanitizedTicker,
        errorMessage: message,
        stack: error instanceof Error ? error.stack : undefined,
      },
    );

    // ---- Update ticker status in Firestore ----
    try {
      const { default: firestoreService } = await import('./firestore');

      await firestoreService.updateTickerData(sanitizedTicker, {
        status: 'error',
      });

      logger.info(
        `[ErrorManager] Set ticker "${sanitizedTicker}" status to "error" in Firestore`,
      );
    } catch (firestoreError) {
      logger.error(
        `[ErrorManager] Failed to update ticker status in Firestore: ` +
        `${firestoreError instanceof Error ? firestoreError.message : firestoreError}`,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Public — Error Clearing
  // --------------------------------------------------------------------------

  /**
   * Clears the error status for a specific pipeline. Called when a pipeline
   * successfully completes a run after a previous failure, indicating
   * recovery.
   *
   * @param pipelineName — The pipeline that has recovered.
   */
  public async clearError(pipelineName: string): Promise<void> {
    logger.info(`[ErrorManager] Clearing error for pipeline "${pipelineName}"`);

    // Reset per-pipeline counter (keep total for historical tracking)
    delete this.errorsByPipeline[pipelineName];

    // If this was the most recently failed pipeline, clear the "last" fields
    // only if no other pipelines have active errors.
    const hasActiveErrors = Object.keys(this.errorsByPipeline).length > 0;
    if (!hasActiveErrors) {
      this.lastError = null;
      this.lastErrorAt = null;
    }

    // ---- Persist healthy status to Firestore ----
    try {
      const { default: firestoreService } = await import('./firestore');

      // Only write "operational" if there are no other active pipeline errors
      if (!hasActiveErrors) {
        await firestoreService.updateSystemStatus({
          status: 'operational',
          lastError: null,
          lastErrorAt: null,
          pipeline: null,
        });
      } else {
        // Still degraded, but update the pipeline field to reflect the
        // remaining broken pipeline(s).
        const remainingPipeline = Object.keys(this.errorsByPipeline)[0] || null;
        await firestoreService.updateSystemStatus({
          status: 'degraded',
          pipeline: remainingPipeline,
        });
      }

      logger.info(
        `[ErrorManager] Firestore status updated after clearing "${pipelineName}"`,
      );
    } catch (firestoreError) {
      logger.error(
        `[ErrorManager] Failed to clear error status in Firestore: ` +
        `${firestoreError instanceof Error ? firestoreError.message : firestoreError}`,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Public — Statistics
  // --------------------------------------------------------------------------

  /**
   * Returns a snapshot of the current in-memory error statistics.
   * Used by the `/health` endpoint to surface error rates without
   * needing a Firestore read.
   */
  public getErrorStats(): ErrorStats {
    return {
      totalErrors: this.totalErrors,
      errorsByPipeline: { ...this.errorsByPipeline },
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt ? new Date(this.lastErrorAt.getTime()) : null,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

/** Pre-instantiated ErrorManager singleton. Import this directly. */
const errorManager = ErrorManager.getInstance();
export default errorManager;
export { ErrorManager };
