/**
 * "Add patient" → "Create new household": the household window sits inside
 * the patient form. On the Windows lab, pressing its Create did nothing — no
 * household, no message.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('../../../hooks/useSpecies', () => ({
  useSpecies: () => ({ data: [{ id: 1, name: 'Dog' }], isLoading: false }),
}));
vi.mock('../../../hooks/useBreeds', () => ({ useBreeds: () => ({ data: [], isLoading: false }) }));
vi.mock('../../../components/CreateSpeciesModal', () => ({ CreateSpeciesModal: () => null }));
vi.mock('../../../components/CreateBreedModal', () => ({ CreateBreedModal: () => null }));

import { PatientFormWithOwner } from '../PatientFormWithOwner';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('creating a household from the patient form', () => {
  it('creates it and picks it for the patient', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'create_household_with_people') {
        return {
          household: { id: 42, household_name: 'Петровски' },
          people: [{ id: 1, first_name: 'Петар', last_name: 'Петровски', is_primary: true, contacts: [] }],
        };
      }
      if (cmd === 'search_households') return { results: [] };
      return null;
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App>
          <PatientFormWithOwner onSubmit={vi.fn()} onCancel={vi.fn()} />
        </App>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByText('patients:detail.householdInfo.createNewHousehold'));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/householdName/), { target: { value: 'Петровски' } });
    fireEvent.change(dialog.getByLabelText(/firstName/), { target: { value: 'Петар' } });
    fireEvent.change(dialog.getByLabelText(/lastName/), { target: { value: 'Петровски' } });
    fireEvent.click(dialog.getByRole('button', { name: /create/ }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('create_household_with_people', expect.anything()),
    );
  });
});
