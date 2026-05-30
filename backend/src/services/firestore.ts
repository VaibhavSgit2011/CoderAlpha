/**
 * ============================================================================
 * AlphaStream AI — Firestore Service (Server-Side)
 * ============================================================================
 *
 * Provides a strongly-typed data-access layer over Google Cloud Firestore
 * (via the Firebase Admin SDK). All server-side reads and writes to the
 * three core collections — `tickers`, `reports`, and `users` — flow
 * through this singleton.
 *
 * ### Collections Managed
 *
 * | Collection | Purpose                                          |
 * |------------|--------------------------------------------------|
 * | `tickers`  | Live sentiment data, recent news, last-updated   |
 * | `reports`  | Generated due-diligence reports                  |
 * | `users`    | User watchlists                                  |
 * | `system`   | Singleton status document (`system/status`)      |
 *
 * ### Design Notes
 * - All writes use `{ merge: true }` where appropriate so partial updates
 *   don't clobber existing fields.
 * - Timestamps are always `FieldValue.serverTimestamp()` on writes and
 *   `FirebaseFirestore.Timestamp` on reads to guarantee clock consistency.
 * - The service **does not** perform auth checks — that is the
 *   responsibility of the route/middleware layer.
 *
 * @module services/firestore
 */

import { db } from '../config/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Public Interfaces — Document Types
// ---------------------------------------------------------------------------

/**
 * A single news article stored inside a `TickerDocument.recent_news` array.
 */
export interface NewsItem {
  /** Headline of the news article */
  title: string;
  /** Canonical source URL */
  url: string;
  /** AI-generated summary of the article's financial relevance */
  ai_summary: string;
  /** Publisher or domain name (e.g. "Reuters") */
  source: string;
}

/**
 * Schema for documents in the `tickers` collection.
 * Each document ID is the ticker symbol itself (e.g. "AAPL").
 */
export interface TickerDocument {
  /** Stock ticker symbol — also used as the document ID */
  ticker_symbol: string;
  /** Timestamp of the last successful data refresh */
  last_updated: FirebaseFirestore.Timestamp;
  /** Latest AI sentiment score (0 = bearish, 100 = bullish) */
  current_sentiment_score: number;
  /** Array of the most recent news articles with AI summaries */
  recent_news: NewsItem[];
  /** Optional processing status: "active", "processing", "error" */
  status?: string;
}

/**
 * Schema for documents in the `market_details_history` collection.
 * Stores historical combined price and news summaries for RAG context.
 */
export interface MarketDetailHistoryDocument {
  id?: string;
  ticker_symbol: string;
  timestamp: FirebaseFirestore.Timestamp | Date;
  summary: string;
  source: string;
}

/**
 * Schema for documents in the `reports` collection.
 * Each document contains a complete, structured due-diligence report.
 */
export interface ReportDocument {
  /** Unique report identifier (Firestore auto-generated) */
  report_id: string;
  /** The stock ticker this report analyses */
  ticker_symbol: string;
  /** Server timestamp of when the report was generated */
  generated_at: FirebaseFirestore.Timestamp;
  /** UID of the user who requested the report */
  requested_by: string;
  /** Structured report body */
  content: {
    /** Key bullish signals */
    strengths: string[];
    /** Key bearish risks */
    weaknesses: string[];
    /** Near-term catalysts */
    catalysts: string[];
    /** Overall investment thesis */
    overall_thesis: string;
    /** Suggested trade rating (e.g. Strong Buy / Hold) */
    suggested_trade?: string;
    /** The analytical rationale for this trade suggestion */
    trade_reasoning?: string;
  };
}

/**
 * Chat message schema stored in Firestore.
 */
export interface ChatMessage {
  id?: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: FirebaseFirestore.Timestamp | Date;
  tickerSymbol?: string;
}


// ---------------------------------------------------------------------------
// Collection Name Constants
// ---------------------------------------------------------------------------

const TICKERS_COLLECTION = 'tickers';
const REPORTS_COLLECTION = 'reports';
const USERS_COLLECTION = 'users';
const SYSTEM_COLLECTION = 'system';
const STATUS_DOC = 'status';
const MARKET_DETAILS_HISTORY_COLLECTION = 'market_details_history';

// ---------------------------------------------------------------------------
// FirestoreService
// ---------------------------------------------------------------------------

