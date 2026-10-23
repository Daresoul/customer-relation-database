import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const requested: number[] = [];
const state: { household: { id: number; householdName: string }; patients: unknown[] } = {
  household: { id: 4, householdName: 'Петровски' },
  patients: [],
};
vi.mock('../../../hooks/useHousehold', () => ({
  useHouseholdDetail: (id: number) => {
    requested.push(id);
    return { data: { household: state.household, people: [], patients: [] }, isLoading: false, error: null, refetch: vi.fn() };
  },
  useHouseholdPatients: () => ({ data: state.patients, isLoading: false, error: null, refetch: vi.fn(), isFetching: false }),
}));
const deleteHousehold = vi.fn();
vi.mock('../../../services/householdService', () => ({
  HouseholdService: { deleteHousehold: (...a: unknown[]) => deleteHousehold(...a) },
}));
vi.mock('../HouseholdInfo', () => ({ HouseholdInfo: () => null }));
vi.mock('../PeopleSection', () => ({ PeopleSection: () => null }));
vi.mock('../AnimalsSection', () => ({ AnimalsSection: () => null }));
vi.mock('../MergeHouseholdModal', () => ({
  MergeHouseholdModal: ({ open }: { open: boolean }) => (open ? <div>merge dialog</div> : null),
}));
vi.mock('../../../components/DeviceStatusBar', () => ({ DeviceStatusInline: () => null }));

import { HouseholdDetail } from '../index';

function renderPage(path = '/households/4') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App>
          <Routes>
            <Route path="/households/:id" element={<HouseholdDetail />} />
            <Route path="/" element={<div>dashboard</div>} />
          </Routes>
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openMenuItem(label: string) {
  fireEvent.click(screen.getByText('detail.actions.more'));
  fireEvent.click(await screen.findByText(label));
}

describe('HouseholdDetail actions', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    requested.length = 0;
    state.household = { id: 4, householdName: 'Петровски' };
    state.patients = [];
    document.body.innerHTML = '';
  });

  it('an old link to a merged-away household opens the kept household', async () => {
    state.household = { id: 9, householdName: 'Петровски' };
    renderPage('/households/4');

    await waitFor(() => expect(requested).toContain(9));
  });

  it('opens the merge dialog from the More menu', async () => {
    renderPage();

    await openMenuItem('detail.actions.merge');

    expect(await screen.findByText('merge dialog')).toBeInTheDocument();
  });

  it('refuses to delete while the household has pets and offers Merge instead', async () => {
    state.patients = [{ id: 5, name: 'Рекс' }];
    renderPage();

    await openMenuItem('detail.actions.delete');

    expect(await screen.findByText('detail.delete.blockedTitle')).toBeInTheDocument();
    expect(screen.queryByText('detail.delete.ok')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('detail.delete.mergeInstead'));
    expect(await screen.findByText('merge dialog')).toBeInTheDocument();
    expect(deleteHousehold).not.toHaveBeenCalled();
  });

  it('deletes an empty household after a confirm and goes back to the dashboard', async () => {
    deleteHousehold.mockResolvedValue(undefined);
    renderPage();

    await openMenuItem('detail.actions.delete');
    expect(await screen.findByText('detail.delete.title')).toBeInTheDocument();
    fireEvent.click(screen.getByText('detail.delete.ok'));

    await waitFor(() => expect(deleteHousehold).toHaveBeenCalledWith(4));
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
  });

  it('stays on the page and says so when the delete fails', async () => {
    deleteHousehold.mockRejectedValue('HOUSEHOLD_HAS_PETS: 1 pets');
    renderPage();

    await openMenuItem('detail.actions.delete');
    fireEvent.click(await screen.findByText('detail.delete.ok'));

    expect(await screen.findByText('detail.delete.failed')).toBeInTheDocument();
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
  });

  it('Back returns to the patient page it was opened from', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/patients/3', '/households/4']} initialIndex={1}>
          <App>
            <Routes>
              <Route path="/households/:id" element={<HouseholdDetail />} />
              <Route path="/patients/:id" element={<div>patient page</div>} />
              <Route path="/" element={<div>dashboard</div>} />
            </Routes>
          </App>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('detail.backToHouseholds'));

    expect(await screen.findByText('patient page')).toBeInTheDocument();
  });
});
