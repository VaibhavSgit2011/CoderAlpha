/**
 * ============================================================
 * AlphaStream AI — Environment Variable Validation
 * ============================================================
 *
 * Validates ALL required environment variables at application
 * startup using Zod schemas. This ensures the server never
 * boots with missing or malformed configuration, preventing
 * hard-to-debug runtime failures downstream.
 *
 * Usage:
 *   import { env } from './config/env';
 *   console.log(env.PORT); // number, guaranteed valid
 *
 * On validation failure the process will throw with a detailed
 * error listing every invalid / missing variable.
 * ============================================================
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// ── Load .env file into process.env ───────────────────────
// Must be called before schema parsing so that variables
// defined in `.env` are available for validation.
dotenv.config();

// ── Zod Schema ────────────────────────────────────────────
// Every environment variable the backend relies on is declared
// here with its expected type, constraints, and defaults.
const envSchema = z.object({
  // ─── Server ──────────────────────────────────────────────
  /** HTTP port the Express server listens on. */
  PORT: z.coerce.number().default(3001),

  /** Current runtime environment — controls logging verbosity,
   *  error detail exposure, and other behaviour toggles. */
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  /** Allowed CORS origin for the frontend application. */
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // ─── Firebase Admin SDK ──────────────────────────────────
  /** Path to the service-account JSON key file (Option 1). */
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  /** Inline JSON string of the service-account key (Option 2,
   *  preferred for containerised / cloud deployments). */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  /** GCP / Firebase project identifier — always required. */
  FIREBASE_PROJECT_ID: z.string().min(1),

  // ─── Bright Data ─────────────────────────────────────────
  /** API token for Bright Data REST endpoints. */
  BRIGHTDATA_API_TOKEN: z.string().min(1),

  /** SERP zone identifier for search-engine scraping. */
  BRIGHTDATA_SERP_ZONE: z.string().default('serp_zone1'),

  /** Proxy hostname used by Bright Data residential network. */
  BRIGHTDATA_PROXY_HOST: z.string().default('brd.superproxy.io'),

  /** Proxy port. */
  BRIGHTDATA_PROXY_PORT: z.coerce.number().default(22225),

  /** Proxy authentication — username component. */
  BRIGHTDATA_PROXY_USERNAME: z.string().default(''),

  /** Proxy authentication — password component. */
  BRIGHTDATA_PROXY_PASSWORD: z.string().default(''),

  // ─── Hugging Face ────────────────────────────────────────
  /** API key for Hugging Face Inference API (embeddings, LLM). */
  HUGGINGFACE_API_KEY: z.string().min(1),

  // ─── OpenRouter & Alpha Vantage ──────────────────────────
  /** API key for OpenRouter models. */
  OPENROUTER_API_KEY: z.string().min(1),

  /** API key for Alpha Vantage market data. */
  ALPHAVANTAGE_API_KEY: z.string().min(1),

  /** API key for Financial Modeling Prep (FMP) market data. */
  FMP_API_KEY: z.string().min(1),


  // ─── Pinecone (Optional/Deprecated) ────────────────────────
  /** API key for Pinecone vector database. */
  PINECONE_API_KEY: z.string().optional(),

  /** Name of the Pinecone index storing document embeddings. */
  PINECONE_INDEX_NAME: z.string().default('alphastream-vectors').optional(),

  /** Pinecone cloud environment / region. */
  PINECONE_ENVIRONMENT: z.string().default('us-east-1').optional(),

  // ─── Rate Limiting ──────────────────────────────────────
  /** Sliding window duration in milliseconds. */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  /** Maximum requests allowed within the window. */
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(30),

  // ─── Ingestion Pipeline ──────────────────────────────────
  /** Cron expression controlling how often the ingestion
   *  pipeline scans for stale watchlist tickers. */
  INGESTION_CRON_SCHEDULE: z.string().default('*/15 * * * *'),

  /** Minutes after which a ticker's data is considered stale
   *  and should be re-ingested. */
  INGESTION_STALE_THRESHOLD_MINUTES: z.coerce.number().default(15),

  /** Maximum number of tickers ingested concurrently. */
  INGESTION_MAX_CONCURRENT: z.coerce.number().default(5),

  // ─── Logging ─────────────────────────────────────────────
  /** Winston log level: error | warn | info | http | verbose | debug | silly */
  LOG_LEVEL: z.string().default('info'),
});

// ── Validate & Export ─────────────────────────────────────
// safeParse is used first so we can format a human-readable
// error message before crashing. Then we re-parse (which throws)
// so that callers get the narrowed type without `| undefined`.

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Build a readable summary of every validation issue.
  const formattedErrors = parsed.error.issues
    .map((issue) => {
      const path = issue.path.join('.') || '<root>';
      return `  ✖ ${path}: ${issue.message} (${issue.code})`;
    })
    .join('\n');

  // Log to stderr so it is visible even without Winston configured.
  console.error(
    '\n╔══════════════════════════════════════════════════════╗\n' +
      '║  ❌  ENVIRONMENT VALIDATION FAILED                   ║\n' +
      '╚══════════════════════════════════════════════════════╝\n\n' +
      `The following environment variables are missing or invalid:\n\n${formattedErrors}\n\n` +
      'Please check your .env file or deployment secrets.\n'
  );

  // Crash immediately — the server cannot run with bad config.
  throw new Error(
    `Environment validation failed with ${parsed.error.issues.length} error(s). ` +
      'See the log output above for details.'
  );
}

/**
 * Fully-validated, typed environment configuration.
 * Safe to destructure anywhere in the application:
 *
 * ```ts
 * import { env } from '@/config/env';
 * const { PORT, NODE_ENV } = env;
 * ```
 */
export const env = parsed.data;

/**
 * TypeScript type representing the validated environment.
 * Useful for typing function parameters that accept config subsets.
 */
export type Env = z.infer<typeof envSchema>;
