import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
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

vi.mock('../../services/fileHistoryService', () => ({
  fileHistoryService: { listPendingDeviceEntries: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
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
vi.mock('../../components/LabInbox/LabInboxList', () => ({ default: () => <div>lab inbox list</div> }));
vi.mock('../../hooks/useLabInbox', () => ({ useLabInboxCount: () => ({ data: 2 }) }));
vi.mock('../Appointments/AppointmentsTab', () => ({ default: () => null }));
vi.mock('../../components/forms/PatientFormWithOwner', () => ({
  PatientFormWithOwner: ({ defaultMicrochipId }: { defaultMicrochipId?: string }) => (
    <div>patient form, chip {defaultMicrochipId ?? 'none'}</div>
  ),
}));
vi.mock('../../components/TodayStrip', () => ({
  TodayStrip: ({ waitingLabCount, onOpenLabResults }: { waitingLabCount: number; onOpenLabResults: () => void }) => (
    <button onClick={onOpenLabResults}>today strip, {waitingLabCount} lab results waiting</button>
  ),
}));
vi.mock('../../components/forms/HouseholdForm', () => ({ HouseholdForm: () => null }));

import { MainDashboard } from '../MainDashboard';

function renderDashboard(state?: unknown) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: '/', state }]}>
        <App>
          <MainDashboard />
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MainDashboard today', () => {
  beforeEach(() => {
    invokeMock.mockResolvedValue({ total_patients: 1, active_patients: 1, total_households: 1, total_medical_records: 0 });
    getPatients.mockResolvedValue([]);
    householdSearch.mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the Today strip instead of the all-time counters', async () => {
    renderDashboard();
    expect(await screen.findByText(/today strip/)).toBeInTheDocument();
    expect(screen.queryByText('patients:statistics.totalPatients')).not.toBeInTheDocument();
    expect(screen.queryByText('patients:statistics.activePatients')).not.toBeInTheDocument();
  });

  it('feeds the strip the waiting lab results and opens them from it', async () => {
    renderDashboard();
    const strip = await screen.findByText('today strip, 2 lab results waiting');
    fireEvent.click(strip);
    expect(await screen.findByText('lab inbox list')).toBeInTheDocument();
  });

  it('opens Add patient with the chip filled in when a scan found nobody', async () => {
    renderDashboard({ newPatientChip: '807000000123456' });
    expect(await screen.findByText('patient form, chip 807000000123456')).toBeInTheDocument();
  });

  it('leaves chip scans to the app shell (no second handler on the dashboard)', async () => {
    renderDashboard();
    await screen.findByText(/today strip/);
    expect(useBarcodeScanner).not.toHaveBeenCalled();
  });
});
