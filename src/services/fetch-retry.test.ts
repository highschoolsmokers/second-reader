import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from './fetch-retry.js';

// Mock the global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Suppress logger output in tests
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createRequestId: () => 'test_req_1',
}));

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchWithRetry', () => {
  it('returns response on success', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const res = await fetchWithRetry('https://example.com');
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const res = await fetchWithRetry('https://example.com', {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 and succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const res = await fetchWithRetry('https://example.com', {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns error response after exhausting retries', async () => {
    mockFetch.mockResolvedValue(new Response('error', { status: 500 }));

    const res = await fetchWithRetry('https://example.com', {}, { maxRetries: 2, baseDelayMs: 1 });
    expect(res.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on 4xx (except 429)', async () => {
    mockFetch.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    const res = await fetchWithRetry('https://example.com', {}, { baseDelayMs: 1 });
    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network errors', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const res = await fetchWithRetry('https://example.com', {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on network errors', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));

    await expect(fetchWithRetry('https://example.com', {}, { maxRetries: 1, baseDelayMs: 1 })).rejects.toThrow(
      'network error',
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('respects retry-after header', async () => {
    const headers = new Headers();
    headers.set('retry-after', '1');
    mockFetch
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const start = Date.now();
    const res = await fetchWithRetry('https://example.com', {}, { baseDelayMs: 1 });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    // Should have waited ~1000ms for retry-after: 1
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });
});
