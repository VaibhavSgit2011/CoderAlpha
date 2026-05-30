/**
 * @file circuitBreaker.ts
 * @description Circuit Breaker pattern implementation for the AlphaStream AI backend.
 *
 * Protects downstream services from cascading failures by tracking consecutive
 * errors and "tripping" the circuit when a failure threshold is reached.
 *
 * State machine:
 *
 *   ┌────────┐  failure count ≥ threshold  ┌──────┐
 *   │ CLOSED │ ──────────────────────────▶ │ OPEN │
 *   └────────┘                              └──┬───┘
 *       ▲                                      │
 *       │  success in HALF_OPEN                │ resetTimeout elapsed
 *       │                                      ▼
 *       │                                ┌───────────┐
 *       └─────────────────────────────── │ HALF_OPEN │
 *                                        └───────────┘
 *              failure in HALF_OPEN → re-open circuit
 *
 * Usage:
 *   import { CircuitBreaker } from '../utils/circuitBreaker';
 *   const breaker = new CircuitBreaker('OpenAI', { failureThreshold: 3 });
 *   const result = await breaker.execute(() => callOpenAI(prompt));
 */

import { createChildLogger } from '../utils/logger';

// Module-scoped logger — all circuit-breaker log lines tagged [CircuitBreaker].
const log = createChildLogger('CircuitBreaker');

// ---------------------------------------------------------------------------
// Public enums & interfaces
// ---------------------------------------------------------------------------

/**
 * The three possible states of the circuit breaker.
 */
export enum CircuitState {
  /** Normal operation — requests flow through and failures are tracked. */
  CLOSED = 'CLOSED',

  /** Circuit is tripped — all requests are rejected immediately. */
  OPEN = 'OPEN',

  /** Probing — a limited number of requests are allowed through to test recovery. */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Configuration options for `CircuitBreaker`.
 * Every field is optional; sensible defaults are applied internally.
 */
export interface CircuitBreakerOptions {
  /**
   * Number of consecutive failures required to trip the circuit.
   * @default 5
   */
  failureThreshold?: number;

  /**
   * Time in milliseconds to wait in the OPEN state before transitioning
   * to HALF_OPEN to probe for recovery.
   * @default 30000  (30 seconds)
   */
  resetTimeoutMs?: number;

  /**
   * Maximum number of probe requests allowed while in the HALF_OPEN state.
   * If any of these succeed the circuit closes; if all fail it re-opens.
   * @default 1
   */
  halfOpenMaxAttempts?: number;
}

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

/**
 * Thrown when a request is rejected because the circuit is currently OPEN.
 * Callers can catch this specifically to show a meaningful user-facing error
 * or to skip retries (retrying against an open circuit is pointless).
 */
export class CircuitOpenError extends Error {
  /** The name of the circuit breaker that rejected the request. */
  public readonly circuitName: string;

  constructor(circuitName: string) {
    super(
      `Circuit breaker "${circuitName}" is OPEN — request rejected. ` +
      `The downstream service is likely unavailable. Please try again later.`,
    );
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;

    // Restore the prototype chain (required when extending built-ins in TS).
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
  }
}

// ---------------------------------------------------------------------------
// CircuitBreaker class
// ---------------------------------------------------------------------------

/**
 * A circuit breaker that wraps async operations and prevents cascading
 * failures by short-circuiting calls to unhealthy downstream services.
 *
 * @example
 * ```ts
 * const breaker = new CircuitBreaker('EmbeddingAPI', {
 *   failureThreshold: 3,
 *   resetTimeoutMs: 15000,
 * });
 *
 * try {
 *   const embeddings = await breaker.execute(() => getEmbeddings(text));
 * } catch (err) {
 *   if (err instanceof CircuitOpenError) {
 *     // Handle graceful degradation
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  // ---- Configuration (immutable after construction) ----
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;

  // ---- Mutable runtime state ----

  /** Current state of the circuit. */
  private state: CircuitState = CircuitState.CLOSED;

  /** Running count of consecutive failures while in the CLOSED state. */
  private failureCount: number = 0;

  /** Timestamp (epoch ms) when the circuit was last opened. */
  private lastFailureTime: number = 0;

  /** Number of probe requests issued so far in the current HALF_OPEN window. */
  private halfOpenAttempts: number = 0;

