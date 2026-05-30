/**
 * ============================================================================
 * AlphaStream AI — Pinecone Vector Database Service
 * ============================================================================
 *
 * Manages all interactions with the Pinecone serverless vector index used for
 * Retrieval-Augmented Generation (RAG). The index stores 384-d embeddings
 * (from `sentence-transformers/all-MiniLM-L6-v2`) alongside metadata that
 * ties each vector back to a specific stock ticker and time window.
 *
 * Key design decisions:
 *
 * - **Lazy initialisation** — The Pinecone client and index handle are not
 *   created until the first database operation is attempted. This prevents
 *   startup failures if the Pinecone API key is not yet configured.
 *
 * - **Circuit breaker** — All write/read operations flow through a single
 *   breaker to prevent thundering-herd retries when Pinecone is down.
 *
 * - **Retry with backoff** — Upsert and query operations are wrapped in
 *   exponential-backoff retry to survive transient network issues.
 *
 * @module services/pinecone
 */

import { Pinecone, Index } from '@pinecone-database/pinecone';
import { env } from '../config/env';
import { retryWithBackoff } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

/**
 * Metadata attached to every vector stored in Pinecone.
 * Used for filtered queries (e.g. "all vectors for TSLA").
 */
export interface VectorMetadata {
  /** Stock ticker symbol (e.g. "AAPL") */
  ticker: string;
  /** ISO-8601 timestamp of when the underlying data was scraped */
  timestamp: string;
  /** Origin of the data ("serp", "reddit", etc.) */
  source: string;
  /** AI-generated summary stored alongside the vector */
  summary: string;
  /** Optional user ID for personalized memory search */
  userId?: string;
}

/**
 * A single result from a cosine-similarity search.
 */
export interface SearchResult {
  /** The vector ID (usually `${ticker}-${timestamp}-${hash}`) */
  id: string;
  /** Cosine similarity score (0.0–1.0) */
  score: number;
  /** The metadata that was stored with this vector */
  metadata: VectorMetadata;
}

// ---------------------------------------------------------------------------
// PineconeService
// ---------------------------------------------------------------------------

/**
 * Singleton service wrapping the Pinecone SDK.
 * Access via the default export `pineconeService`.
 */
class PineconeService {
  private static instance: PineconeService;

  /** Lazily initialised Pinecone SDK client */
  private client: Pinecone | null = null;

  /** Lazily resolved index handle */
  private indexHandle: Index | null = null;

  /** Circuit breaker protecting all Pinecone operations */
  private pineconeBreaker: CircuitBreaker;

  private constructor() {
    this.pineconeBreaker = new CircuitBreaker('Pinecone', {
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
    });

    logger.info('[PineconeService] Initialized (lazy — client created on first use)');
  }

  /** Returns the singleton instance, creating it lazily. */
  public static getInstance(): PineconeService {
    if (!PineconeService.instance) {
      PineconeService.instance = new PineconeService();
    }
    return PineconeService.instance;
  }

  // --------------------------------------------------------------------------
  // Private — Lazy Index Accessor
  // --------------------------------------------------------------------------

  /**
   * Returns the Pinecone index handle, creating the client and resolving
   * the index on first call.
   *
   * @throws If the `PINECONE_API_KEY` or `PINECONE_INDEX_NAME` env vars are
   *         missing or the index cannot be reached.
   */
  private getIndex(): Index {
    if (this.indexHandle) {
      return this.indexHandle;
    }

    // ---- Validate required env vars ----
    if (!env.PINECONE_API_KEY) {
      throw new Error(
        '[PineconeService] PINECONE_API_KEY is not set. Cannot initialise client.',
      );
    }

    const indexName = env.PINECONE_INDEX_NAME || 'alphastream-vectors';

    // ---- Create the client ----
    this.client = new Pinecone({
      apiKey: env.PINECONE_API_KEY,
    });

    // ---- Resolve the index ----
    this.indexHandle = this.client.index(indexName);

    logger.info(
      `[PineconeService] Connected to index "${indexName}"`,
    );

    return this.indexHandle;
  }

  // --------------------------------------------------------------------------
  // Public — Upsert
  // --------------------------------------------------------------------------

  /**
   * Upserts a single vector (with metadata) into the Pinecone index.
   *
   * @param id       — Unique vector identifier (e.g. `AAPL-2026-05-24T12:00:00Z`).
   * @param values   — The embedding array (384-d float vector).
   * @param metadata — Structured metadata to store alongside the vector.
   */
  public async upsertVector(
    id: string,
    values: number[],
    metadata: VectorMetadata,
  ): Promise<void> {
    return this.pineconeBreaker.execute<void>(async () => {
      return retryWithBackoff<void>(
        async () => {
          const index = this.getIndex();

          logger.info(
            `[Pinecone] Upserting vector id="${id}" ` +
            `(${values.length}-d, ticker=${metadata.ticker})`,
          );

          await index.upsert([
            {
              id,
              values,
              metadata: metadata as unknown as Record<string, string>,
            },
          ]);

          logger.info(`[Pinecone] Upserted vector id="${id}" successfully`);
        },
        {
          maxRetries: 3,
          baseDelayMs: 1_000,
  
        },
      );
    });
  }

