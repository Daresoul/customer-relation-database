import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { householdApi } from '../api.integration';

type Sent = { dto: { household: Record<string, unknown>; people: Array<{ person: { first_name: string; is_primary: boolean } }> } };

// Final review (low): the first person was always made primary, so with the
// second ticked both were primary; city and ZIP were glued into the address.
describe('household create (dashboard)', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ household: { id: 5, household_name: 'Petrovski' }, people: [] });
  });

  it('marks only the person ticked as primary', async () => {
    await householdApi.create({
      lastName: 'Petrovski',
      contacts: [
        { firstName: 'Ana', isPrimary: false },
        { firstName: 'Petar', isPrimary: true },
      ],
    } as never);
    const sent = invokeMock.mock.calls[0][1] as Sent;
    expect(sent.dto.people.map((p) => p.person.is_primary)).toEqual([false, true]);
  });

  it('makes the first person primary when nobody is ticked', async () => {
    await householdApi.create({ lastName: 'Petrovski', contacts: [{ firstName: 'Ana' }, { firstName: 'Petar' }] } as never);
    const sent = invokeMock.mock.calls[0][1] as Sent;
    expect(sent.dto.people.map((p) => p.person.is_primary)).toEqual([true, false]);
  });

  it('sends city and postal code in their own fields', async () => {
    await householdApi.create({
      lastName: 'Petrovski',
      address: { street: 'Партизанска 5', city: 'Битола', zipCode: '7000' },
      contacts: [{ firstName: 'Ana' }],
    } as never);
    const sent = invokeMock.mock.calls[0][1] as Sent;
    expect(sent.dto.household).toMatchObject({ address: 'Партизанска 5', city: 'Битола', postal_code: '7000' });
  });
});
