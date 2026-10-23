import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HouseholdTable } from '../HouseholdTable';
import type { HouseholdTableRecord } from '../../../types/ui.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

// The household list stamps every row's activity with "now" (no real last
// visit is loaded), so a status or last-activity column would say every
// family is Active today.
describe('household table: no made-up activity', () => {
  it('shows no Status and no Last activity column', () => {
    const households = [
      { id: 1, lastName: 'Петровски', petCount: 1, lastActivity: new Date().toISOString() },
    ] as unknown as HouseholdTableRecord[];

    render(
      <MemoryRouter>
        <HouseholdTable households={households} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Петровски')).toBeInTheDocument();
    expect(screen.queryByText('patients:tableColumns.status')).not.toBeInTheDocument();
    expect(screen.queryByText('patients:tableColumns.lastActivity')).not.toBeInTheDocument();
    expect(screen.queryByText('entities:status.active')).not.toBeInTheDocument();
  });
});
