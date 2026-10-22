import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
vi.mock('../../services/api.integration', () => ({
  default: { household: { search: (...a: unknown[]) => householdSearch(...a) }, patient: {} },
  setAppInstance: vi.fn(),
}));

vi.mock('../../services/fileHistoryService', () => ({
  fileHistoryService: { listPendingDeviceEntries: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../contexts/ViewContext', () => ({
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
vi.mock('../../components/PendingDeviceTable', () => ({ default: () => null }));
vi.mock('../Appointments/AppointmentsTab', () => ({ default: () => null }));
vi.mock('../../components/forms/PatientFormWithOwner', () => ({ PatientFormWithOwner: () => null }));
vi.mock('../../components/forms/HouseholdForm', () => ({ HouseholdForm: () => null }));

import { MainDashboard } from '../MainDashboard';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <App>
        <MainDashboard />
      </App>
    </MemoryRouter>,
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
});
