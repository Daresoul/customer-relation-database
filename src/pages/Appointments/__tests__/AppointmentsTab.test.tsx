import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Appointment } from '../../../types/appointments';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createAppointment = vi.fn();
const updateAppointment = vi.fn();
const refetchCalendar = vi.fn();
const calendarCalls: Array<{ start: Date; end: Date; filter?: Record<string, unknown> }> = [];
vi.mock('../../../hooks/useAppointments', () => ({
  useAppointments: () => ({
    createAppointment,
    updateAppointment,
    deleteAppointment: vi.fn(),
    duplicateAppointment: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  }),
  useAppointmentDetail: () => ({ data: undefined }),
  useCalendarAppointments: (start: Date, end: Date, filter?: Record<string, unknown>) => {
    calendarCalls.push({ start, end, filter });
    return { data: { appointments: [] }, isLoading: false, error: null, refetch: refetchCalendar };
  },
}));

const bella = { id: 4, patientId: 20, patientName: 'Bella', status: 'scheduled' } as Appointment;

vi.mock('../../../hooks/useRooms', () => ({ useRooms: () => ({ data: [] }) }));
vi.mock('../../../hooks/usePatients', () => ({
  usePatients: () => ({ patients: [{ id: 20, name: 'Bella', species: 'Cat', isActive: true }] }),
}));
const googleSettings: { needs_reauth: boolean } = { needs_reauth: false };
vi.mock('@/services/invoke', () => ({
  invoke: (cmd: string) =>
    cmd === 'get_google_calendar_settings' ? Promise.resolve({ ...googleSettings }) : Promise.resolve([]),
}));
vi.mock('../../../components/AppointmentCalendar/AppointmentCalendar', () => ({
  default: ({
    onSelectAppointment,
    onRangeChange,
  }: {
    onSelectAppointment: (a: Appointment) => void;
    onRangeChange?: (s: Date, e: Date) => void;
  }) => (
    <div>
      <button onClick={() => onSelectAppointment(bella)}>stub-calendar-card</button>
      <button onClick={() => onRangeChange?.(new Date(2030, 4, 1), new Date(2030, 4, 31, 23, 59))}>stub-page-to-may</button>
    </div>
  ),
}));
vi.mock('../../../components/AppointmentCalendar/TodaysAppointments', () => ({
  default: () => <div>stub-today-grid</div>,
}));
vi.mock('../../../components/AppointmentCalendar/WaitingRoomList', () => ({
  default: ({
    onSelect,
    onStatusChange,
  }: {
    onSelect: (a: Appointment) => void;
    onStatusChange: (a: Appointment, s: string) => void;
  }) => (
    <div>
      stub-waiting-list
      <button onClick={() => onSelect(bella)}>stub-row</button>
      <button onClick={() => onStatusChange(bella, 'checked_in')}>stub-check-in</button>
    </div>
  ),
}));
vi.mock('../../../components/AppointmentDrawer/AppointmentDrawer', () => ({
  AppointmentDrawer: ({ appointmentId }: { appointmentId: number | null }) =>
    appointmentId ? <div>stub-panel-{appointmentId}</div> : null,
}));

const saveOutcome: { error?: unknown } = {};
vi.mock('../../../components/AppointmentModal/AppointmentModal', () => ({
  default: ({ open, onSave }: { open: boolean; onSave: (d: unknown) => Promise<void> }) =>
    open ? (
      <button
        onClick={() =>
          onSave({ title: 'x' }).then(
            () => {
              saveOutcome.error = undefined;
            },
            (e) => {
              saveOutcome.error = e;
            },
          )
        }
      >
        stub-save
      </button>
    ) : null,
}));

import AppointmentsTab from '../AppointmentsTab';

function renderTab() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <AppointmentsTab /> },
      { path: '/settings', element: <div>stub-settings</div> },
    ],
    { initialEntries: ['/'] },
  );
  const utils = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <RouterProvider router={router} />
      </App>
    </QueryClientProvider>,
  );
  return { ...utils, router };
}

