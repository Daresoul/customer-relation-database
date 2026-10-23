import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

// The record modal belongs to the records feature; the stub saves a record the
// way it does (same mutation key, same variables) so the link can be checked.
vi.mock('@/components/MedicalRecordModal/MedicalRecordModal', async () => {
  const { CREATE_RECORD_MUTATION_KEY } = await import('@/hooks/useMedicalRecords');
  function StubRecordModal({
    open,
    patientId,
    patientName,
    defaultTitle,
  }: {
    open: boolean;
    patientId: number;
    patientName: string;
    defaultTitle?: string;
  }) {
    const save = useMutation({
      mutationKey: CREATE_RECORD_MUTATION_KEY,
      mutationFn: async (_v: { patientId: number }) => ({ id: 55 }),
    });
    return open ? (
      <div data-testid="record-modal">
        record for {patientName}
        <span data-testid="record-default-title">{defaultTitle}</span>
        <button onClick={() => save.mutate({ patientId })}>stub-save-record</button>
      </div>
    ) : null;
  }
  return { default: StubRecordModal };
});

import { AppointmentDrawer } from '../AppointmentDrawer';

const detail = {
  id: 4,
  patient_id: 21,
  title: 'Vaccination',
  description: 'Second dose, bring the booklet',
  start_time: '2030-01-10T09:00:00.000Z',
  end_time: '2030-01-10T09:30:00.000Z',
  room_id: 3,
  status: 'scheduled',
  checked_in_at: null,
  medical_record_id: null,
  patient_name: 'Шарко',
  species: 'Dog',
  created_at: '2030-01-01T00:00:00Z',
  updated_at: '2030-01-01T00:00:00Z',
  created_by: 'system',
  patient: { id: 21, name: 'Шарко', species: 'Dog' },
  room: { id: 3, name: 'Exam A', capacity: 1, color: '#123456' },
  google_sync_state: 'synced',
  google_synced_at: '2030-01-09T10:00:00Z',
};

const patient = {
  id: 21,
  name: 'Шарко',
  species: 'Dog',
  isActive: true,
  householdId: 7,
  alerts: [{ id: 1, patientId: 21, alertType: 'allergy', note: 'penicillin' }],
};

const household = {
  household: { id: 7, household_name: 'Петровски' },
  people: [
    {
      id: 1,
      first_name: 'Ана',
      last_name: 'Петровска',
      is_primary: true,
      contacts: [{ id: 1, contact_type: 'phone', contact_value: '070 123 456', is_primary: true }],
    },
  ],
};

type Args = { input?: Record<string, unknown> } & Record<string, unknown>;

function backend(overrides: Record<string, (args: Args) => unknown> = {}) {
  invokeMock.mockImplementation((cmd: string, args: Args) => {
    if (overrides[cmd]) return Promise.resolve(overrides[cmd](args));
    switch (cmd) {
      case 'get_appointment':
        return Promise.resolve(detail);
      case 'get_patient':
        return Promise.resolve(patient);
      case 'get_household_with_people':
        return Promise.resolve(household);
      case 'update_appointment':
        return Promise.resolve({ ...detail, ...args.input });
      case 'get_patients':
      case 'get_rooms':
      case 'get_all_households':
        return Promise.resolve([]);
      default:
        return Promise.resolve(null);
    }
  });
}

function renderDrawer(onClose = vi.fn()) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <AppointmentDrawer appointmentId={4} onClose={onClose} /> },
      { path: '/patients/:id', element: <div>patient page</div> },
      { path: '/medical-records/:id', element: <div>record page</div> },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <RouterProvider router={router} />
      </App>
    </QueryClientProvider>,
  );
  return { router, onClose };
}

const calls = (cmd: string) => invokeMock.mock.calls.filter((c) => c[0] === cmd).map((c) => c[1]);

