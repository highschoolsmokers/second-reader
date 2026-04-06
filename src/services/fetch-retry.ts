import { logger } from './logger.js';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 500,
  timeoutMs: 15_000,
};

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const { maxRetries, baseDelayMs, timeoutMs } = { ...DEFAULT_OPTIONS, ...options };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (response.status === 429 || (response.status >= 500 && attempt < maxRetries)) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : baseDelayMs * 2 ** attempt;
        logger.warn('Retrying fetch', { url, status: response.status, attempt, delay });
        await sleep(delay);
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === maxRetries) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      logger.warn('Fetch error, retrying', { url, attempt, delay, error: String(err) });
      await sleep(delay);
    }
  }

  throw new Error(`fetchWithRetry: exhausted ${maxRetries} retries for ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
