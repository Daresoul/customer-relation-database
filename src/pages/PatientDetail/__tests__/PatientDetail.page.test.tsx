import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import type { PatientDetail as PatientDetailType } from '../../../types/patient';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && typeof opts === 'object' && !('defaultValue' in opts) ? [key, ...Object.values(opts)].join('|') : key,
  }),
}));
vi.mock('../../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

const updatePatient = vi.fn();
let currentPatient: PatientDetailType;
vi.mock('../../../hooks/usePatient', () => ({
  usePatientDetail: () => ({ data: currentPatient, isLoading: false, error: null, refetch: vi.fn() }),
  useDeleteConfirmation: () => ({ showDeleteConfirm: vi.fn() }),
  useUpdatePatient: () => ({ mutateAsync: updatePatient, isPending: false }),
}));

vi.mock('../PatientInfo', () => ({ PatientInfo: () => <div>stub-info</div> }));
vi.mock('../chart/WeightLogCard', () => ({ WeightLogCard: () => null }));
vi.mock('../../../components/DiagnosisTagList', () => ({ default: () => null }));
vi.mock('../HouseholdSection', () => ({ HouseholdSection: () => null }));
vi.mock('../MedicalHistory/MedicalHistorySection', () => ({ default: () => null }));
vi.mock('../LabsTab', () => ({ LabsTab: () => null }));
vi.mock('../../../components/DeviceStatusBar', () => ({ DeviceStatusInline: () => null }));
vi.mock('@/components/MedicalRecordModal/MedicalRecordModal', () => ({
  default: ({ open, patientId }: { open: boolean; patientId: number }) =>
    open ? <div>stub-record-modal-{patientId}</div> : null,
}));
vi.mock('../../../components/AppointmentModal/AppointmentModal', () => ({
  default: ({ open, initialPatientId }: { open: boolean; initialPatientId?: number }) =>
    open ? <div>stub-book-{initialPatientId}</div> : null,
}));

import { PatientDetail } from '../index';

function rex(over: Partial<PatientDetailType> = {}): PatientDetailType {
  return {
    id: 3,
    name: 'Rex',
    species: 'Dog',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    medicalNotes: 'Allergic to chicken',
    household: { id: 8, householdName: 'Petrovski' },
    ...over,
  } as PatientDetailType;
}

const appointments = [
  { id: 1, patient_id: 3, title: 'Vaccine', start_time: '2020-05-01T09:00:00Z', end_time: '2020-05-01T09:30:00Z', status: 'completed' },
  { id: 2, patient_id: 3, title: 'Dental', start_time: '2099-05-01T09:00:00Z', end_time: '2099-05-01T09:30:00Z', status: 'scheduled' },
];

function answer(map: Record<string, unknown>) {
  invokeMock.mockImplementation(async (cmd: string) => (cmd in map ? map[cmd] : []));
}

function renderPage(entries = ['/patients/3'], patient = rex()) {
  currentPatient = patient;
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>stub-home</div> },
      { path: '/households/:id', element: <div>stub-household</div> },
      { path: '/patients/:id', element: <PatientDetail /> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <RouterProvider router={router} />
      </App>
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  updatePatient.mockReset();
  document.body.innerHTML = '';
});

describe('patient page overview', () => {
  it("shows the patient's medical notes and saves an edit", async () => {
    answer({ get_appointments: { appointments: [], total: 0, has_more: false } });
    updatePatient.mockResolvedValue({});
    renderPage();

    expect(await screen.findByText('Allergic to chicken')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /patients:overview.notes.edit/ }));
    fireEvent.change(screen.getByDisplayValue('Allergic to chicken'), { target: { value: 'Allergic to beef' } });
    fireEvent.click(screen.getByRole('button', { name: /common:save/ }));

    await waitFor(() =>
      expect(updatePatient).toHaveBeenCalledWith({ patientId: 3, updates: { notes: 'Allergic to beef' } }),
    );
  });

  it('shows the next and the last appointment', async () => {
    answer({ get_appointments: { appointments, total: 2, has_more: false } });
    renderPage();

    expect(await screen.findByText(/Dental/)).toBeInTheDocument();
    expect(screen.getByText(/Vaccine/)).toBeInTheDocument();
    const [, args] = invokeMock.mock.calls.find(([cmd]) => cmd === 'get_appointments')!;
    expect(args.filter.patient_id).toBe(3);
  });

  it('books from the overview with this patient picked', async () => {
    answer({ get_appointments: { appointments: [], total: 0, has_more: false } });
    renderPage();

    const card = (await screen.findByText('patients:overview.appointments.title')).closest('.ant-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /patients:overview.appointments.book/ }));

    expect(screen.getByText('stub-book-3')).toBeInTheDocument();
  });

  it('offers New record and Book in the banner', async () => {
    answer({ get_appointments: { appointments: [], total: 0, has_more: false } });
    renderPage();

    const banner = screen.getByRole('region', { name: 'Rex' });
    fireEvent.click(within(banner).getByRole('button', { name: /patients:chart.banner.newRecord/ }));
    expect(screen.getByText('stub-record-modal-3')).toBeInTheDocument();

    fireEvent.click(within(banner).getByRole('button', { name: /patients:chart.banner.book/ }));
    expect(screen.getByText('stub-book-3')).toBeInTheDocument();
  });

  it('does not offer booking for a deceased patient', async () => {
    answer({ get_appointments: { appointments: [], total: 0, has_more: false } });
    renderPage(['/patients/3'], rex({ isActive: false, deceasedAt: '2026-01-05' }));

    const banner = screen.getByRole('region', { name: 'Rex' });
    expect(within(banner).queryByRole('button', { name: /patients:chart.banner.book/ })).not.toBeInTheDocument();
  });
});

describe('patient page navigation', () => {
  it('Back returns to the page you came from', async () => {
    answer({ get_appointments: { appointments: [], total: 0, has_more: false } });
    const router = renderPage(['/households/8', '/patients/3']);

    fireEvent.click(screen.getByRole('button', { name: /common:back/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/households/8'));
  });

  it('Back goes home when the patient was opened directly', async () => {
    answer({ get_appointments: { appointments: [], total: 0, has_more: false } });
    const router = renderPage(['/patients/3']);

    fireEvent.click(screen.getByRole('button', { name: /common:back/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('the breadcrumb names the household and links to it', () => {
    answer({ get_appointments: { appointments: [], total: 0, has_more: false } });
    renderPage();

    const crumb = within(screen.getByRole('navigation')).getByRole('link', { name: 'Petrovski' });
    expect(crumb).toHaveAttribute('href', '/households/8');
  });
});
