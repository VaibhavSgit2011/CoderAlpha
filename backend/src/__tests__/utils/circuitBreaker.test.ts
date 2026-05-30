// Set log level to suppress info/debug logs during testing
process.env.LOG_LEVEL = 'error';

import { CircuitBreaker, CircuitState, CircuitOpenError } from '../../utils/circuitBreaker';

describe('CircuitBreaker Utility', () => {
  let breaker: CircuitBreaker;
  const breakerName = 'TestService';

  beforeEach(() => {
    // Reset or instantiate a clean breaker before each test
    breaker = new CircuitBreaker(breakerName, {
      failureThreshold: 3,
      resetTimeoutMs: 50, // Short timeout for rapid state-transition testing
      halfOpenMaxAttempts: 1,
    });
  });

  describe('CLOSED State (Normal Operations)', () => {
    it('should start in the CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should execute functions successfully and return their result', async () => {
      const fn = jest.fn().mockResolvedValue('success_data');
      const result = await breaker.execute(fn);

      expect(result).toBe('success_data');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should throw the original error on failure but stay CLOSED if threshold not met', async () => {
      const error = new Error('Database down');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(breaker.execute(fn)).rejects.toThrow('Database down');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Transition to OPEN State (Failure Threshold)', () => {
    it('should trip the circuit to OPEN after threshold limit of consecutive failures is reached', async () => {
      const error = new Error('API failure');
      const fn = jest.fn().mockRejectedValue(error);

      // 1st failure
      await expect(breaker.execute(fn)).rejects.toThrow('API failure');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // 2nd failure
      await expect(breaker.execute(fn)).rejects.toThrow('API failure');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // 3rd failure (trips threshold)
      await expect(breaker.execute(fn)).rejects.toThrow('API failure');
      
      // Should now be OPEN
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should reject requests immediately when OPEN without calling the wrapped function', async () => {
      const error = new Error('API failure');
      const fn = jest.fn().mockRejectedValue(error);

      // Trip the circuit (threshold = 3)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('API failure');
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Try running another call
      const healthyFn = jest.fn().mockResolvedValue('happy');
      
      await expect(breaker.execute(healthyFn)).rejects.toThrow(CircuitOpenError);
      
      // Verify the healthy function was never called
      expect(healthyFn).not.toHaveBeenCalled();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reset consecutive failure count upon a successful execution', async () => {
      const error = new Error('Temporary glitch');
      const failFn = jest.fn().mockRejectedValue(error);
      const successFn = jest.fn().mockResolvedValue('back online');

      // 2 failures
      await expect(breaker.execute(failFn)).rejects.toThrow(error);
      await expect(breaker.execute(failFn)).rejects.toThrow(error);

      // 1 success resets consecutive failure tally
      const result = await breaker.execute(successFn);
      expect(result).toBe('back online');

      // 1 more failure (should NOT trip because count was reset)
      await expect(breaker.execute(failFn)).rejects.toThrow(error);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('HALF_OPEN State & Recovery', () => {
    it('should transition from OPEN to HALF_OPEN after resetTimeout elapsed', async () => {
      const error = new Error('Service down');
      const failFn = jest.fn().mockRejectedValue(error);

      // Trip circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow(error);
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for resetTimeoutMs (50ms) to elapse
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Getting state triggers evaluation of transition
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close the circuit and reset if probe request succeeds in HALF_OPEN', async () => {
      const error = new Error('Service down');
      const failFn = jest.fn().mockRejectedValue(error);

      // Trip circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow(error);
      }
      
      // Wait for resetTimeoutMs (50ms)
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Probe request succeeds
      const successFn = jest.fn().mockResolvedValue('recovery complete');
      const result = await breaker.execute(successFn);

      expect(result).toBe('recovery complete');
      expect(successFn).toHaveBeenCalledTimes(1);
      // Circuit is closed
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should re-open the circuit immediately if probe request fails in HALF_OPEN', async () => {
      const error = new Error('Service down');
      const failFn = jest.fn().mockRejectedValue(error);

      // Trip circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow(error);
      }
      
      // Wait for resetTimeoutMs (50ms)
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Probe request fails
      const anotherError = new Error('Still broken');
      const probeFailFn = jest.fn().mockRejectedValue(anotherError);

      await expect(breaker.execute(probeFailFn)).rejects.toThrow('Still broken');
      expect(probeFailFn).toHaveBeenCalledTimes(1);
      // Circuit re-opened
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Manual Operations', () => {
    it('should allow manual reset to CLOSED state from OPEN', async () => {
      const error = new Error('Severe outage');
      const failFn = jest.fn().mockRejectedValue(error);

      // Trip circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow(error);
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Manually reset
      breaker.reset();
      
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      
      // Run normal request again
      const successFn = jest.fn().mockResolvedValue('immediate recovery');
      const result = await breaker.execute(successFn);
      expect(result).toBe('immediate recovery');
    });
  });
});
