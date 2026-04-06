import { describe, expect, it, vi } from 'vitest';
import { createRequestId, logger } from './logger.js';

describe('logger', () => {
  it('creates unique request IDs', () => {
    const id1 = createRequestId();
    const id2 = createRequestId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^req_\d+_\d+$/);
  });

  it('logs to stderr as JSON', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.info('test message', { key: 'value' });
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.level).toBe('info');
    expect(logged.message).toBe('test message');
    expect(logged.key).toBe('value');
    expect(logged.ts).toBeDefined();
    spy.mockRestore();
  });

  it('includes all log levels', () => {
    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
  });
});
