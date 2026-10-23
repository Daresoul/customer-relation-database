import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const findDuplicates = vi.fn();
const createHouseholdWithPeople = vi.fn();
vi.mock('../../../services/householdService', () => ({
  HouseholdService: {
    findDuplicates: (...a: unknown[]) => findDuplicates(...a),
    createHouseholdWithPeople: (...a: unknown[]) => createHouseholdWithPeople(...a),
    updateHousehold: vi.fn(),
  },
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn() }));

import { CreateHouseholdInline } from '../CreateHouseholdInline';

const match = {
  householdId: 7,
  householdName: 'Петровски',
  primaryPerson: 'Марко Петровски',
  phone: '070 123 456',
  address: null,
  city: null,
  petCount: 1,
  reasons: ['phone'],
};

function renderForm(props: Partial<React.ComponentProps<typeof CreateHouseholdInline>> = {}) {
  const onCreated = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <CreateHouseholdInline onCreated={onCreated} onCancel={vi.fn()} {...props} />
      </App>
    </QueryClientProvider>,
  );
  return { onCreated };
}

function type(placeholderOrLabel: string, value: string, index = 0) {
  const inputs = screen.getAllByPlaceholderText(placeholderOrLabel);
  fireEvent.change(inputs[index], { target: { value } });
}

function fillMarko() {
  type('forms:placeholders.enterName', 'Petrovski', 0);
  type('forms:placeholders.enterName', 'Marko', 1);
  type('forms:placeholders.enterName', 'Petrovski', 2);
  type('forms:placeholders.enterPhone', '070 123 456');
}

describe('CreateHouseholdInline duplicate check', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('checks the typed name and phone and warns about a possible existing client', async () => {
    findDuplicates.mockResolvedValue([match]);
    renderForm();

    fillMarko();

    expect(await screen.findByText('duplicates.title', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(findDuplicates).toHaveBeenLastCalledWith({
      householdName: 'Petrovski',
      firstName: 'Marko',
      lastName: 'Petrovski',
      phones: ['070 123 456'],
      emails: [],
    });
  });

  it('still creates the household when the user goes ahead', async () => {
    findDuplicates.mockResolvedValue([match]);
    createHouseholdWithPeople.mockResolvedValue({ household: { id: 9, householdName: 'Petrovski' }, people: [] });
    const { onCreated } = renderForm();

    fillMarko();
    const createAnyway = await screen.findByText('households:duplicates.createAnyway', {}, { timeout: 2000 });
    fireEvent.click(createAnyway);

    await waitFor(() => expect(createHouseholdWithPeople).toHaveBeenCalled());
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })));
  });

  it('Use this household hands back the existing one without creating', async () => {
    findDuplicates.mockResolvedValue([match]);
    const onUseExisting = vi.fn();
    const { onCreated } = renderForm({ onUseExisting });

    fillMarko();
    fireEvent.click(await screen.findByText('duplicates.useThis', {}, { timeout: 2000 }));

    expect(onUseExisting).toHaveBeenCalledWith({ id: 7, householdName: 'Петровски' });
    expect(createHouseholdWithPeople).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
