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

  it('lists search hits with their id, name and address (search rows are flat)', async () => {
    invokeMock.mockResolvedValue({
      results: [
        {
          id: 7,
          household_name: 'Petrovski',
          address: 'Partizanska 1',
          people: [
            {
              id: 1,
              first_name: 'Ana',
              last_name: 'Petrovska',
              is_primary: true,
              contacts: [{ id: 1, person_id: 1, contact_type: 'phone', contact_value: '070 123 456', is_primary: true, created_at: '' }],
            },
          ],
          pet_count: 2,
          relevance_score: 1,
          snippet: null,
        },
      ],
    });

    const [row] = await householdApi.search('petro');

    expect(row).toMatchObject({
      id: 7,
      lastName: 'Petrovski',
      address: 'Partizanska 1',
      primaryContact: 'Ana Petrovska',
      phone: '070 123 456',
      petCount: 2,
    });
  });
});
