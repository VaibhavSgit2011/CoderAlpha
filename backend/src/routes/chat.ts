// =============================================================================
// AlphaStream AI — Chat With Market Route
// =============================================================================
// Provides the conversational market intelligence interface:
//   POST /api/chat/ — Ask a question about the market and get an AI response
//
// This endpoint uses the RAG pipeline to:
//   1. Embed the user's natural language query
//   2. Search Pinecone for relevant market intelligence vectors
//   3. Generate a conversational response using a reasoning LLM
//
// Unlike reports, chat responses are ephemeral — they are NOT saved to
// Firestore. This makes chat fast and cheap to operate at scale.
// =============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateUser } from '../middleware/auth';
import { chatLimiter } from '../middleware/rateLimiter';
import { validate, chatQuerySchema } from '../middleware/validator';
import { ragPipeline } from '../pipelines/rag';
import { logger } from '../utils/logger';

// Create the Express router for this route module
const router = Router();

// =============================================================================
// POST / — Chat With Market
// =============================================================================

/**
 * Accepts a natural language question about the market and returns an
 * AI-generated response grounded in real-time scraped market data.
 *
 * The optional `ticker` field narrows the search to a specific stock.
 * If omitted, the system searches across all available market intelligence.
 *
 * Request body:
 *   {
 *     "query": "Why is NVDA stock dropping today?",
 *     "ticker": "NVDA"  // optional
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "response": "Based on recent market data, NVDA is experiencing...",
 *     "sources": ["Vector ticker-NVDA-123 (score: 0.89)", ...]
 *   }
 *
 * Rate limited to prevent LLM cost overrun (e.g., 10 req/min per user).
 */
router.post(
  '/',
  authenticateUser,
  chatLimiter,
  validate(chatQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query, ticker } = req.body;
      const uid = req.user?.uid;

      if (!uid) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Sanitize query: trim whitespace and enforce a reasonable length cap.
      // The validator schema should already handle basic validation, but
      // we do a final check here for defense-in-depth.
      const sanitizedQuery = query.trim();
      if (sanitizedQuery.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Empty query',
          message: 'Please provide a question to ask the market analyst.',
        });
        return;
      }

      // Cap query length to prevent prompt injection with extremely long inputs
      const MAX_QUERY_LENGTH = 1000;
      const truncatedQuery = sanitizedQuery.length > MAX_QUERY_LENGTH
        ? sanitizedQuery.slice(0, MAX_QUERY_LENGTH)
        : sanitizedQuery;

      const upperTicker = ticker?.toUpperCase().trim() || undefined;

      logger.info(
        `[Chat] Query from user ${uid}: "${truncatedQuery.slice(0, 60)}..."` +
        (upperTicker ? ` (ticker: ${upperTicker})` : '')
      );

      // ── Call the RAG pipeline for a conversational response ─────────
      const response = await ragPipeline.chatWithMarket(truncatedQuery, uid, upperTicker);

      // Build sources array from the response context.
      // Note: In the current implementation, sources are embedded in the
      // RAG pipeline's Pinecone query. For the chat endpoint, we provide
      // a simplified sources list. A future enhancement could return the
      // actual vector IDs and similarity scores.
      const sources: string[] = [];
      if (upperTicker) {
        sources.push(`Context filtered by: ${upperTicker}`);
      }
      sources.push(`AlphaStream AI Knowledge Base (${new Date().toISOString().split('T')[0]})`);

      logger.info(`[Chat] Response generated for user ${uid} (${response.length} chars)`);

      res.status(200).json({
        success: true,
        response,
        sources,
        metadata: {
          query: truncatedQuery,
          ticker: upperTicker ?? null,
          respondedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      // If the RAG pipeline throws, we catch it and provide a user-friendly error.
      // The global error handler will also log the full stack trace.
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`[Chat] Chat query failed: ${errorMessage}`);

      // For chat, we provide a graceful fallback message instead of a raw 500
      res.status(500).json({
        success: false,
        error: 'Chat unavailable',
        message: 'The market analyst is temporarily unavailable. Please try again in a moment.',
        response: 'I apologize, but I\'m unable to process your question right now due to a temporary system issue. Please try again shortly.',
        sources: [],
      });
    }
  }
);

// =============================================================================
// Export
// =============================================================================

export const chatRouter = router;
