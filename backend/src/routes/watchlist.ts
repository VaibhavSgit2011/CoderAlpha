// =============================================================================
// AlphaStream AI — Watchlist Routes
// =============================================================================
// Handles user watchlist management:
//   GET    /api/watchlist/          — Get the user's watchlist
//   POST   /api/watchlist/          — Add a ticker to the watchlist
//   DELETE /api/watchlist/:ticker   — Remove a ticker from the watchlist
//
// The watchlist is stored as an array of ticker symbols in the user's
// Firestore document (users/{uid}.watchlist). When a ticker is added,
// it also ensures the ticker exists in the global `tickers` collection
// so the ingestion pipeline will start tracking it.
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateUser } from '../middleware/auth';
import { validate, watchlistAddSchema } from '../middleware/validator';
import { FirestoreService } from '../services/firestore';
import { logger } from '../utils/logger';

// Create the Express router for this route module
const router = Router();

// =============================================================================
// GET / — Get User's Watchlist
// =============================================================================

/**
 * Returns the authenticated user's watchlist as an array of ticker symbols.
 * If the user has no watchlist (new user), returns an empty array.
 *
 * Response: { success: true, data: ["AAPL", "NVDA", "TSLA"] }
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
      logger.info(`[Watchlist] Fetching watchlist for user ${uid}`);
      const watchlist = await firestore.getUserWatchlist(uid);

      res.status(200).json({
        success: true,
        count: watchlist.length,
        data: watchlist,
      });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// POST / — Add Ticker to Watchlist
// =============================================================================

/**
 * Adds a ticker symbol to the authenticated user's watchlist.
 *
 * This endpoint:
 * 1. Validates the ticker symbol format
 * 2. Checks for duplicates (returns 409 Conflict if already in watchlist)
 * 3. Adds the ticker to the user's watchlist array in Firestore
 * 4. Ensures the ticker exists in the global `tickers` collection
 *    (creates a skeleton document if it doesn't exist, so the ingestion
 *    pipeline will pick it up on the next cron run)
 *
 * Request body: { ticker: "NVDA" }
 * Response:     { success: true, data: { ticker: "NVDA" } }
 */
router.post(
  '/',
  authenticateUser,
  validate(watchlistAddSchema),
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

      const { ticker } = req.body;
      const upperTicker = ticker.toUpperCase().trim();

      const firestore = FirestoreService.getInstance();

      // ── Check for duplicates ────────────────────────────────────────
      // We fetch the current watchlist to prevent duplicate entries.
      // This is a read-before-write pattern — acceptable for the low-frequency
      // nature of watchlist modifications.
      const currentWatchlist = await firestore.getUserWatchlist(uid);
      if (currentWatchlist.includes(upperTicker)) {
        res.status(409).json({
          success: false,
          error: 'Duplicate ticker',
          message: `'${upperTicker}' is already in your watchlist.`,
        });
        return;
      }

      // ── Watchlist size limit (prevent abuse) ────────────────────────
      const MAX_WATCHLIST_SIZE = 50;
      if (currentWatchlist.length >= MAX_WATCHLIST_SIZE) {
        res.status(400).json({
          success: false,
          error: 'Watchlist full',
          message: `Your watchlist has reached the maximum of ${MAX_WATCHLIST_SIZE} tickers. Remove a ticker before adding a new one.`,
        });
        return;
      }

      logger.info(`[Watchlist] Adding ${upperTicker} to watchlist for user ${uid}`);

      // ── Add to user's watchlist ─────────────────────────────────────
      await firestore.addToUserWatchlist(uid, upperTicker);

      // Ensure ticker exists in global tickers collection by creating
      // a skeleton document if one doesn't already exist. The ingestion
      // pipeline will fill in real data on the next cron cycle.
      const existingTicker = await firestore.getTickerData(upperTicker);
      if (!existingTicker) {
        await firestore.updateTickerData(upperTicker, {
          ticker_symbol: upperTicker,
          current_sentiment_score: 0,
          recent_news: [],
        } as any);
      }

      res.status(201).json({
        success: true,
        message: `'${upperTicker}' added to your watchlist.`,
        data: { ticker: upperTicker },
      });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// DELETE /:ticker — Remove Ticker from Watchlist
// =============================================================================

/**
 * Removes a ticker symbol from the authenticated user's watchlist.
 *
 * Note: We do NOT delete the ticker from the global `tickers` collection,
 * because other users might still be tracking it. The ingestion pipeline
 * handles cleanup of untracked tickers separately.
 *
 * Returns 200 even if the ticker wasn't in the watchlist (idempotent delete).
 */
router.delete(
  '/:ticker',
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

      const ticker = req.params.ticker as string;
      const upperTicker = ticker.toUpperCase().trim();

      // Basic validation for the ticker parameter
      if (!upperTicker || upperTicker.length > 10 || !/^[A-Z]+$/.test(upperTicker)) {
        res.status(400).json({
          success: false,
          error: 'Invalid ticker symbol',
          message: 'Ticker symbol must be 1-10 uppercase letters (e.g., AAPL, NVDA).',
        });
        return;
      }

      const firestore = FirestoreService.getInstance();
      logger.info(`[Watchlist] Removing ${upperTicker} from watchlist for user ${uid}`);

      await firestore.removeFromUserWatchlist(uid, upperTicker);

      res.status(200).json({
        success: true,
        message: `'${upperTicker}' removed from your watchlist.`,
        data: { ticker: upperTicker },
      });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// Export
// =============================================================================

export const watchlistRouter = router;
