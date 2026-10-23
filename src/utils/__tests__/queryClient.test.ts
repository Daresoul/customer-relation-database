import { describe, it, expect, vi } from 'vitest';
import { createQueryClient } from '../queryClient';

// app-shell #10: queries retried 3 times (a dead backend took ~7 s to show
// an error) and a failed load was never logged.
describe('createQueryClient', () => {
  it('retries a failed query once', () => {
    const client = createQueryClient(vi.fn());
    expect(client.getDefaultOptions().queries?.retry).toBe(1);
  });

  it('logs a failed query with its key', async () => {
    const report = vi.fn();
    const client = createQueryClient(report);

    await expect(
      client.fetchQuery({ queryKey: ['patients', 7], queryFn: () => Promise.reject(new Error('database is locked')), retry: false }),
    ).rejects.toThrow('database is locked');

    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      subsystem: 'webview.query_failed',
      message: 'database is locked',
      extras: expect.objectContaining({ queryKey: '["patients",7]' }),
    }));
  });

  it('never lets a failing reporter break the query error', async () => {
    const client = createQueryClient(() => { throw new Error('log down'); });
    await expect(
      client.fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(new Error('real')), retry: false }),
    ).rejects.toThrow('real');
  });
});
