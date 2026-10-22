import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { householdApi } from '../api.integration';

describe('household list', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue([]);
  });

  it('asks the backend for every household when no limit is given', async () => {
    await householdApi.search('');

    expect(invokeMock).toHaveBeenCalledWith('get_all_households', { limit: undefined });
  });

  it('lets a failed list load reach the caller instead of returning no households', async () => {
    invokeMock.mockRejectedValue(new Error('database is locked'));

    await expect(householdApi.search('')).rejects.toThrow('database is locked');
  });
});
