/**
 * =============================================================================
 * AlphaTrade AI — Frontend API Service
 * =============================================================================
 *
 * Typed API client that connects the Next.js frontend to the Express backend.
 * Replaces MockDataService with real HTTP calls to our REST API.
 *
 * Key design decisions:
 *  - All methods are static so consumers can call `ApiService.getTickers()`
 *    without managing instances or singletons.
 *  - Every outgoing request is automatically authenticated by attaching the
 *    current Firebase user's ID‑token as a Bearer token.
 *  - A custom `ApiError` class preserves HTTP status codes and optional
 *    application-level error codes so callers can react granularly
 *    (e.g. show "unauthorized" vs "not found" UI).
 *  - Base URL is read once from `NEXT_PUBLIC_BACKEND_URL` — this keeps the
 *    service environment-agnostic (local dev, staging, production).
 * =============================================================================
 */

import { auth } from '@/lib/firebase';

// =============================================================================
// Response Types — mirrors the backend API contract
// =============================================================================

/** Shape returned by `GET /api/health` */
export interface HealthResponse {
  /** Current health status of the backend (e.g. "ok", "degraded") */
  status: string;
  /** ISO-8601 timestamp of when the health check was performed */
  timestamp: string;
  /** Semver version string of the running backend */
  version: string;
  /** Uptime of the backend process in seconds */
  uptime: number;
  /** Optional sub-service health details (database, cache, etc.) */
  services?: Record<string, { status: string; latency?: number }>;
}

/**
 * Represents a single tracked ticker/stock symbol and its associated data.
 * Returned by both the list endpoint and the single-ticker endpoint.
 */
export interface TickerData {
  /** Uppercase stock symbol, e.g. "AAPL" */
  symbol: string;
  /** Human-readable company name, e.g. "Apple Inc." */
  name: string;
  /** Latest known share price in USD */
  price: number;
  /** Percentage change since previous close */
  change: number;
  /** AI-computed sentiment score from 0 (extreme bearish) to 100 (extreme bullish) */
  sentiment: number;
  /** Human-readable sentiment bucket */
  sentimentLabel: 'Bullish' | 'Neutral' | 'Bearish';
  /** ISO-8601 timestamp of the most recent data refresh */
  lastUpdated?: string;
  /** Optional array of recent news items for this ticker */
  recentNews?: Array<{
    title: string;
    url: string;
    ai_summary: string;
    source: string;
  }>;
}

/**
 * Represents a full AI-generated investment report for a ticker.
 * Returned by both the single-report and user-reports endpoints.
 */
export interface ReportData {
  /** Unique report identifier (UUID or Firestore document ID) */
  reportId: string;
  /** The ticker symbol this report was generated for */
  tickerSymbol: string;
  /** ISO-8601 timestamp of when the report was generated */
  generatedAt: string;
  /** UID of the user who requested the report */
  requestedBy: string;
  /** Current generation status */
  status: 'pending' | 'generating' | 'completed' | 'failed';
  /** Structured report body — only present when status is "completed" */
  content?: {
    /** Key competitive strengths identified by the AI */
    strengths: string[];
    /** Weaknesses and risk factors */
    weaknesses: string[];
    /** Upcoming catalysts (earnings, product launches, macro events) */
    catalysts: string[];
    /** One-paragraph overall investment thesis */
    overall_thesis: string;
    /** Suggested trade decision */
    suggested_trade?: string;
    /** Valuation and catalysts trade reasoning rationale */
    trade_reasoning?: string;
  };
  /** Human-readable error message when status is "failed" */
  errorMessage?: string;
}

// =============================================================================
// Custom Error Class
// =============================================================================

/**
 * Structured error thrown by every `ApiService` method when the backend
 * returns a non-2xx response.
 *
 * Consumers can branch on `statusCode` for HTTP-level handling (401 → redirect
 * to login) or on `code` for application-level handling ("RATE_LIMITED" →
 * show throttle banner).
 */
