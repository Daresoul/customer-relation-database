import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const refetchPatients = vi.fn();
const refetchHousehold = vi.fn();
const householdState: { data: unknown; error: unknown } = { data: undefined, error: null };
const patientsState: { data?: unknown[]; error: unknown; isLoading: boolean } = { error: null, isLoading: false };
vi.mock('../../../hooks/useHousehold', () => ({
  useHouseholdDetail: () => ({ data: householdState.data, isLoading: false, error: householdState.error, refetch: refetchHousehold }),
  useHouseholdPatients: () => ({ ...patientsState, refetch: refetchPatients }),
}));
vi.mock('../HouseholdInfo', () => ({ HouseholdInfo: () => null }));
vi.mock('../PeopleSection', () => ({ PeopleSection: () => null }));
vi.mock('../../../components/DeviceStatusBar', () => ({ DeviceStatusInline: () => null }));
vi.mock('../../../components/forms/PatientFormWithOwner', () => ({ default: () => null }));

import { HouseholdDetail } from '../index';

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/households/4']}>
        <App>
          <Routes>
            <Route path="/households/:id" element={<HouseholdDetail />} />
          </Routes>
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HouseholdDetail pets list', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    patientsState.error = null;
    patientsState.data = undefined;
    patientsState.isLoading = false;
    householdState.error = null;
    document.body.innerHTML = '';
  });

  it('Retry on a failed household load fetches again without reloading the app', () => {
    householdState.data = undefined;
    householdState.error = new Error('database is locked');
    renderPage();

    fireEvent.click(screen.getByText('detail.retry'));
    expect(refetchHousehold).toHaveBeenCalled();
  });

  it('shows a load error with Retry, not "no pets", when the pets fail to load', () => {
    householdState.data = { household: { id: 4, householdName: 'Petrovski' }, people: [], patients: [] };
    patientsState.error = new Error('database is locked');
    renderPage();

    expect(screen.getByText('detail.animals.loadFailed')).toBeInTheDocument();
    expect(screen.queryByText('detail.animals.noAnimals')).not.toBeInTheDocument();
    expect(screen.queryByText('detail.animals.registerFirstPet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('common:retry'));
    expect(refetchPatients).toHaveBeenCalled();
  });

  it('does not claim "no pets" while the pets are still loading', () => {
    householdState.data = { household: { id: 4, householdName: 'Petrovski' }, people: [], patients: [] };
    patientsState.isLoading = true;
    renderPage();

    expect(screen.queryByText('detail.animals.noAnimals')).not.toBeInTheDocument();
  });
});
