// =============================================================================
// AlphaStream AI — Always-On Ingestion Pipeline
// =============================================================================
// This is the core data ingestion engine for AlphaStream. It runs on a cron
// schedule (default: every 15 minutes) and performs the following sequence:
//
// 1. Reads stale tickers from Firestore (those not updated within the threshold)
// 2. For each ticker (with bounded concurrency):
//    a) Fetches live price quotes via Alpha Vantage API
//    b) Scrapes financial news via BrightData SERP API
//    c) Combines price + news into a unified context block
//    d) Sanitizes and validates the combined raw text
//    e) Runs AI triage through HuggingFace LLM for sentiment + summary
//    f) Runs AI triage through HuggingFace LLM for sentiment + summary
//    g) Atomically writes results to Firestore metadata + saves to history collection
// 3. Each ticker is processed in isolation — one failure never crashes the batch
// =============================================================================

import { BrightDataService } from '../services/brightdata';
import { HuggingFaceService } from '../services/huggingface';
import { FirestoreService } from '../services/firestore';
import { ErrorManager } from '../services/errorManager';
import { alphaVantageService } from '../services/alphavantage';
import { logger } from '../utils/logger';
import { sanitizeText, truncateToTokenLimit } from '../utils/sanitizer';
import { env } from '../config/env';
import { Timestamp } from 'firebase-admin/firestore';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Result summary returned after a full ingestion run completes. */
export interface IngestionResult {
  /** Number of tickers that were successfully processed end-to-end */
  tickersProcessed: number;
  /** Number of tickers that were skipped (data still fresh) */
  tickersSkipped: number;
  /** Array of human-readable error descriptions for any tickers that failed */
  errors: string[];
  /** ISO timestamp of when the run started */
  startedAt: string;
  /** ISO timestamp of when the run completed */
  completedAt: string;
  /** Total wall-clock duration in milliseconds */
  durationMs: number;
}

/** Internal representation of a single ticker's processing outcome. */
interface TickerProcessingResult {
  ticker: string;
  status: 'processed' | 'skipped' | 'error';
  error?: string;
}

// -----------------------------------------------------------------------------
// Promise Pool — Bounded Concurrency Helper
// -----------------------------------------------------------------------------

/**
 * Processes an array of items with a bounded concurrency limit.
 * This prevents overwhelming external APIs with too many simultaneous requests
 * while still maximizing throughput by running `concurrency` items in parallel.
 *
 * @param items      - Array of items to process
 * @param concurrency - Maximum number of items to process simultaneously
 * @param handler    - Async function that processes a single item
 * @returns          - Array of results in the same order as inputs
 */
async function processTickerBatch<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;

  // Create `concurrency` number of worker promises that pull from the shared index
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      // Atomically grab the next index so no two workers process the same item
      const index = currentIndex++;
      try {
        results[index] = await handler(items[index]);
      } catch (err) {
        // This should never happen since handler should catch internally,
        // but we guard against it defensively
        results[index] = {
          ticker: String(items[index]),
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown worker error',
        } as unknown as R;
      }
    }
  });

  // Wait for all workers to drain the queue
  await Promise.all(workers);
  return results;
}

// -----------------------------------------------------------------------------
// IngestionPipeline Class
// -----------------------------------------------------------------------------

/**
 * The IngestionPipeline class encapsulates the entire data ingestion lifecycle.
 * It is designed as a singleton — use the exported `ingestionPipeline` instance.
 *
 * Key design decisions:
 * - Each ticker is processed in full isolation (try/catch per ticker)
 * - Concurrency is bounded to prevent API rate-limit storms
 * - A 100-character minimum acts as a circuit breaker for empty/blocked scrapes
 * - The pipeline stores its last run status for health-check introspection
 */
class IngestionPipeline {
  /** Singleton service instances — injected once at construction time */
  private readonly brightdata: BrightDataService;
  private readonly huggingface: HuggingFaceService;
  private readonly firestore: FirestoreService;
  private readonly errorManager: ErrorManager;

  /** Stores the result of the most recent ingestion run for health checks */
  private lastRunResult: IngestionResult | null = null;

  /** Flag to prevent overlapping ingestion runs */
  private isRunning = false;

  constructor() {
    // Each service is a singleton exported from its own module — we grab refs here
    this.brightdata = BrightDataService.getInstance();
    this.huggingface = HuggingFaceService.getInstance();
    this.firestore = FirestoreService.getInstance();
    this.errorManager = ErrorManager.getInstance();
  }

  // ---------------------------------------------------------------------------
  // Public API — Full Ingestion Run
  // ---------------------------------------------------------------------------