  /**
   * @param name    - Human-readable identifier for this breaker instance
   *                  (e.g. the downstream service name). Used in logs and errors.
   * @param options - Optional configuration overrides.
   */
  constructor(name: string, options?: CircuitBreakerOptions) {
    this.name = name;
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 30000;
    this.halfOpenMaxAttempts = options?.halfOpenMaxAttempts ?? 1;

    log.info(`Circuit breaker "${this.name}" initialised`, {
      state: this.state,
      failureThreshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeoutMs,
      halfOpenMaxAttempts: this.halfOpenMaxAttempts,
    });
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /**
   * Returns the current state of the circuit breaker.
   */
  public getState(): CircuitState {
    // Before returning, check if we should auto-transition from OPEN → HALF_OPEN.
    this.evaluateOpenToHalfOpen();
    return this.state;
  }

  /**
   * Manually resets the circuit to the CLOSED state.
   * Useful for admin endpoints, health-check recoveries, or testing.
   */
  public reset(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = 0;

    log.info(`Circuit breaker "${this.name}" manually reset`, {
      previousState,
      newState: CircuitState.CLOSED,
    });
  }

  /**
   * Executes the wrapped async function according to the circuit's current state.
   *
   * - **CLOSED**: The function runs normally. Failures increment the counter;
   *   when the threshold is reached the circuit opens.
   * - **OPEN**: A `CircuitOpenError` is thrown immediately (no call is made).
   *   Once `resetTimeoutMs` has elapsed the circuit transitions to HALF_OPEN.
   * - **HALF_OPEN**: A limited number of probe calls are allowed. A single
   *   success closes the circuit; a failure re-opens it.
   *
   * @typeParam T - The resolved type of the wrapped function.
   * @param fn - The async operation to protect.
   * @returns The resolved value of `fn`.
   * @throws `CircuitOpenError` when the circuit is OPEN.
   * @throws The original error from `fn` when it fails and is non-retryable.
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    // ---- Possibly transition OPEN → HALF_OPEN before evaluating state. ----
    this.evaluateOpenToHalfOpen();

    switch (this.state) {
      // ------------------------------------------------------------------
      // OPEN — reject immediately.
      // ------------------------------------------------------------------
      case CircuitState.OPEN: {
        log.warn(`Circuit breaker "${this.name}" is OPEN — rejecting request`);
        throw new CircuitOpenError(this.name);
      }

      // ------------------------------------------------------------------
      // HALF_OPEN — allow limited probe requests.
      // ------------------------------------------------------------------
      case CircuitState.HALF_OPEN: {
        // Guard: if we've already exhausted probe attempts, re-open.
        if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
          this.transitionTo(CircuitState.OPEN);
          throw new CircuitOpenError(this.name);
        }

        this.halfOpenAttempts++;

        try {
          const result = await fn();

          // Probe succeeded — close the circuit.
          this.onSuccess();
          return result;
        } catch (error: unknown) {
          // Probe failed — re-open the circuit.
          this.onFailure(error);
          throw error;
        }
      }

      // ------------------------------------------------------------------
      // CLOSED — normal operation with failure tracking.
      // ------------------------------------------------------------------
      case CircuitState.CLOSED:
      default: {
        try {
          const result = await fn();

          // Success resets the consecutive failure counter.
          this.onSuccess();
          return result;
        } catch (error: unknown) {
          this.onFailure(error);
          throw error;
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------

  /**
   * Called after every successful execution.
   * Resets failure counters and, if currently HALF_OPEN, closes the circuit.
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      log.info(
        `Circuit breaker "${this.name}" probe succeeded — closing circuit`,
      );
      this.transitionTo(CircuitState.CLOSED);
    }

    // In the CLOSED state, a success resets the consecutive failure tally.
    this.failureCount = 0;
  }

  /**
   * Called after every failed execution.
   * Increments the failure counter and opens the circuit when the
   * threshold is reached (CLOSED) or re-opens it (HALF_OPEN).
   */
  private onFailure(error: unknown): void {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (this.state === CircuitState.HALF_OPEN) {
      // Probe request failed — re-open the circuit.
      log.warn(
        `Circuit breaker "${this.name}" probe failed — re-opening circuit`,
        { error: errorMessage },
      );
      this.transitionTo(CircuitState.OPEN);
      return;
    }

    // CLOSED state — track consecutive failures.
    this.failureCount++;

    log.debug(
      `Circuit breaker "${this.name}" failure recorded`,
      {
        failureCount: this.failureCount,
        threshold: this.failureThreshold,
        error: errorMessage,
      },
    );

    if (this.failureCount >= this.failureThreshold) {
      log.error(
        `Circuit breaker "${this.name}" failure threshold reached — opening circuit`,
        { failureCount: this.failureCount },
      );
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Checks whether the reset timeout has elapsed while in the OPEN state.
   * If so, transitions to HALF_OPEN so that probe requests can test recovery.
   */
  private evaluateOpenToHalfOpen(): void {
    if (this.state !== CircuitState.OPEN) return;

    const elapsed = Date.now() - this.lastFailureTime;
    if (elapsed >= this.resetTimeoutMs) {
      log.info(
        `Circuit breaker "${this.name}" reset timeout elapsed — transitioning to HALF_OPEN`,
        { elapsedMs: elapsed, resetTimeoutMs: this.resetTimeoutMs },
      );
      this.transitionTo(CircuitState.HALF_OPEN);
    }
  }

  /**
   * Performs a state transition, resetting the relevant counters and
   * logging the change for observability.
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;

    // Reset counters relevant to the target state.
    switch (newState) {
      case CircuitState.CLOSED:
        this.failureCount = 0;
        this.halfOpenAttempts = 0;
        this.lastFailureTime = 0;
        break;

      case CircuitState.OPEN:
        this.lastFailureTime = Date.now();
        this.halfOpenAttempts = 0;
        break;

      case CircuitState.HALF_OPEN:
        this.halfOpenAttempts = 0;
        break;
    }

    log.info(`Circuit breaker "${this.name}" state transition`, {
      from: previousState,
      to: newState,
    });
  }
}
