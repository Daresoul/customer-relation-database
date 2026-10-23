import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const searchHouseholds = vi.fn();
const movePatient = vi.fn();
vi.mock('../../../services/householdService', () => ({
  HouseholdService: {
    searchHouseholds: (...a: unknown[]) => searchHouseholds(...a),
    movePatient: (...a: unknown[]) => movePatient(...a),
  },
}));
const searchPatients = vi.fn();
vi.mock('../../../services/patientService', () => ({
  PatientService: {
    searchPatients: (...a: unknown[]) => searchPatients(...a),
    createPatient: vi.fn(),
  },
}));
vi.mock('../../../components/forms/PatientFormWithOwner', () => ({ default: () => null }));

import { AnimalsSection } from '../AnimalsSection';

const rex = { id: 5, name: 'Рекс', species: 'Dog' };

function renderSection() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <App>
          <AnimalsSection patients={[rex] as never} householdId={4} />
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function pickOption(container: HTMLElement, typed: string, text: string) {
  const search = container.querySelector('input[role="combobox"]') as HTMLElement;
  fireEvent.mouseDown(search);
  fireEvent.change(search, { target: { value: typed } });
  const option = await waitFor(() => {
    const items = Array.from(document.querySelectorAll('.ant-select-item-option')) as HTMLElement[];
    const item = items.find((i) => i.textContent?.includes(text));
    expect(item).toBeDefined();
    return item!;
  }, { timeout: 2000 });
  fireEvent.click(option);
}

describe('AnimalsSection move and link', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('moves a pet to another household picked by search', async () => {
    searchHouseholds.mockResolvedValue({
      results: [{ id: 9, householdName: 'Николовски', people: [], petCount: 0 }],
      total: 1,
      hasMore: false,
    });
    movePatient.mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'detail.animals.actions' }));
    fireEvent.click(await screen.findByText('detail.animals.moveToAnother'));
    const dialog = await screen.findByRole('dialog');
    await pickOption(dialog, 'Нико', 'Николовски');
    fireEvent.click(screen.getByText('detail.animals.move.confirm'));

    await waitFor(() => expect(movePatient).toHaveBeenCalledWith(5, 9));
  });

  it('does not offer the current household as the move target', async () => {
    searchHouseholds.mockResolvedValue({
      results: [{ id: 4, householdName: 'Петровски', people: [], petCount: 1 }],
      total: 1,
      hasMore: false,
    });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'detail.animals.actions' }));
    fireEvent.click(await screen.findByText('detail.animals.moveToAnother'));
    const dialog = await screen.findByRole('dialog');
    const search = dialog.querySelector('input[role="combobox"]') as HTMLElement;
    fireEvent.mouseDown(search);
    fireEvent.change(search, { target: { value: 'Петро' } });

    await waitFor(() => expect(searchHouseholds).toHaveBeenCalled(), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelectorAll('.ant-select-item-option')).toHaveLength(0);
  });

  it('links an existing pet from another household into this one', async () => {
    searchPatients.mockResolvedValue([{ id: 6, name: 'Луна', species: 'Cat', householdId: 2 }]);
    movePatient.mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(screen.getByText('detail.animals.linkExisting'));
    const dialog = await screen.findByRole('dialog');
    await pickOption(dialog, 'Лу', 'Луна');

    expect(await screen.findByText('detail.animals.link.inOtherHousehold')).toBeInTheDocument();
    fireEvent.click(screen.getByText('detail.animals.link.confirm'));

    await waitFor(() => expect(movePatient).toHaveBeenCalledWith(6, 4));
  });
});
