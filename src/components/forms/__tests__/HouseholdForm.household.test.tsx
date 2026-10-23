import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/services/invoke', () => ({ invoke: vi.fn() }));

import { invoke } from '@/services/invoke';
import { HouseholdForm } from '../HouseholdForm';

const editProps = {
  mode: 'edit' as const,
  initialValues: { id: 42, lastName: 'Smith', contacts: [] },
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('HouseholdForm — moving pets in and out (edit mode)', () => {
  it('lists the pets of this household', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'get_household_patients' ? [{ id: 5, name: 'Rex' }] : [],
    );
    render(<HouseholdForm {...editProps} />);

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('get_household_patients', { householdId: 42 });
  });

  it('Remove unlinks the pet from this household for real', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'get_household_patients' ? [{ id: 5, name: 'Rex' }] : null,
    );
    render(<HouseholdForm {...editProps} />);
    await screen.findByText('Rex');

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    const ok = await waitFor(() => {
      const button = document.querySelector('.ant-popconfirm .ant-btn-primary') as HTMLElement | null;
      expect(button).not.toBeNull();
      return button!;
    });
    fireEvent.click(ok);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('unlink_patient_from_household', { patientId: 5, householdId: 42 }),
    );
    expect(invoke).not.toHaveBeenCalledWith('update_patient', expect.anything());
  });

  it('adding an existing pet moves it into this household for real', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'search_patients' ? [{ id: 6, name: 'Luna' }] : cmd === 'get_household_patients' ? [] : null,
    );
    render(<HouseholdForm {...editProps} />);
    const search = screen.getByRole('combobox');
    fireEvent.mouseDown(search);
    fireEvent.change(search, { target: { value: 'Lu' } });

    const option = await waitFor(() => {
      const item = document.querySelector('.ant-select-item-option') as HTMLElement | null;
      expect(item?.textContent).toContain('Luna');
      return item!;
    }, { timeout: 2000 });
    fireEvent.click(option);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('update_patient_household', { patientId: 6, householdId: 42 }),
    );
    expect(invoke).not.toHaveBeenCalledWith('update_patient', expect.anything());
  });
});

describe('HouseholdForm — duplicate warning (create mode)', () => {
  it('warns about a possible existing client while the household is typed', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'find_household_duplicates'
        ? [{ household_id: 7, household_name: 'Petrovski', primary_person: 'Marko Petrovski', phone: null,
             address: null, city: null, pet_count: 0, reasons: ['name'] }]
        : null,
    );
    render(<HouseholdForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Petrovski' } });

    expect(await screen.findByText('Marko Petrovski', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('find_household_duplicates', {
      check: expect.objectContaining({ household_name: 'Petrovski' }),
    });
  });
});
