import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const patients: Record<number, unknown> = {
  7: {
    id: 7,
    name: 'Rex',
    species: 'Dog',
    household: { id: 2, householdName: 'Петровски', primaryContact: { firstName: 'Ана', lastName: 'Петровска' } },
  },
};
vi.mock('@/hooks/usePatient', () => ({
  usePatientDetail: (id: number) => ({ data: patients[id] ?? undefined }),
}));

import { useRememberOpenedPatient } from '../useRememberOpenedPatient';
import { loadRecentPatients } from '../recentPatients';

function Tracker() {
  useRememberOpenedPatient();
  return null;
}

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <Tracker /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('recently viewed: any way a patient page opens', () => {
  it('remembers the patient whose page is open, with species and owner', async () => {
    renderAt('/patients/7');
    await waitFor(() =>
      expect(loadRecentPatients()).toEqual([{ id: 7, name: 'Rex', species: 'Dog', ownerName: 'Ана Петровска' }]),
    );
  });

  it('remembers nothing on other pages', async () => {
    renderAt('/households/7');
    await new Promise((r) => setTimeout(r, 20));
    expect(loadRecentPatients()).toEqual([]);
  });
});
