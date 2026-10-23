/**
 * household #7 and #12, frontend-data #9, forms #14: the household picker
 * showed on a household page (where the household is already fixed), listed
 * households by name only, said "no households" when the search failed, and
 * a long form left the first error off screen.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('../../../hooks/useSpecies', () => ({
  useSpecies: () => ({ data: [{ id: 1, name: 'Dog' }], isLoading: false }),
}));
vi.mock('../../../hooks/useBreeds', () => ({ useBreeds: () => ({ data: [], isLoading: false }) }));
vi.mock('../../../components/CreateSpeciesModal', () => ({ CreateSpeciesModal: () => null }));
vi.mock('../../../components/CreateBreedModal', () => ({ CreateBreedModal: () => null }));
vi.mock('../CreateHouseholdModal', () => ({ CreateHouseholdModal: () => null }));

import { PatientFormWithOwner } from '../PatientFormWithOwner';

function renderForm(props: Record<string, unknown> = {}) {
  return render(
    <App>
      <PatientFormWithOwner onSubmit={vi.fn()} onCancel={vi.fn()} {...props} />
    </App>,
  );
}

function openPicker() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /selectHouseholdOptional/ }));
}

describe('PatientFormWithOwner household picker', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('is hidden when the household is already known', async () => {
    invokeMock.mockResolvedValue({ results: [] });
    renderForm({ hideHouseholdPicker: true });

    await screen.findByTestId('submit-patient-btn');
    expect(screen.queryByText('forms:labels.selectHouseholdOptional')).not.toBeInTheDocument();
    expect(screen.queryByText('patients:detail.householdInfo.createNewHousehold')).not.toBeInTheDocument();
  });

  it('shows each household with its phone and address', async () => {
    invokeMock.mockResolvedValue({
      results: [
        {
          id: 3,
          household_name: 'Петровски',
          address: 'Партизанска 12',
          people: [{ first_name: 'Ана', last_name: 'Петровска', is_primary: true, contacts: [{ contact_type: 'phone', contact_value: '070 123 456' }] }],
        },
      ],
    });
    renderForm();
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());

    openPicker();

    expect(await screen.findByText('070 123 456 · Партизанска 12')).toBeInTheDocument();
  });

  it('says the search failed instead of "no households"', async () => {
    invokeMock.mockRejectedValue(new Error('database is locked'));
    renderForm();
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());

    openPicker();

    expect(await screen.findByText('forms:messages.householdSearchFailed')).toBeInTheDocument();
    expect(screen.queryByText('forms:messages.noHouseholdsMatch')).not.toBeInTheDocument();
  });

  it('moves to the first error', async () => {
    invokeMock.mockResolvedValue({ results: [] });
    renderForm();

    fireEvent.click(await screen.findByTestId('submit-patient-btn'));

    await waitFor(() => expect(document.activeElement?.tagName).toBe('INPUT'));
  });
});
