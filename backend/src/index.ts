/**
 * ============================================================================
 * AlphaStream AI — Backend Entry Point
 * ============================================================================
 *
 * This is the main entry point for the AlphaStream AI backend server.
 * It assembles all middleware, routes, and scheduled jobs into a single
 * Express application.
 *
 * Startup sequence:
 *   1. Load & validate environment variables (crashes if invalid)
 *   2. Create Express app with security middleware
 *   3. Mount all API route handlers
 *   4. Attach the global error handler
 *   5. Schedule the ingestion pipeline cron job
 *   6. Start the HTTP server
 *   7. Register graceful shutdown handlers
 *
 * @module index
 * ============================================================================
 */

// ── 1. Environment must be loaded FIRST (before any other import) ──────────
import { env } from './config/env';

// ── 2. Core dependencies ───────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';

// ── 3. Internal modules ────────────────────────────────────────────────────
import { logger } from './utils/logger';
import { globalErrorHandler } from './middleware/errorHandler';
import { defaultLimiter } from './middleware/rateLimiter';
import { healthRouter } from './routes/health';
import { tickerRouter } from './routes/ticker';
import { reportRouter } from './routes/report';
import { watchlistRouter } from './routes/watchlist';
import { chatRouter } from './routes/chat';
import { ingestionPipeline } from './pipelines/ingestion';

// ============================================================================
// Express Application Setup
// ============================================================================

const app = express();

// ── Security Headers ────────────────────────────────────────────────────────
// Helmet sets various HTTP headers to protect against common web vulnerabilities
// including XSS, clickjacking, MIME sniffing, and more.
app.use(
  helmet({
    // Content-Security-Policy is strict by default — relax if needed for
    // specific frontend integrations.
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    // Enable cross-origin resource sharing headers
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// ── CORS ────────────────────────────────────────────────────────────────────
// Only allow requests from the configured frontend origin.
// Credentials must be enabled for Firebase Auth tokens to be sent.
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Cache preflight for 24 hours to reduce OPTIONS requests
    maxAge: 86400,
  })
);

// ── Body Parsing ────────────────────────────────────────────────────────────
// Limit request body size to 1MB to prevent abuse. JSON is the only format
// we accept — form-encoded and multipart are not needed.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── Default Rate Limiter ────────────────────────────────────────────────────
// Applied globally to all routes as a first line of defense.
// Individual routes can override with stricter limiters.
app.use(defaultLimiter);

// ── Request Logging ─────────────────────────────────────────────────────────
// Log every incoming request at the 'http' level so it can be toggled
// independently from application logs.
app.use((req, _res, next) => {
  logger.http(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// ============================================================================
// Route Mounting
// ============================================================================

// Health check — unauthenticated, no rate limit override needed
app.use('/api/health', healthRouter);

// Ticker data endpoints
app.use('/api/tickers', tickerRouter);

// Report generation and retrieval
app.use('/api/reports', reportRouter);

// User watchlist management
app.use('/api/watchlist', watchlistRouter);

// Chat with market (RAG-based Q&A)
app.use('/api/chat', chatRouter);

// ── Catch-all 404 ───────────────────────────────────────────────────────────
// Any route not matched above returns a structured 404 response.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: 'The requested endpoint does not exist.',
  });
});

// ── Global Error Handler ────────────────────────────────────────────────────
// MUST be the last middleware registered. Catches all errors thrown or
// passed via next(err) from any route handler.
app.use(globalErrorHandler);

// ============================================================================
// Cron Jobs
// ============================================================================

/**
 * The Always-On Ingestion Engine cron job.
 *
 * Fires according to the INGESTION_CRON_SCHEDULE env var (default: every 15 min).
 * The pipeline itself handles:
 *   - Identifying stale tickers
 *   - Scraping via Bright Data
 *   - AI triage via Hugging Face
 *   - Embedding generation
 *   - Atomic Firestore + Pinecone writes
 *   - Error isolation per ticker
 *
 * The cron job is intentionally fire-and-forget — it logs its own results.
 */
let cronTask: cron.ScheduledTask | null = null;

