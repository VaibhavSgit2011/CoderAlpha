/**
 * ============================================================================
 * AlphaStream AI — Hugging Face Inference API Service
 * ============================================================================
 *
 * Centralises all interactions with the Hugging Face Inference API. Three
 * distinct AI capabilities are exposed:
 *
 * 1. **Triage Sentiment** — Feeds scraped financial text into a large
 *    instruction-tuned LLM and extracts a JSON object with a numeric
 *    sentiment score (0–100) and a human-readable summary. Includes an
 *    automatic model-level fallback (Llama 3 → Mistral 7B) to survive
 *    cold starts and quota exhaustion.
 *
 * 2. **Generate Embedding** — Converts arbitrary text into a 384-d float
 *    vector using `sentence-transformers/all-MiniLM-L6-v2`. The resulting
 *    vector is upserted into Pinecone for later RAG retrieval.
 *
 * 3. **Generate Deep-Dive Report** — Invokes a heavy reasoning model
 *    (Llama 3 70B) with a structured system prompt to produce a
 *    professional due-diligence report broken into strengths, weaknesses,
 *    catalysts, and an overall thesis.
 *
 * Each model channel has its own circuit breaker so a single misbehaving
 * model cannot take down the entire AI layer.
 *
 * @module services/huggingface
 */

import { env } from '../config/env';
import { retryWithBackoff } from '../utils/retry';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

/** Result of the AI triage step — sentiment scoring + summary. */
export interface TriageResult {
  /** Numeric sentiment score on a 0–100 scale (0 = extremely bearish,
   *  100 = extremely bullish). */
  sentiment_score: number;
  /** One-to-three sentence AI-generated summary of the financial text. */
  summary: string;
  /** Identifier of the model that actually produced this result
   *  (useful for debugging fallback scenarios). */
  model_used: string;
}

/**
 * Structured content block for a due-diligence report.
 * Matches the `content` sub-document inside the Firestore `reports` collection.
 */
export interface ReportContent {
  /** Key strengths / bullish signals identified by the model. */
  strengths: string[];
  /** Key weaknesses / bearish signals identified by the model. */
  weaknesses: string[];
  /** Near-term catalysts that could move the stock price. */
  catalysts: string[];
  /** Overall investment thesis paragraph. */
  overall_thesis: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hugging Face Inference API base URL */
const HF_INFERENCE_BASE = 'https://api-inference.huggingface.co/models';

/** Primary triage model — instruction-following, free-tier compatible. */
const TRIAGE_PRIMARY_MODEL = 'meta-llama/Meta-Llama-3-8B-Instruct';

/** Fallback triage model — smaller and higher availability. */
const TRIAGE_FALLBACK_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';

/** Sentence-transformer model for generating 384-d embeddings. */
const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

/** Heavy reasoning model for deep-dive report generation. */
const REASONING_MODEL = 'meta-llama/Meta-Llama-3-70B-Instruct';

/** Request timeout for HF API calls (ms). */
const REQUEST_TIMEOUT_MS = 60_000;

/** Maximum number of characters we send as input to any model.
 *  Prevents blowing up context windows on free-tier endpoints. */
const MAX_INPUT_CHARS = 30_000;

// ---------------------------------------------------------------------------
// HuggingFaceService
// ---------------------------------------------------------------------------

/**
 * Singleton service wrapping the Hugging Face Inference API.
 * Access via the default export `huggingFaceService`.
 */
class HuggingFaceService {
  private static instance: HuggingFaceService;

  /** Breaker for the triage (sentiment) model channel. */
  private triageBreaker: CircuitBreaker;

  /** Breaker for the reasoning (deep-dive) model channel. */
  private reasoningBreaker: CircuitBreaker;

  /** Breaker for the embedding model channel. */
  private embeddingBreaker: CircuitBreaker;

  private constructor() {
    this.triageBreaker = new CircuitBreaker('HF-Triage', {
      failureThreshold: 5,
      resetTimeoutMs: 90_000,
    });

    this.reasoningBreaker = new CircuitBreaker('HF-Reasoning', {
      failureThreshold: 3,
      resetTimeoutMs: 120_000,
    });

    this.embeddingBreaker = new CircuitBreaker('HF-Embedding', {
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
    });

    logger.info('[HuggingFaceService] Initialized with circuit breakers');
  }

  /** Returns the singleton instance, creating it lazily. */
  public static getInstance(): HuggingFaceService {
    if (!HuggingFaceService.instance) {
      HuggingFaceService.instance = new HuggingFaceService();
    }
    return HuggingFaceService.instance;
  }

