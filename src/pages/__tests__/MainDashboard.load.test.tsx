import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? key : key) }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}), emit: vi.fn() }));

const getPatients = vi.fn();
vi.mock('../../services', () => ({ PatientService: { getPatients: () => getPatients() } }));

const householdSearch = vi.fn();
const createPatient = vi.fn();
vi.mock('../../services/api.integration', () => ({
  default: {
    household: { search: (...a: unknown[]) => householdSearch(...a) },
    patient: { create: (...a: unknown[]) => createPatient(...a) },
  },
  setAppInstance: vi.fn(),
}));

const countWaiting = vi.fn().mockResolvedValue(0);
vi.mock('../../services/labInboxService', () => ({ labInboxService: { countWaiting: () => countWaiting() } }));
vi.mock('../../components/LabInbox/LabInboxList', () => ({ default: () => <div>lab inbox list</div> }));
vi.mock('../../contexts/useViewContext', () => ({
  useViewContext: () => ({ currentView: 'animal', setCurrentView: vi.fn() }),
}));
vi.mock('../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/hooks/useBarcodeScanner', () => ({ useBarcodeScanner: vi.fn(), normalizeMicrochip: (s: string) => s }));
vi.mock('../../components/tables/PatientTable', () => ({
  PatientTable: ({ patients }: { patients: Array<{ name: string }> }) => (
    <div>{patients.map((p) => p.name).join(',')}</div>
  ),
}));
vi.mock('../../components/tables/HouseholdTable', () => ({ HouseholdTable: () => null }));
vi.mock('../Appointments/AppointmentsTab', () => ({ default: () => null }));
vi.mock('../../components/forms/PatientFormWithOwner', () => ({
  PatientFormWithOwner: ({ onSubmit }: { onSubmit: (d: unknown) => Promise<void> }) => (
    <button onClick={() => onSubmit({ name: 'Bella' }).catch(() => {})}>stub-submit</button>
  ),
}));
vi.mock('../../components/forms/HouseholdForm', () => ({ HouseholdForm: () => null }));

import { MainDashboard } from '../MainDashboard';

function renderDashboard(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App>
          <MainDashboard />
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const stats = { total_patients: 1, active_patients: 1, total_households: 1, total_medical_records: 0 };

describe('MainDashboard load', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('shows a load error with Retry instead of an empty clinic', async () => {
    invokeMock.mockResolvedValue(stats);
    getPatients.mockRejectedValue(new Error('database is locked'));
    householdSearch.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText('patients:dashboard.loadFailed')).toBeInTheDocument();
    expect(screen.getByText('common:retry')).toBeInTheDocument();
    expect(screen.queryByText('No Data')).not.toBeInTheDocument();
  });

  it('loads the lists again on Retry', async () => {
    invokeMock.mockResolvedValue(stats);
    getPatients.mockRejectedValueOnce(new Error('database is locked')).mockResolvedValue([{ id: 1, name: 'Bella' }]);
    householdSearch.mockResolvedValue([]);
    renderDashboard();

    fireEvent.click(await screen.findByText('common:retry'));

    await waitFor(() => expect(screen.getByText('Bella')).toBeInTheDocument());
    expect(screen.queryByText('patients:dashboard.loadFailed')).not.toBeInTheDocument();
  });

  it('has a Lab inbox tab that says how many results wait', async () => {
    invokeMock.mockResolvedValue(stats);
    getPatients.mockResolvedValue([]);
    householdSearch.mockResolvedValue([]);
    countWaiting.mockResolvedValue(4);
    renderDashboard();

    const tab = await screen.findByText('devices:inbox.title');
    await waitFor(() => expect(tab.closest('[role="tab"]')?.textContent).toContain('4'));
    fireEvent.click(tab);
    expect(await screen.findByText('lab inbox list')).toBeInTheDocument();
  });

  it('a patient added on the dashboard shows up in the other pickers', async () => {
    invokeMock.mockResolvedValue(stats);
    getPatients.mockResolvedValue([]);
    householdSearch.mockResolvedValue([]);
    createPatient.mockResolvedValue({ id: 2, name: 'Bella' });
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    renderDashboard(client);

    fireEvent.click(await screen.findByTestId('add-patient-btn'));
    fireEvent.click(await screen.findByText('stub-submit'));

    await waitFor(() =>
      expect(spy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] })?.queryKey?.[0])).toContain('patients'),
    );
  });
});