if (env.INGESTION_CRON_SCHEDULE) {
  cronTask = cron.schedule(
    env.INGESTION_CRON_SCHEDULE,
    async () => {
      logger.info('═══════════════════════════════════════════════');
      logger.info('[Cron] Ingestion pipeline triggered by schedule');
      logger.info('═══════════════════════════════════════════════');

      try {
        const result = await ingestionPipeline.runFullIngestion();
        logger.info(
          `[Cron] Ingestion complete — ` +
            `Processed: ${result.tickersProcessed}, ` +
            `Skipped: ${result.tickersSkipped}, ` +
            `Errors: ${result.errors.length}, ` +
            `Duration: ${result.durationMs}ms`
        );
      } catch (err) {
        // This catch should theoretically never fire because the pipeline
        // handles its own errors, but we guard defensively.
        const msg = err instanceof Error ? err.message : 'Unknown cron error';
        logger.error(`[Cron] Fatal ingestion error: ${msg}`);
      }
    },
    {
      // Don't run immediately on server start — let the server settle first
      scheduled: true,
      // Use the system timezone
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  );

  logger.info(
    `[Cron] Ingestion pipeline scheduled: "${env.INGESTION_CRON_SCHEDULE}"`
  );
}

// ============================================================================
// Server Startup
// ============================================================================

const server = app.listen(env.PORT, () => {
  // ── Startup Banner ──────────────────────────────────────────────────────
  const banner = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     █████╗ ██╗     ██████╗ ██╗  ██╗ █████╗                  ║
║    ██╔══██╗██║     ██╔══██╗██║  ██║██╔══██╗                 ║
║    ███████║██║     ██████╔╝███████║███████║                  ║
║    ██╔══██║██║     ██╔═══╝ ██╔══██║██╔══██║                 ║
║    ██║  ██║███████╗██║     ██║  ██║██║  ██║                 ║
║    ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝                 ║
║                                                              ║
║    ███████╗████████╗██████╗ ███████╗ █████╗ ███╗   ███╗     ║
║    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██╔══██╗████╗ ████║     ║
║    ███████╗   ██║   ██████╔╝█████╗  ███████║██╔████╔██║     ║
║    ╚════██║   ██║   ██╔══██╗██╔══╝  ██╔══██║██║╚██╔╝██║     ║
║    ███████║   ██║   ██║  ██║███████╗██║  ██║██║ ╚═╝ ██║     ║
║    ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝     ║
║                                                              ║
║    Intelligence. Automated. Always On.                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝`;

  console.log(banner);

  logger.info('─────────────────────────────────────────────');
  logger.info(`  🚀 Server running on port ${env.PORT}`);
  logger.info(`  🌐 Environment: ${env.NODE_ENV}`);
  logger.info(`  🔗 Frontend URL: ${env.FRONTEND_URL}`);
  logger.info(`  ⏰ Cron: ${env.INGESTION_CRON_SCHEDULE}`);
  logger.info(`  📊 Rate Limit: ${env.RATE_LIMIT_MAX_REQUESTS} req/${env.RATE_LIMIT_WINDOW_MS}ms`);
  logger.info(`  🔍 Health: http://localhost:${env.PORT}/api/health`);
  logger.info('─────────────────────────────────────────────');
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Graceful shutdown handler. Ensures all in-flight requests complete and
 * scheduled jobs are stopped before the process exits.
 *
 * Triggered by:
 *   - SIGTERM (Docker stop, Kubernetes pod termination)
 *   - SIGINT  (Ctrl+C in development)
 */
function gracefulShutdown(signal: string): void {
  logger.info(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error(`[Shutdown] Error closing server: ${err.message}`);
      process.exit(1);
    }

    logger.info('[Shutdown] HTTP server closed — no new connections accepted.');
  });

  // 2. Stop the cron job so no new ingestion runs start
  if (cronTask) {
    cronTask.stop();
    logger.info('[Shutdown] Ingestion cron job stopped.');
  }

  // 3. Give in-flight requests 10 seconds to complete, then force exit
  const SHUTDOWN_TIMEOUT_MS = 10_000;
  const forceExitTimer = setTimeout(() => {
    logger.error(
      `[Shutdown] Forcefully terminating after ${SHUTDOWN_TIMEOUT_MS}ms timeout.`
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Don't let the timer keep the event loop alive if everything else finishes
  forceExitTimer.unref();

  // 4. Wait a moment for cleanup, then exit cleanly
  setTimeout(() => {
    logger.info('[Shutdown] Graceful shutdown complete. Goodbye! 👋');
    process.exit(0);
  }, 1000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections — log and continue
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error(`[Process] Unhandled Promise Rejection: ${msg}`);
});

// Handle uncaught exceptions — log and crash (these are not recoverable)
process.on('uncaughtException', (err: Error) => {
  logger.error(`[Process] Uncaught Exception: ${err.message}`);
  logger.error(err.stack || 'No stack trace available');
  // Uncaught exceptions leave the process in an undefined state — must exit
  process.exit(1);
});

// ============================================================================
// Export for Testing
// ============================================================================

export { app, server };
