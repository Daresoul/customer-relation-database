/**
 * flow-frontdesk #4: the household search matched the typed text inside one
 * phone as written, so "070123456" missed "070 123 456" and the second
 * owner's number was never searched.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HouseholdTable } from '../HouseholdTable';
import type { HouseholdTableRecord } from '../../../types/ui.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

const households = [
  { id: 1, lastName: 'Петровски', primaryContact: 'Ана Петровска', phone: '070 123 456', phones: ['070 123 456', '+389 71 987 654'], petCount: 1 },
  { id: 2, lastName: 'Јованови', primaryContact: 'Марко Јованов', phone: '072-555-111', phones: ['072-555-111'], petCount: 2 },
] as unknown as HouseholdTableRecord[];

function shown(searchText: string) {
  render(
    <MemoryRouter>
      <HouseholdTable households={households} searchText={searchText} />
    </MemoryRouter>,
  );
  return ['Петровски', 'Јованови'].filter((name) => screen.queryByText(name));
}

describe('household table phone search', () => {
  it('matches digits whatever the spacing', () => {
    expect(shown('070123456')).toEqual(['Петровски']);
  });

  it('matches the second owner\'s phone too', () => {
    expect(shown('071 987')).toEqual(['Петровски']);
  });

  it('reads +389 as a leading 0', () => {
    expect(shown('+389 72 555')).toEqual(['Јованови']);
  });

  it('still finds names', () => {
    expect(shown('јован')).toEqual(['Јованови']);
  });
});

describe('household list phones', () => {
  it('carries every phone of every person', async () => {
    const invokeMock = vi.fn().mockResolvedValue([
      {
        household: { id: 1, household_name: 'Петровски' },
        people: [
          { first_name: 'Ана', last_name: 'Петровска', is_primary: true, contacts: [{ contact_type: 'phone', contact_value: '070 123 456' }] },
          { first_name: 'Иван', last_name: 'Петровски', is_primary: false, contacts: [{ contact_type: 'mobile', contact_value: '071 987 654' }, { contact_type: 'email', contact_value: 'i@x.mk' }] },
        ],
        pet_count: 1,
      },
    ]);
    vi.resetModules();
    vi.doMock('@/services/invoke', () => ({ invoke: invokeMock }));
    const { householdApi } = await import('../../../services/api.integration');

    const [row] = await householdApi.search('');
    expect((row as unknown as { phones: string[] }).phones).toEqual(['070 123 456', '071 987 654']);
  });
});
