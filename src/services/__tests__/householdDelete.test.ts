import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { householdApi } from '../api.integration';

describe('household delete (dashboard)', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('sends the household id under the name the backend reads', async () => {
    await householdApi.delete(12);

    expect(invokeMock).toHaveBeenCalledWith('delete_household', { householdId: 12 });
  });
});