export class ApiError extends Error {
  /** HTTP status code returned by the backend (e.g. 401, 404, 500) */
  public readonly statusCode: number;

  /**
   * Optional machine-readable error code from the backend's JSON body.
   * Examples: "UNAUTHORIZED", "NOT_FOUND", "RATE_LIMITED", "INTERNAL_ERROR".
   */
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string = 'UNKNOWN_ERROR') {
    super(message);

    // Preserve the correct prototype chain so `instanceof ApiError` works
    // even after transpilation to ES5 targets.
    Object.setPrototypeOf(this, ApiError.prototype);

    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// =============================================================================
// API Service
// =============================================================================

/**
 * Static API client — every public method maps 1:1 to a backend REST endpoint.
 *
 * Usage:
 * ```ts
 * const tickers = await ApiService.getTickers();
 * const report  = await ApiService.getReport('abc-123');
 * ```
 */
export class ApiService {
  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the backend base URL from the environment.
   *
   * Falls back to `http://localhost:5000` during local development so the
   * service works even if the env var is not explicitly set.  A trailing
   * slash is always stripped to prevent double-slash issues when
   * concatenating with endpoint paths.
   */
  private static getBaseUrl(): string {
    const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!envUrl) {
      return '';
    }

    // Strip trailing slash to normalise URLs
    return envUrl.replace(/\/+$/, '');
  }

  /**
   * Retrieve the current Firebase user's ID token.
   *
   * Returns `null` if no user is signed in — callers should gracefully
   * handle this (e.g. the health endpoint doesn't need auth, but most
   * others do).
   *
   * The `getIdToken()` call automatically handles token refresh when the
   * existing token is close to expiry, so we never cache the token
   * ourselves.
   */
  private static async getAuthToken(): Promise<string | null> {
    try {
      if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && localStorage.getItem('alphatrade_mock_auth') === 'true') {
        return 'dev-token';
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {
        // No user signed in — return null so the request can still proceed
        // for public endpoints (health, tickers list).
        return null;
      }

      // `true` forces a refresh only if the cached token is expired;
      // Firebase SDKs handle the caching logic internally.
      const token = await currentUser.getIdToken(/* forceRefresh */ false);
      return token;
    } catch (error) {
      // Token retrieval can fail if the account was disabled server-side
      // or the refresh token was revoked.  Log and return null so the
      // caller decides whether to throw or proceed unauthenticated.
      console.error('[ApiService] Failed to retrieve auth token:', error);
      return null;
    }
  }

  /**
   * Core HTTP request helper used by every public method.
   *
   * Responsibilities:
   *  1. Prefix the endpoint with the backend base URL.
   *  2. Attach the Firebase Auth token as a Bearer header (if available).
   *  3. Set `Content-Type: application/json` for JSON payloads.
   *  4. Throw an `ApiError` for any non-2xx response.
   *  5. Parse and return the JSON body typed as `T`.
   *
   * @param endpoint - Path relative to the API root, e.g. "/api/tickers".
   * @param options  - Standard `RequestInit` overrides (method, body, etc.).
   * @returns Parsed JSON body typed as `T`.
   * @throws {ApiError} when the HTTP status is not in the 2xx range.
   */
  private static async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();

    // Ensure the endpoint starts with a forward-slash
    const normalisedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${normalisedEndpoint}`;

    // ----- Build headers -----
    const headers = new Headers(options.headers as HeadersInit | undefined);

    // Always declare JSON content-type unless the caller explicitly overrides
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    // Attach auth token if available
    const token = await this.getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // ----- Execute fetch -----
    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkError) {
      // Network-level failures (DNS, CORS, offline, etc.) do not produce
      // an HTTP response — wrap them in an ApiError with status 0.
      throw new ApiError(
        `Network error while contacting the backend: ${(networkError as Error).message}`,
        0,
        'NETWORK_ERROR',
      );
    }

    // ----- Handle non-2xx responses -----
    if (!response.ok) {
      // Attempt to extract a structured error body from the backend.
      // The backend convention is:
      //   { "error": { "message": "…", "code": "SOME_CODE" } }
      // but we also handle flat { "message": "…" } shapes.
      let errorMessage = `Request failed with status ${response.status}`;
      let errorCode = 'UNKNOWN_ERROR';

      try {
        const errorBody = await response.json();

        if (errorBody?.error?.message) {
          errorMessage = errorBody.error.message;
          errorCode = errorBody.error.code ?? errorCode;
        } else if (errorBody?.message) {
          errorMessage = errorBody.message;
          errorCode = errorBody.code ?? errorCode;
        }
      } catch {
        // Body wasn't valid JSON — fall through with the generic message.
      }

      throw new ApiError(errorMessage, response.status, errorCode);
    }

    // ----- Handle 204 No Content (e.g. DELETE / PUT with no body) -----
    if (response.status === 204) {
      // Return an empty object cast to T.  This is safe because the only
      // callers that receive a 204 have `Promise<void>` return types.
      return {} as T;
    }

    // ----- Parse successful JSON response -----
    const data: any = await response.json();
    
    // Auto-unwrap envelope if present and data property exists
    if (data && typeof data === 'object' && 'data' in data) {
      return data.data as T;
    }
    return data as T;
  }

  /**
   * Helper to map raw backend ticker JSON (TickerDocument) to TickerData.
   */
  private static mapTickerData(raw: any): TickerData {
    const symbol = (raw.ticker_symbol || raw.symbol || '').toUpperCase();
    
    // Find the default/mock ticker for initial values (price, change, name)
    const defaults = {
      AAPL: { name: 'Appie', price: 799.90, change: -11.30 },
      NVDA: { name: 'Nvidia', price: 323.75, change: 85.50 },
      MSFT: { name: 'Microsoft', price: 125.30, change: 13.30 },
      TSLA: { name: 'Tesla', price: 29.40, change: -4.78 },
      AMZN: { name: 'Amazon', price: 185.20, change: 5.40 },
      GOOGL: { name: 'Google', price: 165.30, change: 2.10 },
      META: { name: 'Meta', price: 485.90, change: -3.20 },
      NFLX: { name: 'Netflix', price: 685.40, change: 12.80 },
    } as Record<string, { name: string; price: number; change: number }>;

    const tickerDefaults = defaults[symbol] || {
      name: symbol,
      price: 150.00,
      change: 0.00
    };

    const sentiment = typeof raw.current_sentiment_score === 'number'
      ? raw.current_sentiment_score
      : typeof raw.sentiment === 'number'
        ? raw.sentiment
        : 50;

    const sentimentLabel = sentiment >= 60 ? 'Bullish' : sentiment >= 40 ? 'Neutral' : 'Bearish';

    const recentNews = Array.isArray(raw.recent_news)
      ? raw.recent_news.map((item: any) => ({
          title: item.title || '',
          url: item.url || '',
          ai_summary: item.ai_summary || '',
          source: item.source || ''
        }))
      : undefined;

    let lastUpdated: string | undefined = undefined;
    if (raw.last_updated) {
      try {
        const val = raw.last_updated._seconds ? raw.last_updated._seconds * 1000 : raw.last_updated;
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          lastUpdated = d.toISOString();
        }
      } catch (e) {}
    }

    return {
      symbol,
      name: tickerDefaults.name,
      price: raw.price || tickerDefaults.price,
      change: raw.change || tickerDefaults.change,
      sentiment,
      sentimentLabel,
      lastUpdated,
      recentNews
    };
  }

  /**
   * Helper to map raw backend report JSON (ReportDocument) to ReportData.
   */
  private static mapReportData(raw: any): ReportData {
    let generatedAt = new Date().toISOString();
    if (raw.generated_at) {
      try {
        const val = raw.generated_at._seconds ? raw.generated_at._seconds * 1000 : raw.generated_at;
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          generatedAt = d.toISOString();
        }
      } catch (e) {}
    }

    return {
      reportId: raw.report_id || raw.reportId || '',
      tickerSymbol: (raw.ticker_symbol || raw.tickerSymbol || '').toUpperCase(),
      generatedAt,
      requestedBy: raw.requested_by || raw.requestedBy || '',
      status: raw.status || 'completed',
      content: raw.content ? {
        strengths: Array.isArray(raw.content.strengths) ? raw.content.strengths : [],
        weaknesses: Array.isArray(raw.content.weaknesses) ? raw.content.weaknesses : [],
        catalysts: Array.isArray(raw.content.catalysts) ? raw.content.catalysts : [],
        overall_thesis: raw.content.overall_thesis || '',
        suggested_trade: raw.content.suggested_trade || '',
        trade_reasoning: raw.content.trade_reasoning || '',
      } : undefined,
      errorMessage: raw.errorMessage || raw.error_message || undefined
    };
  }

  // ---------------------------------------------------------------------------
  // Public API methods — Health
  // ---------------------------------------------------------------------------

  /**
   * Check the backend health status.
   *
   * This is an unauthenticated endpoint so it works even before sign-in.
   *
   * **Endpoint:** `GET /api/health`
   */
  static async getHealthStatus(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/health');
  }

  // ---------------------------------------------------------------------------
  // Public API methods — Tickers
  // ---------------------------------------------------------------------------

  /**
   * Fetch the full list of tracked tickers with their latest data.
   *
   * **Endpoint:** `GET /api/tickers`
   */
  static async getTickers(): Promise<TickerData[]> {
    const rawList = await this.request<any[]>('/api/tickers');
    return (Array.isArray(rawList) ? rawList : []).map(item => this.mapTickerData(item));
  }

  /**
   * Fetch detailed data for a single ticker.
   *
   * @param symbol - Uppercase stock symbol (e.g. "AAPL").
   *
   * **Endpoint:** `GET /api/tickers/:symbol`
   */
  static async getTickerData(symbol: string): Promise<TickerData> {
    const encodedSymbol = encodeURIComponent(symbol.toUpperCase());
    const raw = await this.request<any>(`/api/tickers/${encodedSymbol}`);
    return this.mapTickerData(raw);
  }

  /**
   * Trigger a manual data refresh for a specific ticker.
   *
   * The backend will re-fetch market data, news, and re-compute sentiment.
   * This is an idempotent operation — calling it multiple times in quick
   * succession will simply queue or de-duplicate on the backend side.
   *
   * @param symbol - Uppercase stock symbol (e.g. "NVDA").
   *
   * **Endpoint:** `POST /api/tickers/:symbol/refresh`
   */
  static async refreshTicker(symbol: string): Promise<void> {
    const encodedSymbol = encodeURIComponent(symbol.toUpperCase());
    await this.request<void>(`/api/tickers/${encodedSymbol}/refresh`, {
      method: 'POST',
    });
  }

  // ---------------------------------------------------------------------------
  // Public API methods — Reports
  // ---------------------------------------------------------------------------

  /**
   * Request the AI to generate a new investment report for a ticker.
   *
   * Returns the new report's ID immediately — the actual generation
   * happens asynchronously on the backend.  Poll `getReport()` to check
   * for completion, or subscribe to Firestore doc changes.
   *
   * @param ticker - Uppercase stock symbol (e.g. "TSLA").
   *
   * **Endpoint:** `POST /api/reports/generate`
   */
  static async generateReport(ticker: string): Promise<{ reportId: string }> {
    return this.request<{ reportId: string }>('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ ticker: ticker.toUpperCase() }),
    });
  }

  /**
   * Fetch a single report by its ID.
   *
   * @param reportId - The unique report identifier returned by `generateReport()`.
   *
   * **Endpoint:** `GET /api/reports/:reportId`
   */
  static async getReport(reportId: string): Promise<ReportData> {
    const encodedId = encodeURIComponent(reportId);
    const raw = await this.request<any>(`/api/reports/${encodedId}`);
    return this.mapReportData(raw);
  }

  /**
   * Fetch all reports that belong to the currently authenticated user,
   * ordered by generation date (newest first).
   *
   * **Endpoint:** `GET /api/reports`
   */
  static async getUserReports(): Promise<ReportData[]> {
    const rawList = await this.request<any[]>('/api/reports');
    return (Array.isArray(rawList) ? rawList : []).map(item => this.mapReportData(item));
  }

  // ---------------------------------------------------------------------------
  // Public API methods — Watchlist
  // ---------------------------------------------------------------------------

  /**
   * Retrieve the authenticated user's watchlist as an array of ticker
   * symbols (e.g. `["AAPL", "NVDA", "MSFT"]`).
   *
   * **Endpoint:** `GET /api/watchlist`
   */
  static async getWatchlist(): Promise<string[]> {
    return this.request<string[]>('/api/watchlist');
  }

  /**
   * Add a ticker to the authenticated user's watchlist.
   *
   * Idempotent — adding an already-watched ticker is a no-op on the
   * backend and does not error.
   *
   * @param ticker - Uppercase stock symbol to add.
   *
   * **Endpoint:** `POST /api/watchlist`
   */
  static async addToWatchlist(ticker: string): Promise<void> {
    try {
      await this.request<void>('/api/watchlist', {
        method: 'POST',
        body: JSON.stringify({ ticker: ticker.toUpperCase() }),
      });
    } catch (error) {
      // 409 Conflict (Duplicate ticker) is safe to ignore in the frontend
      if (error instanceof ApiError && error.statusCode === 409) {
        return;
      }
      throw error;
    }
  }

  /**
   * Remove a ticker from the authenticated user's watchlist.
   *
   * Idempotent — removing a ticker that is not on the watchlist is a
   * no-op and does not error.
   *
   * @param ticker - Uppercase stock symbol to remove.
   *
   * **Endpoint:** `DELETE /api/watchlist/:ticker`
   */
  static async removeFromWatchlist(ticker: string): Promise<void> {
    const encodedTicker = encodeURIComponent(ticker.toUpperCase());
    await this.request<void>(`/api/watchlist/${encodedTicker}`, {
      method: 'DELETE',
    });
  }

  // ---------------------------------------------------------------------------
  // Public API methods — AI Chat
  // ---------------------------------------------------------------------------

  /**
   * Send a natural-language query to the AI market assistant.
   *
   * Optionally scope the conversation to a specific ticker for more
   * targeted analysis.
   *
   * @param query  - The user's free-form question (e.g. "What's driving NVDA's rally?").
   * @param ticker - Optional ticker symbol to scope the AI's context.
   * @returns An object containing the AI's response text and an array of
   *          source URLs/references it used.
   *
   * **Endpoint:** `POST /api/chat`
   */
  static async chatWithMarket(
    query: string,
    ticker?: string,
  ): Promise<{ response: string; sources: string[] }> {
    // Build the request body, only including `ticker` if provided
    const body: Record<string, string> = { query };
    if (ticker) {
      body.ticker = ticker.toUpperCase();
    }

    return this.request<{ response: string; sources: string[] }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Fetch the user's past chat history from Firestore.
   *
   * **Endpoint:** `GET /api/chat`
   */
  static async getChatHistory(): Promise<Array<{ sender: 'user' | 'ai'; text: string; timestamp?: string }>> {
    return this.request<Array<{ sender: 'user' | 'ai'; text: string; timestamp?: string }>>('/api/chat');
  }

  /**
   * Clear the user's entire chat history in Firestore.
   *
   * **Endpoint:** `DELETE /api/chat`
   */
  static async clearChatHistory(): Promise<void> {
    await this.request<void>('/api/chat', {
      method: 'DELETE'
    });
  }
}

// =============================================================================
// Default export for convenience — consumers can do either:
//   import { ApiService } from '@/services/apiService';
//   import ApiService from '@/services/apiService';
// =============================================================================
export default ApiService;
