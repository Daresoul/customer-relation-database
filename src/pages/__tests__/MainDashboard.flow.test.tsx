/**
 * dashboard #8, #11, #12, flow-frontdesk #8, settings #1: the dashboard
 * blanked to a full-page loader after every save, showed a bare "No Data",
 * stayed on the list after adding a patient, forgot the tab and search on
 * Back, and said nothing when backups were not set up or failing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
    household: { search: (...a: unknown[]) => householdSearch(...a), create: vi.fn() },
    patient: { create: (...a: unknown[]) => createPatient(...a) },
  },
  setAppInstance: vi.fn(),
}));

vi.mock('../../hooks/useLabInbox', () => ({ useLabInboxCount: () => ({ data: 0 }) }));
vi.mock('../../components/LabInbox/LabInboxList', () => ({ default: () => <div>lab inbox list</div> }));
vi.mock('../../contexts/ViewContext', () => ({
  useViewContext: () => ({ currentView: 'animal', setCurrentView: vi.fn() }),
}));
vi.mock('../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/hooks/useBarcodeScanner', () => ({ useBarcodeScanner: vi.fn(), normalizeMicrochip: (s: string) => s }));
vi.mock('../../components/TodayStrip', () => ({ TodayStrip: () => null }));
vi.mock('../../components/tables/PatientTable', () => ({
  PatientTable: ({
    patients,
    searchText,
    onSearchTextChange,
  }: {
    patients: Array<{ name: string }>;
    searchText: string;
    onSearchTextChange: (s: string) => void;
  }) => (
    <div>
      <span>{patients.map((p) => p.name).join(',')}</span>
      <span data-testid="patient-search">{searchText}</span>
      <button onClick={() => onSearchTextChange('bel')}>type patient search</button>
    </div>
  ),
}));
vi.mock('../../components/tables/HouseholdTable', () => ({
  HouseholdTable: ({ searchText }: { searchText?: string }) => (
    <div>
      household table <span data-testid="household-search">{searchText}</span>
    </div>
  ),
}));
vi.mock('../Appointments/AppointmentsTab', () => ({ default: () => null }));
vi.mock('../../components/forms/PatientFormWithOwner', () => ({
  PatientFormWithOwner: ({ onSubmit }: { onSubmit: (d: unknown) => Promise<void> }) => (
    <button onClick={() => onSubmit({ name: 'Bella' }).catch(() => {})}>stub-submit</button>
  ),
}));
vi.mock('../../components/forms/HouseholdForm', () => ({ HouseholdForm: () => null }));

import { MainDashboard } from '../MainDashboard';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderDashboard(url = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <App>
          <Routes>
            <Route path="/" element={<MainDashboard />} />
            <Route path="/patients/:id" element={<div>patient page</div>} />
            <Route path="/settings" element={<div>settings page</div>} />
          </Routes>
          <LocationProbe />
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function backup(config: Record<string, unknown>) {
  invokeMock.mockImplementation((command: string) =>
    command === 'get_backup_config' ? Promise.resolve(config) : Promise.resolve({}),
  );
}

const healthyBackup = { directory: 'E:\\Backups', lastBackupAt: new Date().toISOString(), lastError: null };

describe('MainDashboard flow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps the lists on screen while it reloads after a save', async () => {
    backup(healthyBackup);
    getPatients.mockResolvedValueOnce([{ id: 1, name: 'Rex' }]).mockReturnValue(new Promise(() => {}));
    householdSearch.mockResolvedValue([]);
    createPatient.mockResolvedValue({ id: 2, name: 'Bella' });
    renderDashboard();

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-patient-btn'));
    fireEvent.click(await screen.findByText('stub-submit'));

    await waitFor(() => expect(getPatients).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('common:loading')).not.toBeInTheDocument();
  });

  it('opens the new patient after adding one', async () => {
    backup(healthyBackup);
    getPatients.mockResolvedValue([{ id: 1, name: 'Rex' }]);
    householdSearch.mockResolvedValue([]);
    createPatient.mockResolvedValue({ id: 2, name: 'Bella' });
    renderDashboard();

    fireEvent.click(await screen.findByTestId('add-patient-btn'));
    fireEvent.click(await screen.findByText('stub-submit'));

    expect(await screen.findByText('patient page')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/patients/2');
  });

  it('an empty clinic offers to add the first patient', async () => {
    backup(healthyBackup);
    getPatients.mockResolvedValue([]);
    householdSearch.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText('common:empty.noPatientsTitle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /common:empty.addPatient/ }));
    expect(await screen.findByText('stub-submit')).toBeInTheDocument();
  });

  it('opens the tab and search named in the URL, and keeps them there', async () => {
    backup(healthyBackup);
    getPatients.mockResolvedValue([{ id: 1, name: 'Rex' }]);
    householdSearch.mockResolvedValue([{ id: 1, lastName: 'Petrovski' }]);
    renderDashboard('/?tab=households&q=petro');

    expect(await screen.findByText('household table')).toBeInTheDocument();
    expect(screen.getByTestId('household-search').textContent).toBe('petro');

    fireEvent.click(screen.getByText('navigation:patients'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('tab=patients'));
    fireEvent.click(await screen.findByText('type patient search'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('q=bel'));
    expect(screen.getByTestId('patient-search').textContent).toBe('bel');
  });

  it('warns on the dashboard when backups are not set up, with a link to set them up', async () => {
    backup({ directory: null, lastBackupAt: null, lastError: null });
    getPatients.mockResolvedValue([{ id: 1, name: 'Rex' }]);
    householdSearch.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText('shell:backup.dashboard.notConfigured')).toBeInTheDocument();
    fireEvent.click(screen.getByText('shell:backup.dashboard.openSettings'));
    expect(await screen.findByText('settings page')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/settings?section=backups');
  });

  it('warns when the last backup failed', async () => {
    backup({ directory: 'E:\\Backups', lastBackupAt: null, lastError: 'VACUUM INTO failed: database or disk is full' });
    getPatients.mockResolvedValue([{ id: 1, name: 'Rex' }]);
    householdSearch.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText('shell:backup.dashboard.failed')).toBeInTheDocument();
    expect(screen.getByText('settings:backups.errors.diskFull')).toBeInTheDocument();
  });

  it('says nothing about backups when they are fine', async () => {
    backup(healthyBackup);
    getPatients.mockResolvedValue([{ id: 1, name: 'Rex' }]);
    householdSearch.mockResolvedValue([]);
    renderDashboard();

    await screen.findByText('Rex');
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/shell:backup.dashboard/)).not.toBeInTheDocument();
  });
});