  /**
   * Executes a complete ingestion cycle across all stale tickers.
   *
   * This is the method wired to the cron schedule. It:
   * 1. Guards against overlapping runs
   * 2. Fetches all tickers whose data is older than the configured threshold
   * 3. Processes each stale ticker with bounded concurrency
   * 4. Returns a summary of what happened
   */
  async runFullIngestion(): Promise<IngestionResult> {
    // ── Guard: Prevent concurrent runs ──────────────────────────────────
    if (this.isRunning) {
      logger.warn('[Ingestion] Pipeline is already running — skipping this trigger');
      return {
        tickersProcessed: 0,
        tickersSkipped: 0,
        errors: ['Skipped: previous run still in progress'],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
      };
    }

    this.isRunning = true;
    const startedAt = new Date();
    logger.info('[Ingestion] ════════════════════════════════════════════');
    logger.info('[Ingestion] Starting full ingestion run...');

    try {
      // ── Step 1: Identify stale tickers ──────────────────────────────
      const staleThresholdMinutes = env.INGESTION_STALE_THRESHOLD_MINUTES;
      const allTickers = await this.firestore.getAllTickers();

      // Determine which tickers need refreshing based on their last_updated timestamp
      const now = Date.now();
      const thresholdMs = staleThresholdMinutes * 60 * 1000;

      const staleTickers: string[] = [];
      const freshTickers: string[] = [];

      for (const ticker of allTickers) {
        const lastUpdated = ticker.last_updated?.toMillis?.()
          ?? (ticker.last_updated instanceof Date ? ticker.last_updated.getTime() : 0);

        if (now - lastUpdated > thresholdMs) {
          staleTickers.push(ticker.ticker_symbol);
        } else {
          freshTickers.push(ticker.ticker_symbol);
        }
      }

      logger.info(
        `[Ingestion] Found ${allTickers.length} total tickers: ` +
        `${staleTickers.length} stale, ${freshTickers.length} fresh`
      );

      // ── Step 2: Process stale tickers with bounded concurrency ──────
      const concurrency = env.INGESTION_MAX_CONCURRENT;
      const results = await processTickerBatch<string, TickerProcessingResult>(
        staleTickers,
        concurrency,
        (ticker) => this.processOneTicker(ticker)
      );

      // ── Step 3: Aggregate results ───────────────────────────────────
      const completedAt = new Date();
      const processed = results.filter((r) => r.status === 'processed').length;
      const errors = results
        .filter((r) => r.status === 'error')
        .map((r) => `${r.ticker}: ${r.error}`);

      const result: IngestionResult = {
        tickersProcessed: processed,
        tickersSkipped: freshTickers.length,
        errors,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };

      // Store for health-check introspection
      this.lastRunResult = result;

      logger.info(
        `[Ingestion] Run complete — Processed: ${processed}, ` +
        `Skipped: ${freshTickers.length}, Errors: ${errors.length}`
      );
      logger.info(`[Ingestion] Duration: ${result.durationMs}ms`);
      logger.info('[Ingestion] ════════════════════════════════════════════');

      // If there were errors, report them (non-fatal — we still return results)
      if (errors.length > 0) {
        logger.warn(`[Ingestion] Errors encountered:\n  ${errors.join('\n  ')}`);
      }

      return result;
    } catch (err) {
      // This catches truly catastrophic errors (e.g., Firestore down entirely)
      const errorMessage = err instanceof Error ? err.message : 'Unknown fatal error';
      logger.error(`[Ingestion] FATAL error during ingestion run: ${errorMessage}`);

      // Report to the global error manager for alerting
      await this.errorManager.handlePipelineError('ingestion-pipeline', errorMessage, {
        phase: 'runFullIngestion',
        timestamp: new Date().toISOString(),
      });

      const completedAt = new Date();
      const result: IngestionResult = {
        tickersProcessed: 0,
        tickersSkipped: 0,
        errors: [`Fatal: ${errorMessage}`],
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };

      this.lastRunResult = result;
      return result;
    } finally {
      // Always release the running lock, even on catastrophic failure
      this.isRunning = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API — Single Ticker Refresh
  // ---------------------------------------------------------------------------

  /**
   * Force-refreshes a single ticker, bypassing the staleness check.
   * Used by the POST /:symbol/refresh endpoint for on-demand updates.
   *
   * @param ticker - The uppercase ticker symbol to refresh (e.g., "NVDA")
   * @throws       - Re-throws any processing error after logging
   */
  async refreshSingleTicker(ticker: string): Promise<void> {
    const upperTicker = ticker.toUpperCase().trim();
    logger.info(`[Ingestion] Force-refreshing single ticker: ${upperTicker}`);

    try {
      const result = await this.processOneTicker(upperTicker);

      if (result.status === 'error') {
        throw new Error(result.error ?? 'Unknown processing error');
      }

      logger.info(`[Ingestion] Successfully refreshed ${upperTicker}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`[Ingestion] Failed to refresh ${upperTicker}: ${errorMessage}`);

      await this.errorManager.handlePipelineError('single-ticker-refresh', errorMessage, {
        ticker: upperTicker,
        timestamp: new Date().toISOString(),
      });

      throw err; // Propagate to the route handler for a proper HTTP error response
    }
  }

  // ---------------------------------------------------------------------------
  // Public API — Last Run Status (for Health Checks)
  // ---------------------------------------------------------------------------

  /**
   * Returns the status of the most recent ingestion run, or a default object
   * if the pipeline has never run. Used by the /api/health endpoint.
   */
  getLastRunStatus(): object {
    if (!this.lastRunResult) {
      return {
        status: 'never_run',
        isRunning: this.isRunning,
        message: 'No ingestion run has been completed yet',
      };
    }

    return {
      ...this.lastRunResult,
      isRunning: this.isRunning,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Single Ticker Processing (The Core Pipeline)
  // ---------------------------------------------------------------------------

  /**
   * Processes a single ticker through the entire ingestion pipeline.
   * This method is the heart of the system — it orchestrates every step
   * from data acquisition to vector storage.
   *
   * Pipeline steps:
   *   A) Fetch live price quote from Alpha Vantage
   *   B) Fetch financial news via BrightData SERP API
   *   C) Combine price + news into unified context
   *   D) Sanitize and validate payload size
   *   E) AI Triage — Sentiment + Summary via HuggingFace LLM
   *   F) Generate embedding via HuggingFace sentence-transformers
   *   G) Parallel atomic write — Firestore (prices + news) + Pinecone (vector)
   *
   * CRITICAL: This method NEVER throws. It catches all errors and returns
   * a TickerProcessingResult with status='error'. This ensures one bad
   * ticker doesn't crash the entire batch.
   *
   * @param ticker - Uppercase ticker symbol (e.g., "AAPL")
   * @returns      - Processing result indicating success, skip, or error
   */
  private async processOneTicker(ticker: string): Promise<TickerProcessingResult> {
    const startTime = Date.now();
    logger.info(`[Ingestion] [${ticker}] Starting processing...`);

    try {
      // ── Step A: Fetch live price quote from Alpha Vantage ─────────────
      logger.info(`[Ingestion] [${ticker}] Fetching live quote via Alpha Vantage...`);
      let priceBlock = '';
      let price = 0;
      let change = 0;
      let changePercent = 0;
      let high = 0;
      let low = 0;
      let volume = 0;

      try {
        const quote = await alphaVantageService.fetchGlobalQuote(ticker);
        price = quote.price;
        change = quote.change;
        changePercent = quote.changePercent;
        high = quote.high;
        low = quote.low;
        volume = quote.volume;

        priceBlock =
          `=== LIVE MARKET QUOTE FOR ${ticker} ===\n` +
          `Current Price: $${price.toFixed(2)}\n` +
          `Price Change: $${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n` +
          `Day High: $${high.toFixed(2)}\n` +
          `Day Low: $${low.toFixed(2)}\n` +
          `Volume: ${volume.toLocaleString()}\n`;

        logger.info(
          `[Ingestion] [${ticker}] Alpha Vantage quote: $${price.toFixed(2)} ` +
          `(${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`
        );
      } catch (avErr) {
        logger.warn(
          `[Ingestion] [${ticker}] Alpha Vantage quote fetch failed: ${
            avErr instanceof Error ? avErr.message : 'Unknown'
          }. Continuing with news data only.`
        );
      }

      // ── Step B: Fetch news via BrightData SERP API ────────────────────
      logger.info(`[Ingestion] [${ticker}] Fetching news via BrightData SERP...`);
      let newsText = '';
      let newsItems: { title: string; url: string; snippet: string; source: string }[] = [];

      try {
        const serpResults = await this.brightdata.fetchSerpNews(ticker);
        newsItems = serpResults;
        // Extract and concatenate all text snippets from the SERP results
        newsText = serpResults
          .map((r) => `[${r.source}] ${r.title ?? ''}: ${r.snippet ?? ''}`)
          .join('\n');
      } catch (serpErr) {
        // SERP failure is non-fatal — we'll proceed with price data alone
        logger.warn(
          `[Ingestion] [${ticker}] SERP fetch failed: ${
            serpErr instanceof Error ? serpErr.message : 'Unknown'
          }. Continuing with price data only.`
        );
      }

      // ── Step C: Combine price + news into unified context ─────────────
      const rawCombined = `${priceBlock}\n\n=== LATEST FINANCIAL NEWS ===\n\n${newsText}`;
      const sanitized = sanitizeText(rawCombined);
      const truncated = truncateToTokenLimit(sanitized, 3000); // ~3000 chars ≈ ~750 tokens

      // ── Step D: Validate payload size (Circuit Breaker) ───────────────
      // If both Alpha Vantage and BrightData returned nothing usable,
      // the sanitized text will be very short. We refuse to waste AI tokens
      // on garbage input — 100 characters is our minimum viable payload.
      if (truncated.length < 100) {
        logger.warn(
          `[Ingestion] [${ticker}] Payload too small (${truncated.length} chars). ` +
          'Possible API blocks on both sources. Skipping AI processing.'
        );
        return {
          ticker,
          status: 'error',
          error: `Circuit breaker: payload too small (${truncated.length} chars, minimum 100)`,
        };
      }

      logger.info(
        `[Ingestion] [${ticker}] Sanitized payload: ${truncated.length} chars. Proceeding to AI triage.`
      );

      // ── Step E: AI Triage — Sentiment + Summary via HuggingFace LLM ──
      logger.info(`[Ingestion] [${ticker}] Running AI triage via HuggingFace...`);

      const triageResult = await this.huggingface.triageSentiment(truncated);

      const sentimentScore = triageResult.sentiment_score;
      const summary = triageResult.summary;

      logger.info(
        `[Ingestion] [${ticker}] Triage complete — Score: ${sentimentScore}, Model: ${triageResult.model_used}`
      );
      // ── Step G: Parallel Atomic Write — Firestore metadata + History ──────────
      logger.info(`[Ingestion] [${ticker}] Performing parallel atomic write...`);

      // Build context summary that includes both price and news context
      const contextSummary =
        `${ticker} @ $${price.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%) | ` +
        `High: $${high.toFixed(2)}, Low: $${low.toFixed(2)}, Vol: ${volume.toLocaleString()} | ` +
        `${summary}`;

      const [firestoreResult, historyResult] = await Promise.allSettled([
        // Branch A: Update Firestore with structured metadata (prices + news)
        this.firestore.updateTickerData(ticker, {
          ticker_symbol: ticker,
          current_sentiment_score: sentimentScore,
          recent_news: newsItems.length > 0
            ? newsItems.map((item) => ({
                title: item.title,
                url: item.url,
                ai_summary: item.snippet,
                source: item.source,
              }))
            : [{
                title: `AI Market Summary`,
                url: '',
                ai_summary: summary,
                source: 'AI Triage',
              }],
          last_updated: Timestamp.now(),
        }),

        // Branch B: Save the combined price+news summary into Firestore history
        this.firestore.saveMarketDetailHistory({
          ticker_symbol: ticker,
          summary: contextSummary,
          source: 'ingestion',
          timestamp: Timestamp.now(),
        }),
      ]);

      // Check if either write failed and log warnings (but don't fail the ticker)
      if (firestoreResult.status === 'rejected') {
        logger.error(
          `[Ingestion] [${ticker}] Firestore metadata write failed: ${firestoreResult.reason}`
        );
      }
      if (historyResult.status === 'rejected') {
        logger.error(
          `[Ingestion] [${ticker}] Firestore history save failed: ${historyResult.reason}`
        );
      }

      // If BOTH writes failed, treat this ticker as an error
      if (firestoreResult.status === 'rejected' && historyResult.status === 'rejected') {
        return {
          ticker,
          status: 'error',
          error: 'Both Firestore metadata write and history save failed',
        };
      }

      const elapsed = Date.now() - startTime;
      logger.info(
        `[Ingestion] [${ticker}] ✅ Processing complete in ${elapsed}ms ` +
        `(price: $${price.toFixed(2)}, sentiment: ${sentimentScore}, summary: ${summary.length} chars)`
      );

      return { ticker, status: 'processed' };
    } catch (err) {
      // ── Catch-All: Ensure one ticker never crashes the batch ──────────
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`[Ingestion] [${ticker}] ❌ Processing failed: ${errorMessage}`);

      // Report to ErrorManager for monitoring/alerting, but do NOT throw
      try {
        await this.errorManager.handlePipelineError('ticker-processing', errorMessage, {
          ticker,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Even error reporting failure shouldn't crash the batch
        logger.error(`[Ingestion] [${ticker}] Failed to report error to ErrorManager`);
      }

      return {
        ticker,
        status: 'error',
        error: errorMessage,
      };
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================
// The ingestion pipeline is instantiated once and shared across the application.
// The cron job in index.ts and the ticker refresh endpoint both use this instance.

export const ingestionPipeline = new IngestionPipeline();
