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
});