/**
 * Singleton data-access layer for Firestore.
 * Access via the default export `firestoreService`.
 */
class FirestoreService {
  private static instance: FirestoreService;

  private constructor() {
    logger.info('[FirestoreService] Initialized');
  }

  public static getInstance(): FirestoreService {
    if (!FirestoreService.instance) {
      FirestoreService.instance = new FirestoreService();
    }
    return FirestoreService.instance;
  }

  // ==========================================================================
  // TICKERS
  // ==========================================================================

  /**
   * Retrieves the full document for a single ticker.
   *
   * @param ticker — Stock symbol (case-insensitive; normalised to uppercase).
   * @returns The `TickerDocument`, or `null` if the ticker does not exist.
   */
  public async getTickerData(ticker: string): Promise<TickerDocument | null> {
    const id = ticker.trim().toUpperCase();

    try {
      const snap = await db.collection(TICKERS_COLLECTION).doc(id).get();

      if (!snap.exists) {
        logger.debug(`[Firestore] Ticker "${id}" not found`);
        return null;
      }

      const data = snap.data() as TickerDocument;
      return { ...data, ticker_symbol: id };
    } catch (error) {
      logger.error(
        `[Firestore] Error reading ticker "${id}": ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * Partially updates a ticker document. Creates the document if it does
   * not already exist (`merge: true`).
   *
   * @param ticker — Stock symbol.
   * @param data   — Fields to set / merge.
   */
  public async updateTickerData(
    ticker: string,
    data: Partial<TickerDocument>,
  ): Promise<void> {
    const id = ticker.trim().toUpperCase();

    try {
      // Always refresh the `last_updated` timestamp
      const payload: Record<string, unknown> = {
        ...data,
        ticker_symbol: id,
        last_updated: FieldValue.serverTimestamp(),
      };

      await db.collection(TICKERS_COLLECTION).doc(id).set(payload, { merge: true });

      logger.info(`[Firestore] Updated ticker "${id}"`);
    } catch (error) {
      logger.error(
        `[Firestore] Error updating ticker "${id}": ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * Returns every ticker document in the collection.
   * Used by the Ingestion Engine to build the refresh queue.
   */
  public async getAllTickers(): Promise<TickerDocument[]> {
    try {
      const snap = await db.collection(TICKERS_COLLECTION).get();

      const tickers: TickerDocument[] = snap.docs.map((doc) => {
        const data = doc.data() as TickerDocument;
        return { ...data, ticker_symbol: doc.id };
      });

      logger.info(`[Firestore] Fetched ${tickers.length} tickers`);
      return tickers;
    } catch (error) {
      logger.error(
        `[Firestore] Error fetching all tickers: ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * Returns ticker symbols whose `last_updated` timestamp is older than
   * `thresholdMinutes` minutes ago (i.e. stale data that needs refreshing).
   *
   * @param thresholdMinutes — Number of minutes after which data is stale.
   * @returns An array of ticker symbol strings.
   */
  public async getStaleTickers(thresholdMinutes: number): Promise<string[]> {
    try {
      const thresholdDate = new Date(
        Date.now() - thresholdMinutes * 60 * 1_000,
      );
      const thresholdTimestamp = Timestamp.fromDate(thresholdDate);

      // Query for tickers whose last_updated is BEFORE the threshold
      const snap = await db
        .collection(TICKERS_COLLECTION)
        .where('last_updated', '<', thresholdTimestamp)
        .get();

      // Also include tickers that have never been updated (field missing)
      const allSnap = await db.collection(TICKERS_COLLECTION).get();
      const staleTickers = new Set<string>();

      // Add tickers that matched the "older than threshold" query
      for (const doc of snap.docs) {
        staleTickers.add(doc.id);
      }

      // Add tickers that have no `last_updated` field at all
      for (const doc of allSnap.docs) {
        const data = doc.data();
        if (!data.last_updated) {
          staleTickers.add(doc.id);
        }
      }

      const result = Array.from(staleTickers);
      logger.info(
        `[Firestore] Found ${result.length} stale tickers ` +
        `(threshold: ${thresholdMinutes} min)`,
      );
      return result;
    } catch (error) {
      logger.error(
        `[Firestore] Error querying stale tickers: ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  // ==========================================================================
  // REPORTS
  // ==========================================================================

  /**
   * Persists a new report document in Firestore.
   *
   * @param report — The report data **without** a `report_id` (auto-generated).
   * @returns The auto-generated Firestore document ID / `report_id`.
   */
  public async createReport(
    report: Omit<ReportDocument, 'report_id'>,
  ): Promise<string> {
    try {
      const payload: Record<string, unknown> = {
        ...report,
        generated_at: FieldValue.serverTimestamp(),
      };

      const docRef = await db.collection(REPORTS_COLLECTION).add(payload);

      // Also write the report_id back into the document for self-referencing
      await docRef.update({ report_id: docRef.id });

      logger.info(
        `[Firestore] Created report "${docRef.id}" for ` +
        `ticker="${report.ticker_symbol}"`,
      );
      return docRef.id;
    } catch (error) {
      logger.error(
        `[Firestore] Error creating report: ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * Retrieves a single report by its ID.
   *
   * @param reportId — The Firestore document ID.
   * @returns The `ReportDocument`, or `null` if not found.
   */
  public async getReport(reportId: string): Promise<ReportDocument | null> {
    try {
      const snap = await db.collection(REPORTS_COLLECTION).doc(reportId).get();

      if (!snap.exists) {
        logger.debug(`[Firestore] Report "${reportId}" not found`);
        return null;
      }

      return { ...(snap.data() as ReportDocument), report_id: snap.id };
    } catch (error) {
      logger.error(
        `[Firestore] Error reading report "${reportId}": ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * Returns all reports requested by a specific user, ordered by most recent
   * first.
   *
   * @param uid — Firebase Auth UID.
   */
  public async getReportsByUser(uid: string): Promise<ReportDocument[]> {
    try {
      const snap = await db
        .collection(REPORTS_COLLECTION)
        .where('requested_by', '==', uid)
        .get();

      const reports: ReportDocument[] = snap.docs.map((doc) => ({
        ...(doc.data() as ReportDocument),
        report_id: doc.id,
      }));

      // Sort in-memory by generated_at descending to bypass composite index requirement
      reports.sort((a, b) => {
        const timeA = a.generated_at?.toMillis?.() || 0;
        const timeB = b.generated_at?.toMillis?.() || 0;
        return timeB - timeA;
      });

      logger.info(
        `[Firestore] Fetched ${reports.length} reports for user "${uid}"`,
      );
      return reports;
    } catch (error) {
      logger.error(
        `[Firestore] Error fetching reports for user "${uid}": ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * Returns all reports generated for a specific ticker, ordered by most
   * recent first.
   *
   * @param ticker — Stock symbol.
   */
  public async getReportsByTicker(ticker: string): Promise<ReportDocument[]> {
    const id = ticker.trim().toUpperCase();

    try {
      const snap = await db
        .collection(REPORTS_COLLECTION)
        .where('ticker_symbol', '==', id)
        .get();

      const reports: ReportDocument[] = snap.docs.map((doc) => ({
        ...(doc.data() as ReportDocument),
        report_id: doc.id,
      }));

      // Sort in-memory by generated_at descending to bypass composite index requirement
      reports.sort((a, b) => {
        const timeA = a.generated_at?.toMillis?.() || 0;
        const timeB = b.generated_at?.toMillis?.() || 0;
        return timeB - timeA;
      });

      logger.info(
        `[Firestore] Fetched ${reports.length} reports for ticker "${id}"`,
      );
      return reports;
    } catch (error) {
      logger.error(
        `[Firestore] Error fetching reports for ticker "${id}": ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  // ==========================================================================
  // USERS — Watchlist Management
  // ==========================================================================

  /**
   * Retrieves the current watchlist (array of ticker symbols) for a user.
   *
   * @param uid — Firebase Auth UID.
   * @returns An array of ticker strings, or an empty array if the user
   *          document does not exist yet.
   */
  public async getUserWatchlist(uid: string): Promise<string[]> {
    try {
      const snap = await db.collection(USERS_COLLECTION).doc(uid).get();

      if (!snap.exists) {
        logger.debug(`[Firestore] User "${uid}" not found, returning empty watchlist`);
        return [];
      }

      const data = snap.data();
      const watchlist: string[] = Array.isArray(data?.watchlist)
        ? data!.watchlist
        : [];

      logger.debug(
        `[Firestore] User "${uid}" watchlist has ${watchlist.length} tickers`,
      );
      return watchlist;
    } catch (error) {
      logger.error(
        `[Firestore] Error reading watchlist for user "${uid}": ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * Adds a ticker to a user's watchlist (idempotent — Firestore's
   * `arrayUnion` prevents duplicates).
   *
   * @param uid    — Firebase Auth UID.
   * @param ticker — Stock symbol to add.
   */
  public async addToUserWatchlist(uid: string, ticker: string): Promise<void> {
    const normalised = ticker.trim().toUpperCase();

    try {
      await db
        .collection(USERS_COLLECTION)
        .doc(uid)
        .set(
          { watchlist: FieldValue.arrayUnion(normalised) },
          { merge: true },
        );

      // Ensure the ticker also exists in the tickers collection so the
      // ingestion engine picks it up on its next sweep.
      const tickerSnap = await db
        .collection(TICKERS_COLLECTION)
        .doc(normalised)
        .get();

      if (!tickerSnap.exists) {
        await db.collection(TICKERS_COLLECTION).doc(normalised).set(
          {
            ticker_symbol: normalised,
            current_sentiment_score: 50, // Neutral default
            recent_news: [],
            status: 'pending',
          },
          { merge: true },
        );
        logger.info(
          `[Firestore] Created new ticker document for "${normalised}"`,
        );
      }

      logger.info(
        `[Firestore] Added "${normalised}" to watchlist for user "${uid}"`,
      );
    } catch (error) {
      logger.error(
        `[Firestore] Error adding to watchlist: ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * Removes a ticker from a user's watchlist.
   *
   * @param uid    — Firebase Auth UID.
   * @param ticker — Stock symbol to remove.
   */
  public async removeFromUserWatchlist(
    uid: string,
    ticker: string,
  ): Promise<void> {
    const normalised = ticker.trim().toUpperCase();

    try {
      await db
        .collection(USERS_COLLECTION)
        .doc(uid)
        .update({
          watchlist: FieldValue.arrayRemove(normalised),
        });

      logger.info(
        `[Firestore] Removed "${normalised}" from watchlist for user "${uid}"`,
      );
    } catch (error) {
      logger.error(
        `[Firestore] Error removing from watchlist: ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  // ==========================================================================
  // SYSTEM STATUS
  // ==========================================================================

  /**
   * Writes the current system status to the singleton `system/status`
   * document. Used by the error manager and health-check endpoints.
   *
   * @param status — Arbitrary key/value pairs describing the system state.
   */
  public async updateSystemStatus(status: object): Promise<void> {
    try {
      await db
        .collection(SYSTEM_COLLECTION)
        .doc(STATUS_DOC)
        .set(
          {
            ...status,
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

      logger.info('[Firestore] System status updated');
    } catch (error) {
      logger.error(
        `[Firestore] Error updating system status: ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  /**
   * Reads the current system status from Firestore.
   *
   * @returns The status object, or a default `{ status: 'unknown' }` if the
   *          document does not exist.
   */
  public async getSystemStatus(): Promise<object> {
    try {
      const snap = await db
        .collection(SYSTEM_COLLECTION)
        .doc(STATUS_DOC)
        .get();

      if (!snap.exists) {
        return { status: 'unknown' };
      }

      return snap.data() || { status: 'unknown' };
    } catch (error) {
      logger.error(
        `[Firestore] Error reading system status: ` +
        `${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  // ==========================================================================
  // CHAT HISTORY
  // ==========================================================================

  /**
   * Saves a chat message to the user's chat subcollection.
   */
  public async saveChatMessage(
    uid: string,
    text: string,
    sender: 'user' | 'ai',
    tickerSymbol?: string
  ): Promise<void> {
    try {
      const chatRef = db.collection(USERS_COLLECTION).doc(uid).collection('chats');
      await chatRef.add({
        text,
        sender,
        timestamp: FieldValue.serverTimestamp(),
        tickerSymbol: tickerSymbol || null,
      });
      logger.info(`[Firestore] Saved chat message for user "${uid}" (${sender})`);
    } catch (error) {
      logger.error(
        `[Firestore] Error saving chat message for user "${uid}": ` +
        `${error instanceof Error ? error.message : error}`
      );
      throw error;
    }
  }

  /**
   * Retrieves the user's chat history.
   */
  public async getUserChatHistory(uid: string, limitCount: number = 30): Promise<ChatMessage[]> {
    try {
      const snap = await db
        .collection(USERS_COLLECTION)
        .doc(uid)
        .collection('chats')
        .orderBy('timestamp', 'asc')
        .limit(limitCount)
        .get();

      const messages: ChatMessage[] = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          text: String(data.text || ''),
          sender: data.sender as 'user' | 'ai',
          timestamp: data.timestamp || new Date(),
          tickerSymbol: data.tickerSymbol || undefined,
        };
      });

      logger.debug(`[Firestore] Fetched ${messages.length} chat messages for user "${uid}"`);
      return messages;
    } catch (error) {
      logger.error(
        `[Firestore] Error reading chat history for user "${uid}": ` +
        `${error instanceof Error ? error.message : error}`
      );
      throw error;
    }
  }

  /**
   * Deletes all chat history for a user.
   */
  public async clearUserChatHistory(uid: string): Promise<void> {
    try {
      const chatRef = db.collection(USERS_COLLECTION).doc(uid).collection('chats');
      const snap = await chatRef.get();
      
      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      
      logger.info(`[Firestore] Cleared chat history for user "${uid}"`);
    } catch (error) {
      logger.error(
        `[Firestore] Error clearing chat history for user "${uid}": ` +
        `${error instanceof Error ? error.message : error}`
      );
      throw error;
    }
  }

  // ==========================================================================
  // MARKET DETAILS HISTORY
  // ==========================================================================

  /**
   * Saves a combined market price and news detail summary into the history collection.
   */
  public async saveMarketDetailHistory(data: Omit<MarketDetailHistoryDocument, 'id'>): Promise<string> {
    try {
      const payload: Record<string, unknown> = {
        ...data,
        timestamp: data.timestamp instanceof Date ? Timestamp.fromDate(data.timestamp) : data.timestamp,
      };

      const docRef = await db.collection(MARKET_DETAILS_HISTORY_COLLECTION).add(payload);
      logger.info(`[Firestore] Saved market detail history for "${data.ticker_symbol}" doc="${docRef.id}"`);
      return docRef.id;
    } catch (error) {
      logger.error(
        `[Firestore] Error saving market detail history: ` +
        `${error instanceof Error ? error.message : error}`
      );
      throw error;
    }
  }

  /**
   * Retrieves the most recent market details history for a given ticker.
   */
  public async getRecentMarketDetailsHistory(
    ticker: string,
    limitCount: number = 5
  ): Promise<MarketDetailHistoryDocument[]> {
    const id = ticker.trim().toUpperCase();
    try {
      const snap = await db
        .collection(MARKET_DETAILS_HISTORY_COLLECTION)
        .where('ticker_symbol', '==', id)
        .orderBy('timestamp', 'desc')
        .limit(limitCount)
        .get();

      const details: MarketDetailHistoryDocument[] = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ticker_symbol: String(data.ticker_symbol || id),
          timestamp: data.timestamp || new Date(),
          summary: String(data.summary || ''),
          source: String(data.source || 'unknown'),
        };
      });

      logger.debug(`[Firestore] Fetched ${details.length} historical details for ticker "${id}"`);
      return details;
    } catch (error) {
      logger.error(
        `[Firestore] Error fetching recent market details for ticker "${id}": ` +
        `${error instanceof Error ? error.message : error}`
      );
      throw error;
    }
  }

  /**
   * Deletes all historical market detail records for a given ticker.
   */
  public async deleteMarketDetailsHistoryByTicker(ticker: string): Promise<void> {
    const id = ticker.trim().toUpperCase();
    try {
      const snap = await db
        .collection(MARKET_DETAILS_HISTORY_COLLECTION)
        .where('ticker_symbol', '==', id)
        .get();

      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();

      logger.info(`[Firestore] Deleted ${snap.size} historical market detail documents for "${id}"`);
    } catch (error) {
      logger.error(
        `[Firestore] Error deleting market details history for ticker "${id}": ` +
        `${error instanceof Error ? error.message : error}`
      );
      throw error;
    }
  }
}


// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

/** Pre-instantiated FirestoreService singleton. Import this directly. */
const firestoreService = FirestoreService.getInstance();
export default firestoreService;
export { FirestoreService };