beforeEach(() => {
  invokeMock.mockReset();
  backend();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('Appointment panel', () => {
  it('shows the visit: room, patient, owner with phone, reason, notes, status and Google state', async () => {
    renderDrawer();

    expect(await screen.findByText('Exam A')).toBeInTheDocument();
    expect(screen.getAllByText(/Шарко/).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Ана Петровска/)).toBeInTheDocument();
    expect(screen.getByText(/070 123 456/)).toBeInTheDocument();
    expect(screen.getByText('Vaccination')).toBeInTheDocument();
    expect(screen.getByText('Second dose, bring the booklet')).toBeInTheDocument();
    expect(screen.getByText('appointments:status.scheduled')).toBeInTheDocument();
    expect(screen.getByText('appointments:drawer.google.synced')).toBeInTheDocument();
  });

  it("shows the patient's alert chips", async () => {
    renderDrawer();
    expect(await screen.findByText(/patients:chart.alerts.short.allergy/)).toBeInTheDocument();
  });

  it('checks the patient in with one click', async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.checkIn/ }));

    await waitFor(() => expect(calls('update_appointment')).toHaveLength(1));
    expect(calls('update_appointment')[0]).toEqual({ id: 4, input: { status: 'checked_in' } });
  });

  it('shows the arrival time and the wait once checked in', async () => {
    const arrived = new Date(Date.now() - 12 * 60_000).toISOString();
    backend({ get_appointment: () => ({ ...detail, status: 'checked_in', checked_in_at: arrived }) });
    renderDrawer();

    expect(await screen.findByText('appointments:status.checkedIn')).toBeInTheDocument();
    expect(screen.getByText(/appointments:drawer.waiting/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /appointments:actions.startConsult/ })).toBeInTheDocument();
  });

  it('marks a no-show and cancels with one click each', async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.markNoShow/ }));
    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.cancelAppointment/ }));

    await waitFor(() => expect(calls('update_appointment')).toHaveLength(2));
    expect(calls('update_appointment').map((a) => a.input.status)).toEqual(['no_show', 'cancelled']);
  });

  it('opens the patient', async () => {
    const { router } = renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.openPatient/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/patients/21'));
  });

  it('starts the record titled with the visit reason', async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.startRecord/ }));

    expect(await screen.findByTestId('record-default-title')).toHaveTextContent('Vaccination');
  });

  it('starts a record: the visit goes to in consult, the record modal opens, and the saved record is linked', async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.startRecord/ }));

    expect(await screen.findByTestId('record-modal')).toHaveTextContent('Шарко');
    await waitFor(() => expect(calls('update_appointment')[0]).toEqual({ id: 4, input: { status: 'in_progress' } }));

    fireEvent.click(screen.getByText('stub-save-record'));

    await waitFor(() =>
      expect(calls('update_appointment')).toContainEqual({ id: 4, input: { medical_record_id: 55 } }),
    );
  });

  it('opens the linked record', async () => {
    backend({ get_appointment: () => ({ ...detail, status: 'in_progress', medical_record_id: 55 }) });
    const { router } = renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:drawer.openRecord/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/medical-records/55'));
  });

  it('deletes after a confirmation', async () => {
    const { onClose } = renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.delete/ }));
    const dialog = await screen.findByRole('dialog', { name: /appointments:messages.deleteTitle/ });
    expect(calls('delete_appointment')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: /appointments:actions.delete/ }));

    await waitFor(() => expect(calls('delete_appointment')).toEqual([{ id: 4 }]));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('duplicates to a chosen date', async () => {
    backend({ duplicate_appointment: () => ({ ...detail, id: 9 }) });
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.duplicate/ }));
    const dialog = await screen.findByRole('dialog', { name: /appointments:messages.duplicateTitle/ });
    const input = within(dialog).getByRole('textbox');
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: '14.02.2030' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: /appointments:actions.duplicate/ }));

    await waitFor(() => expect(calls('duplicate_appointment')).toHaveLength(1));
    const target = new Date(calls('duplicate_appointment')[0].input.target_date);
    expect(target.getFullYear()).toBe(2030);
    expect(target.getMonth()).toBe(1);
    expect(target.getDate()).toBe(14);
  });

  it('reschedules to a new day and time and keeps the length', async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.reschedule/ }));
    const dialog = await screen.findByRole('dialog', { name: /appointments:reschedule.title/ });
    const [dateInput, timeInput] = within(dialog).getAllByRole('textbox');
    fireEvent.mouseDown(dateInput);
    fireEvent.change(dateInput, { target: { value: '11.01.2030' } });
    fireEvent.keyDown(dateInput, { key: 'Enter' });
    fireEvent.mouseDown(timeInput);
    fireEvent.change(timeInput, { target: { value: '14:15' } });
    fireEvent.keyDown(timeInput, { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: /appointments:reschedule.save/ }));

    await waitFor(() => expect(calls('update_appointment')).toHaveLength(1));
    const { start_time, end_time } = calls('update_appointment')[0].input;
    const start = new Date(start_time);
    expect(start.getDate()).toBe(11);
    expect(start.getHours()).toBe(14);
    expect(start.getMinutes()).toBe(15);
    expect(new Date(end_time).getTime() - start.getTime()).toBe(30 * 60_000);
  });

  it('opens the edit form with this appointment', async () => {
    renderDrawer();

    fireEvent.click(await screen.findByRole('button', { name: /appointments:actions.edit/ }));

    expect(await screen.findByText('appointments:editAppointment')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Vaccination')).toBeInTheDocument();
  });

  it('shows a failed load as an error with retry', async () => {
    backend({ get_appointment: () => Promise.reject(new Error('database is locked')) });
    renderDrawer();
    expect(await screen.findByText('appointments:drawer.loadFailed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /common:retry/ })).toBeInTheDocument();
  });
});