  // --------------------------------------------------------------------------
  // Public — Query
  // --------------------------------------------------------------------------

  /**
   * Performs a cosine-similarity search against the Pinecone index, filtered
   * to vectors that belong to a specific stock ticker.
   *
   * @param queryVector — The 384-d query embedding.
   * @param ticker      — Stock ticker to filter by.
   * @param topK        — Number of results to return (default 5).
   * @returns An array of `SearchResult` objects sorted by descending score.
   */
  public async queryByTicker(
    queryVector: number[],
    ticker: string,
    topK: number = 5,
  ): Promise<SearchResult[]> {
    return this.pineconeBreaker.execute<SearchResult[]>(async () => {
      return retryWithBackoff<SearchResult[]>(
        async () => {
          const index = this.getIndex();
          const sanitizedTicker = ticker.trim().toUpperCase();

          logger.info(
            `[Pinecone] Querying top ${topK} vectors for ticker="${sanitizedTicker}"`,
          );

          const queryResponse = await index.query({
            vector: queryVector,
            topK,
            includeMetadata: true,
            filter: {
              ticker: { $eq: sanitizedTicker },
            },
          });

          // ---- Map matches to our SearchResult type ----
          const results: SearchResult[] = (queryResponse.matches || []).map(
            (match) => ({
              id: match.id,
              score: match.score ?? 0,
              metadata: {
                ticker: String((match.metadata as any)?.ticker || sanitizedTicker),
                timestamp: String((match.metadata as any)?.timestamp || ''),
                source: String((match.metadata as any)?.source || 'unknown'),
                summary: String((match.metadata as any)?.summary || ''),
              },
            }),
          );

          logger.info(
            `[Pinecone] Found ${results.length} results for ticker="${sanitizedTicker}" ` +
            `(best score: ${results[0]?.score?.toFixed(4) ?? 'N/A'})`,
          );

          return results;
        },
        {
          maxRetries: 3,
          baseDelayMs: 1_000,
  
        },
      );
    });
  }

  /**
   * Performs a cosine-similarity search against user's past chats for personalized memory.
   */
  public async queryUserChats(
    queryVector: number[],
    userId: string,
    topK: number = 3
  ): Promise<SearchResult[]> {
    return this.pineconeBreaker.execute<SearchResult[]>(async () => {
      return retryWithBackoff<SearchResult[]>(
        async () => {
          const index = this.getIndex();

          logger.info(
            `[Pinecone] Querying top ${topK} user chat vectors for userId="${userId}"`
          );

          const queryResponse = await index.query({
            vector: queryVector,
            topK,
            includeMetadata: true,
            filter: {
              userId: { $eq: userId },
              source: { $eq: 'chat' }
            },
          });

          const results: SearchResult[] = (queryResponse.matches || []).map(
            (match) => ({
              id: match.id,
              score: match.score ?? 0,
              metadata: {
                ticker: String((match.metadata as any)?.ticker || ''),
                timestamp: String((match.metadata as any)?.timestamp || ''),
                source: String((match.metadata as any)?.source || 'chat'),
                summary: String((match.metadata as any)?.summary || ''),
                userId: String((match.metadata as any)?.userId || userId),
              },
            })
          );

          logger.info(
            `[Pinecone] Found ${results.length} chat results for userId="${userId}"`
          );

          return results;
        },
        {
          maxRetries: 3,
          baseDelayMs: 1_000,
        }
      );
    });
  }

  // --------------------------------------------------------------------------
  // Public — Delete
  // --------------------------------------------------------------------------

  /**
   * Deletes **all** vectors associated with a given ticker from the index.
   * This is used when a ticker is removed from every user's watchlist, or
   * during data cleanup / re-ingestion.
   *
   * @param ticker — The stock ticker whose vectors should be purged.
   */
  public async deleteByTicker(ticker: string): Promise<void> {
    return this.pineconeBreaker.execute<void>(async () => {
      return retryWithBackoff<void>(
        async () => {
          const index = this.getIndex();
          const sanitizedTicker = ticker.trim().toUpperCase();

          logger.info(
            `[Pinecone] Deleting all vectors for ticker="${sanitizedTicker}"`,
          );

          // Pinecone's `deleteMany` accepts a metadata filter to bulk-delete
          // all vectors matching the filter criteria.
          await index.deleteMany({
            ticker: { $eq: sanitizedTicker },
          });

          logger.info(
            `[Pinecone] Deleted vectors for ticker="${sanitizedTicker}"`,
          );
        },
        {
          maxRetries: 2,
          baseDelayMs: 1_000,
  
        },
      );
    });
  }

  // --------------------------------------------------------------------------
  // Health / Observability
  // --------------------------------------------------------------------------

  /**
   * Returns the circuit breaker state. Useful for `/health` endpoints.
   */
  public getServiceStatus(): string {
    return this.pineconeBreaker.getState();
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

/** Pre-instantiated PineconeService singleton. Import this directly. */
const pineconeService = PineconeService.getInstance();
export default pineconeService;
export { PineconeService };