  // --------------------------------------------------------------------------
  // Private — Generic HF Inference Call
  // --------------------------------------------------------------------------

  /**
   * Low-level helper that POSTs to a Hugging Face model endpoint.
   *
   * @param model  — Full model identifier (e.g. "meta-llama/…").
   * @param inputs — The text payload to send to the model.
   * @param parameters — Optional generation / inference parameters.
   * @returns The raw JSON-parsed response body from Hugging Face.
   *
   * Retry logic handles **503 "Model is loading"** cold-start responses
   * that are common on the free Inference API tier.
   */
  private async callInference(
    model: string,
    inputs: string,
    parameters?: Record<string, unknown>,
  ): Promise<any> {
    return retryWithBackoff<any>(
      async () => {
        const url = `${HF_INFERENCE_BASE}/${model}`;

        const body: Record<string, unknown> = { inputs };
        if (parameters && Object.keys(parameters).length > 0) {
          body.parameters = parameters;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          // ---- Handle cold-start 503 ----
          if (response.status === 503) {
            const errBody = await response.text().catch(() => '');
            logger.warn(
              `[HuggingFace] Model ${model} is loading (503). ` +
              `Will retry. Body: ${errBody.slice(0, 200)}`,
            );
            throw new Error(`Model ${model} is loading (503 cold start)`);
          }

          // ---- Handle other non-2xx ----
          if (!response.ok) {
            const errBody = await response.text().catch(() => 'no body');
            const msg = `HF API ${response.status} for ${model}: ${errBody.slice(0, 500)}`;
            logger.error(`[HuggingFace] ${msg}`);
            throw new Error(msg);
          }

          // ---- Parse JSON response ----
          const data = await response.json();
          return data;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxRetries: 4, // Extra retries to survive cold starts
        baseDelayMs: 3_000,
        retryOn: (err: unknown) => {
          if (err instanceof Error) {
            const m = err.message;
            // Do NOT retry on unrecoverable offline connection/DNS/network errors
            if (m.includes('fetch failed') || m.includes('ENOTFOUND') || m.includes('ECONNREFUSED') || m.includes('EAI_AGAIN')) {
              return false;
            }
            // Always retry on cold starts, timeouts, and server errors
            if (m.includes('503') || m.includes('abort') || m.includes('500')) {
              return true;
            }
            // Do NOT retry on 401 / 403 (bad key)
            if (m.includes('401') || m.includes('403')) return false;
            // Retry everything else (network issues, etc.)
            return true;
          }
          return true;
        },
      },
    );
  }

  // --------------------------------------------------------------------------
  // Public — Triage Sentiment
  // --------------------------------------------------------------------------

  /**
   * Runs AI triage on raw financial text to extract a numeric sentiment score
   * and a concise summary.
   *
   * ### Strategy
   * 1. Try the primary model (`Meta-Llama-3-8B-Instruct`).
   * 2. If the primary model fails after all retries, fall back to the
   *    secondary model (`Mistral-7B-Instruct-v0.3`).
   * 3. Parse the LLM's JSON output (handling optional markdown code fences).
   *
   * @param rawText — Sanitised financial text (news headlines, Reddit posts).
   * @returns `TriageResult` with score, summary, and the model that was used.
   */
  public async triageSentiment(rawText: string): Promise<TriageResult> {
    // Truncate to protect context-window limits
    const truncatedText = rawText.slice(0, MAX_INPUT_CHARS);

    const systemPrompt =
      `You are a financial sentiment analysis engine. Analyze the following ` +
      `financial text and return ONLY a valid JSON object with exactly two ` +
      `fields:\n` +
      `- "sentiment_score": an integer from 0 (extremely bearish) to 100 ` +
      `(extremely bullish)\n` +
      `- "summary": a 1-3 sentence summary of the key financial takeaways\n\n` +
      `Do NOT include any explanation, markdown formatting, or extra text. ` +
      `Return ONLY the JSON object.\n\n` +
      `Financial text:\n${truncatedText}`;

    // ---- Attempt with primary model ----
    const tryModel = async (model: string): Promise<TriageResult> => {
      return this.triageBreaker.execute<TriageResult>(async () => {
        logger.info(`[HuggingFace] Triage sentiment with model: ${model}`);

        const response = await this.callInference(model, systemPrompt, {
          max_new_tokens: 512,
          temperature: 0.1,
          return_full_text: false,
        });

        // ---- Extract the generated text ----
        let generatedText = '';

        if (Array.isArray(response) && response.length > 0) {
          // HF returns [{ generated_text: "..." }] for text-generation
          generatedText = response[0]?.generated_text || '';
        } else if (typeof response === 'string') {
          generatedText = response;
        } else if (response?.generated_text) {
          generatedText = response.generated_text;
        } else {
          // Last resort — stringify whatever we got
          generatedText = JSON.stringify(response);
        }

        // ---- Parse JSON (handle markdown code fences) ----
        const parsed = this.extractJsonFromLLM(generatedText);

        // Validate the required fields
        const score = Number(parsed.sentiment_score);
        if (isNaN(score) || score < 0 || score > 100) {
          throw new Error(
            `Invalid sentiment_score: ${parsed.sentiment_score}`,
          );
        }

        const summary = String(parsed.summary || '').trim();
        if (summary.length === 0) {
          throw new Error('Empty summary returned from triage model');
        }

        return {
          sentiment_score: Math.round(score),
          summary,
          model_used: model,
        };
      });
    };

    // ---- Primary → Fallback strategy ----
    try {
      return await tryModel(TRIAGE_PRIMARY_MODEL);
    } catch (primaryError) {
      logger.warn(
        `[HuggingFace] Primary triage model failed: ` +
        `${primaryError instanceof Error ? primaryError.message : primaryError}. ` +
        `Falling back to ${TRIAGE_FALLBACK_MODEL}.`,
      );

      try {
        return await tryModel(TRIAGE_FALLBACK_MODEL);
      } catch (fallbackError) {
        logger.error(
          `[HuggingFace] Fallback triage model also failed: ` +
          `${fallbackError instanceof Error ? fallbackError.message : fallbackError}`,
        );
        throw fallbackError;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Public — Generate Embedding
  // --------------------------------------------------------------------------

  /**
   * Converts a text string into a 384-dimensional float vector using the
   * `sentence-transformers/all-MiniLM-L6-v2` model on Hugging Face.
   *
   * @param text — The text to embed (typically an AI-generated summary).
   * @returns A 384-element number array suitable for Pinecone upsert.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    const truncatedText = text.slice(0, 10_000); // Embeddings have smaller ctx

    return this.embeddingBreaker.execute<number[]>(async () => {
      logger.info('[HuggingFace] Generating embedding');

      const response = await this.callInference(EMBEDDING_MODEL, truncatedText);

      // ---- Validate the embedding shape ----
      // HF feature-extraction models return [[number[]]] or [number[]]
      let embedding: number[];

      if (Array.isArray(response)) {
        if (Array.isArray(response[0]) && Array.isArray(response[0][0])) {
          // Shape: [[[ ... ]]] — sentence-transformers token-level;
          // take the first (CLS) token or pool manually. For MiniLM,
          // the API usually returns sentence-level embeddings.
          embedding = response[0][0];
        } else if (Array.isArray(response[0])) {
          // Shape: [[ ... ]] — common for sentence embeddings
          embedding = response[0];
        } else if (typeof response[0] === 'number') {
          // Shape: [ ... ] — already flat
          embedding = response;
        } else {
          throw new Error(
            `Unexpected embedding response shape: ${JSON.stringify(response).slice(0, 200)}`,
          );
        }
      } else {
        throw new Error(
          `Expected array from embedding model, got: ${typeof response}`,
        );
      }

      // ---- Sanity check ----
      if (
        !Array.isArray(embedding) ||
        embedding.length === 0 ||
        typeof embedding[0] !== 'number'
      ) {
        throw new Error(
          `Invalid embedding: expected number[], got length=${embedding?.length}`,
        );
      }

      logger.info(
        `[HuggingFace] Generated ${embedding.length}-d embedding`,
      );
      return embedding;
    });
  }

  // --------------------------------------------------------------------------
  // Public — Deep-Dive Report
  // --------------------------------------------------------------------------

  /**
   * Generates a structured due-diligence report by feeding RAG-retrieved
   * context into a heavy reasoning model.
   *
   * @param context — Concatenated recent news summaries and embeddings
   *                  retrieved from Pinecone.
   * @param ticker  — The stock symbol this report is about.
   * @returns A `ReportContent` object matching the Firestore schema.
   */
  public async generateDeepDiveReport(
    context: string,
    ticker: string,
  ): Promise<ReportContent> {
    const sanitizedTicker = ticker.trim().toUpperCase();

    return this.reasoningBreaker.execute<ReportContent>(async () => {
      logger.info(
        `[HuggingFace] Generating deep-dive report for ${sanitizedTicker}`,
      );

      const truncatedContext = context.slice(0, MAX_INPUT_CHARS);

      const systemPrompt =
        `You are a senior financial analyst at a top-tier investment bank. ` +
        `Based ONLY on the following real-time scraped intelligence about ` +
        `${sanitizedTicker}, generate a structured due diligence report.\n\n` +
        `Return ONLY a valid JSON object with exactly these fields:\n` +
        `- "strengths": an array of 3-5 strings, each describing a key bullish signal\n` +
        `- "weaknesses": an array of 3-5 strings, each describing a key bearish risk\n` +
        `- "catalysts": an array of 2-4 strings, each describing a near-term catalyst\n` +
        `- "overall_thesis": a single paragraph (3-5 sentences) with your investment thesis\n\n` +
        `Do NOT include any explanation, markdown formatting, or extra text outside the JSON.\n\n` +
        `=== REAL-TIME INTELLIGENCE FOR ${sanitizedTicker} ===\n${truncatedContext}`;

      const response = await this.callInference(REASONING_MODEL, systemPrompt, {
        max_new_tokens: 2048,
        temperature: 0.3,
        return_full_text: false,
      });

      // ---- Extract generated text ----
      let generatedText = '';
      if (Array.isArray(response) && response.length > 0) {
        generatedText = response[0]?.generated_text || '';
      } else if (typeof response === 'string') {
        generatedText = response;
      } else if (response?.generated_text) {
        generatedText = response.generated_text;
      } else {
        generatedText = JSON.stringify(response);
      }

      // ---- Parse and validate the structured output ----
      const parsed = this.extractJsonFromLLM(generatedText);

      const report: ReportContent = {
        strengths: this.ensureStringArray(parsed.strengths, 'strengths'),
        weaknesses: this.ensureStringArray(parsed.weaknesses, 'weaknesses'),
        catalysts: this.ensureStringArray(parsed.catalysts, 'catalysts'),
        overall_thesis: String(parsed.overall_thesis || '').trim(),
      };

      if (report.overall_thesis.length === 0) {
        throw new Error('Model returned empty overall_thesis');
      }

      logger.info(
        `[HuggingFace] Deep-dive report generated for ${sanitizedTicker} ` +
        `(${report.strengths.length} strengths, ` +
        `${report.weaknesses.length} weaknesses, ` +
        `${report.catalysts.length} catalysts)`,
      );

      return report;
    });
  }

  // --------------------------------------------------------------------------
  // Health / Observability
  // --------------------------------------------------------------------------

  /**
   * Returns the current state of every circuit breaker managed by this
   * service. Intended for the `/health` endpoint and system status page.
   */
  public getServiceStatus(): {
    triage: string;
    reasoning: string;
    embedding: string;
  } {
    return {
      triage: this.triageBreaker.getState(),
      reasoning: this.reasoningBreaker.getState(),
      embedding: this.embeddingBreaker.getState(),
    };
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Extracts a JSON object from an LLM response string. Handles common
   * quirks like markdown code fences (```json … ```), leading/trailing
   * whitespace, and extraneous text before/after the JSON.
   */
  private extractJsonFromLLM(text: string): Record<string, any> {
    let cleaned = text.trim();

    // Strip markdown code fences: ```json ... ``` or ``` ... ```
    const codeFenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeFenceMatch) {
      cleaned = codeFenceMatch[1].trim();
    }

    // Try to find a JSON object in the text using brace matching
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Parsed value is not an object');
      }
      return parsed;
    } catch (parseError) {
      logger.error(
        `[HuggingFace] Failed to parse LLM JSON. Raw text: ` +
        `${text.slice(0, 500)}`,
      );
      throw new Error(
        `Failed to parse JSON from LLM response: ` +
        `${parseError instanceof Error ? parseError.message : parseError}`,
      );
    }
  }

  /**
   * Ensures a value is an array of non-empty strings. Handles cases where
   * the LLM returns a single string instead of an array.
   */
  private ensureStringArray(value: unknown, fieldName: string): string[] {
    if (Array.isArray(value)) {
      return value
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0);
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      // Model returned a single string — wrap it
      logger.warn(
        `[HuggingFace] Field "${fieldName}" was a string, wrapping in array`,
      );
      return [value.trim()];
    }

    logger.warn(
      `[HuggingFace] Field "${fieldName}" missing or invalid, returning empty array`,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

/** Pre-instantiated HuggingFaceService singleton. Import this directly. */
const huggingFaceService = HuggingFaceService.getInstance();
export default huggingFaceService;
export { HuggingFaceService };
