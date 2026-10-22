import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createAppointment = vi.fn();
const calendarCalls: Array<{ start: Date; end: Date }> = [];
vi.mock('../../../hooks/useAppointments', () => ({
  useAppointments: () => ({
    appointments: [],
    createAppointment,
    updateAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
    duplicateAppointment: vi.fn(),
    refetch: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    isLoading: false,
    error: null,
  }),
  useAppointmentDetail: () => ({ data: undefined }),
  useCalendarAppointments: (start: Date, end: Date) => {
    calendarCalls.push({ start, end });
    return { data: { appointments: [] }, isLoading: false, error: null, refetch: vi.fn() };
  },
}));

vi.mock('../../../hooks/useRooms', () => ({ useRooms: () => ({ data: [] }) }));
vi.mock('../../../components/AppointmentCalendar/AppointmentCalendar', () => ({ default: () => null }));
vi.mock('../../../components/AppointmentList/AppointmentList', () => ({ default: () => null }));
vi.mock('../../../components/AppointmentCalendar/TodaysAppointments', () => ({ default: () => null }));

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
  return render(
    <App>
      <AppointmentsTab />
    </App>,
  );
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