describe('AppointmentsTab save', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    calendarCalls.length = 0;
    document.body.innerHTML = '';
  });

  it('keeps the form open and shows no success when the backend refuses', async () => {
    createAppointment.mockRejectedValue(new Error('room is closed'));
    renderTab();

    fireEvent.click(screen.getByText('appointments:newAppointment'));
    fireEvent.click(screen.getByText('stub-save'));

    await waitFor(() => expect(saveOutcome.error).toBeInstanceOf(Error));
    expect(screen.getByText('stub-save')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('appointments:messages.createdSuccess');
  });

  it('shows one success and closes after the backend confirms', async () => {
    createAppointment.mockResolvedValue({ id: 9 });
    renderTab();

    fireEvent.click(screen.getByText('appointments:newAppointment'));
    fireEvent.click(screen.getByText('stub-save'));

    await waitFor(() => expect(document.body.textContent).toContain('appointments:messages.createdSuccess'));
    expect(document.body.textContent?.split('appointments:messages.createdSuccess').length).toBe(2);
    expect(screen.queryByText('stub-save')).not.toBeInTheDocument();
  });

  it('moves the Today window to the new day after midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2030, 0, 10, 23, 59, 0));
    renderTab();
    expect(calendarCalls.at(-1)!.start.getDate()).toBe(10);

    vi.setSystemTime(new Date(2030, 0, 11, 0, 1, 0));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(calendarCalls.at(-1)!.start.getDate()).toBe(11);
  });

  it('moves the Today window when the window regains focus on a new day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 0, 10, 18, 0, 0));
    renderTab();

    vi.setSystemTime(new Date(2030, 0, 11, 8, 0, 0));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(calendarCalls.at(-1)!.start.getDate()).toBe(11);
  });
});

describe('AppointmentsTab panel, Today list and data range', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    calendarCalls.length = 0;
    document.body.innerHTML = '';
  });

  it('Today opens as the waiting-room list, with the grid one click away', () => {
    renderTab();

    expect(screen.getByText(/stub-waiting-list/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('appointments:views.grid'));
    expect(screen.getByText('stub-today-grid')).toBeInTheDocument();
  });

  it('opens the appointment panel from the Today list, not the edit form', () => {
    renderTab();

    fireEvent.click(screen.getByText('stub-row'));

    expect(screen.getByText('stub-panel-4')).toBeInTheDocument();
    expect(screen.queryByText('stub-save')).not.toBeInTheDocument();
  });

  it('opens the appointment panel from a calendar card', () => {
    renderTab();
    fireEvent.click(screen.getByText('appointments:tabs.calendarView'));

    fireEvent.click(screen.getByText('stub-calendar-card'));

    expect(screen.getByText('stub-panel-4')).toBeInTheDocument();
  });

  it('changes a status from the Today list in one click', async () => {
    updateAppointment.mockResolvedValue({ ...bella, status: 'checked_in' });
    renderTab();

    fireEvent.click(screen.getByText('stub-check-in'));

    await waitFor(() => expect(updateAppointment).toHaveBeenCalledWith({ id: 4, input: { status: 'checked_in' } }));
  });

  it('shows cancelled and no-show visits so they can be styled', () => {
    renderTab();
    expect(calendarCalls.at(-1)!.filter).toEqual(expect.objectContaining({ includeCancelled: true }));
  });

  it('the calendar fetches the range it shows', () => {
    renderTab();
    fireEvent.click(screen.getByText('appointments:tabs.calendarView'));

    fireEvent.click(screen.getByText('stub-page-to-may'));

    const last = calendarCalls.at(-1)!;
    expect(last.start.getMonth()).toBe(4);
    expect(last.end.getMonth()).toBe(4);
  });

  it('Refresh refetches what is on screen', () => {
    renderTab();

    fireEvent.click(screen.getByText('appointments:calendar.refresh'));

    expect(refetchCalendar).toHaveBeenCalled();
  });
});

describe('AppointmentsTab Google banner and patient filter', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    calendarCalls.length = 0;
    googleSettings.needs_reauth = false;
    document.body.innerHTML = '';
  });

  it('says so when Google needs reconnecting, with a way to Settings', async () => {
    googleSettings.needs_reauth = true;
    const { router } = renderTab();

    expect(await screen.findByText('appointments:google.reauthBanner')).toBeInTheDocument();
    fireEvent.click(screen.getByText('appointments:google.reconnect'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    expect(router.state.location.search).toBe('?section=appointments');
  });

  it('shows no Google banner while the connection is fine', async () => {
    renderTab();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('appointments:google.reauthBanner')).not.toBeInTheDocument();
  });

  it('filters by patient', async () => {
    const { container } = renderTab();
    fireEvent.click(screen.getByText('appointments:filters.filter'));
    await screen.findByText('appointments:filters.patient');

    const patientSelect = container.ownerDocument.querySelector('[data-testid="patient-filter"] .ant-select-selector')!;
    fireEvent.mouseDown(patientSelect);
    fireEvent.click(await screen.findByText('Bella · Cat'));

    await waitFor(() => expect(calendarCalls.at(-1)!.filter).toEqual(expect.objectContaining({ patientId: 20 })));
  });
});
