// Set log level to suppress warn/error logs in test outputs
process.env.LOG_LEVEL = 'error';

import { retryWithBackoff } from '../../utils/retry';

describe('Retry Utility', () => {
  it('should return result immediately on success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      jitter: false,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient HTTP error and eventually succeed', async () => {
    const error = { status: 503, message: 'Unavailable' };
    const fn = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const onRetry = jest.fn();

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      jitter: false,
      onRetry,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, error);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, error);
  });

  it('should retry on network error code (e.g. ECONNRESET)', async () => {
    const error = { code: 'ECONNRESET', message: 'Connection reset' };
    const fn = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 1,
      jitter: false,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable error (e.g. HTTP 400)', async () => {
    const error = { status: 400, message: 'Bad Request' };
    const fn = jest.fn().mockRejectedValue(error);

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        jitter: false,
      })
    ).rejects.toEqual(error);

    // Should fail instantly on the 1st try without retrying
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw last error after all retries are exhausted', async () => {
    const error = { status: 502, message: 'Bad Gateway' };
    const fn = jest.fn().mockRejectedValue(error);

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 2, // 1 initial + 2 retries = 3 calls total
        baseDelayMs: 1,
        jitter: false,
      })
    ).rejects.toEqual(error);

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect custom retryOn filter', async () => {
    const customError = new Error('Custom trigger');
    const fn = jest.fn().mockRejectedValue(customError);

    // Retries only when error message contains 'Custom trigger'
    const retryOn = (err: any) => err.message.includes('Custom trigger');

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        jitter: false,
        retryOn,
      })
    ).rejects.toThrow('Custom trigger');

    expect(fn).toHaveBeenCalledTimes(3);
  });
});
