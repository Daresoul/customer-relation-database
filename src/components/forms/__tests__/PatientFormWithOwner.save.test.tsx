import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key) }),
}));

vi.mock('@/services/invoke', () => ({
  invoke: vi.fn().mockResolvedValue({ results: [] }),
}));

vi.mock('../../../hooks/useSpecies', () => ({
  useSpecies: () => ({ data: [{ id: 1, name: 'Dog' }], isLoading: false }),
}));
vi.mock('../../../hooks/useBreeds', () => ({
  useBreeds: () => ({ data: [], isLoading: false }),
}));
vi.mock('../../../components/CreateSpeciesModal', () => ({ CreateSpeciesModal: () => null }));
vi.mock('../../../components/CreateBreedModal', () => ({ CreateBreedModal: () => null }));
vi.mock('../CreateHouseholdModal', () => ({ CreateHouseholdModal: () => null }));

import { PatientFormWithOwner } from '../PatientFormWithOwner';

const patient = { id: 4, name: 'Rex', speciesId: 1 } as never;

function renderForm(onSubmit: (d: unknown) => Promise<void>) {
  return render(
    <App>
      <PatientFormWithOwner patient={patient} onSubmit={onSubmit} onCancel={vi.fn()} />
    </App>,
  );
}

describe('PatientFormWithOwner submit', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps what was typed and shows the failure when the save fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('disk full'));
    renderForm(onSubmit);

    const name = await screen.findByDisplayValue('Rex');
    fireEvent.change(name, { target: { value: 'Rexy' } });
    fireEvent.click(screen.getByTestId('submit-patient-btn'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() => expect(document.body.textContent).toContain('disk full'));
    expect(screen.getByDisplayValue('Rexy')).toBeInTheDocument();
  });

  it('leaves the success message to the caller', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);

    await screen.findByDisplayValue('Rex');
    fireEvent.click(screen.getByTestId('submit-patient-btn'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(document.body.textContent).not.toContain('successfully');
  });
});
