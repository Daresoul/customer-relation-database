import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('../../../hooks/useRooms', () => ({ useRooms: () => ({ data: [] }) }));
vi.mock('../../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));

import AppointmentCalendar from '../AppointmentCalendar';
import type { Appointment, CalendarView } from '../../../types/appointments';

const today = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const apt = (over: Partial<Appointment>): Appointment =>
  ({
    id: 1,
    patientId: 20,
    title: 'Check-up',
    startTime: today(9),
    endTime: today(10),
    status: 'scheduled',
    createdAt: '',
    updatedAt: '',
    createdBy: 'system',
    patientName: 'Bella',
    ...over,
  }) as Appointment;

function renderCalendar(view: CalendarView, appointments: Appointment[]) {
  const props = {
    onSelectAppointment: vi.fn(),
    onCreateAppointment: vi.fn(),
    onViewChange: vi.fn(),
    onRangeChange: vi.fn(),
    onStatusChange: vi.fn(),
  };
  render(
    <App>
      <AppointmentCalendar appointments={appointments} view={view} {...props} />
    </App>,
  );
  return props;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('Calendar cards', () => {
  it('day cards lead with the patient name and carry the status', () => {
    renderCalendar('day', [apt({ status: 'checked_in' })]);

    const card = screen.getByText('Bella').closest('[data-status]');
    expect(card).toHaveAttribute('data-status', 'checked_in');
    expect(screen.getByText('Check-up')).toBeInTheDocument();
  });

  it('week cards lead with the patient name too', () => {
    renderCalendar('week', [apt({ patientName: 'Шарко' })]);
    expect(screen.getByText('Шарко').closest('[data-status]')).toHaveAttribute('data-status', 'scheduled');
  });

  it('cancelled and no-show cards are marked closed', () => {
    renderCalendar('day', [
      apt({ id: 1, status: 'cancelled', patientName: 'Gone' }),
      apt({ id: 2, status: 'no_show', patientName: 'Missed', startTime: today(11), endTime: today(12) }),
    ]);

    expect(screen.getByText('Gone').closest('[data-closed="true"]')).not.toBeNull();
    expect(screen.getByText('Missed').closest('[data-closed="true"]')).not.toBeNull();
  });

  it('a right click on a card offers the next statuses', async () => {
    const { onStatusChange, onSelectAppointment } = renderCalendar('day', [apt({ id: 7 })]);

    fireEvent.contextMenu(screen.getByText('Bella'));
    fireEvent.click(await screen.findByText('appointments:actions.checkIn'));

    expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 'checked_in');
    expect(onSelectAppointment).not.toHaveBeenCalled();
  });

  it('a click on a card opens it', () => {
    const { onSelectAppointment } = renderCalendar('day', [apt({ id: 7 })]);

    fireEvent.click(screen.getByText('Bella'));

    expect(onSelectAppointment).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('month badges show the patient name', () => {
    renderCalendar('month', [apt({ patientName: 'Шарко', title: 'Vaccination' })]);
    expect(screen.getByText(/Шарко/)).toBeInTheDocument();
  });

  it('reports the visible range, and the new one after paging', async () => {
    const { onRangeChange } = renderCalendar('month', []);

    await waitFor(() => expect(onRangeChange).toHaveBeenCalled());
    const [start, end] = onRangeChange.mock.calls.at(-1)!;
    const now = new Date();
    expect(start.getTime()).toBeLessThanOrEqual(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
    expect(end.getTime()).toBeGreaterThanOrEqual(new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime());

    fireEvent.click(screen.getByRole('button', { name: /right/i }));

    await waitFor(() => {
      const [nextStart] = onRangeChange.mock.calls.at(-1)!;
      expect(nextStart.getTime()).toBeGreaterThan(start.getTime() + 20 * 24 * 3600_000);
    });
  });
});
