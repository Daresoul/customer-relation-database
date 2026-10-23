import type React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => (o && 'minutes' in o ? `${key}:${o.minutes}` : key) }),
}));
vi.mock('../../../hooks/useRooms', () => ({ useRooms: () => ({ data: [{ id: 3, name: 'Exam A', color: '#123456' }] }) }));

import WaitingRoomList from '../WaitingRoomList';
import type { Appointment } from '../../../types/appointments';

const at = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const apt = (over: Partial<Appointment>): Appointment =>
  ({
    id: 1,
    patientId: 20,
    title: 'Check-up',
    startTime: at(9),
    endTime: at(9, 30),
    status: 'scheduled',
    createdAt: '',
    updatedAt: '',
    createdBy: 'system',
    patientName: 'Bella',
    ...over,
  }) as Appointment;

function renderList(appointments: Appointment[], handlers: Partial<React.ComponentProps<typeof WaitingRoomList>> = {}) {
  const onSelect = vi.fn();
  const onStatusChange = vi.fn();
  render(
    <App>
      <WaitingRoomList appointments={appointments} onSelect={onSelect} onStatusChange={onStatusChange} {...handlers} />
    </App>,
  );
  return { onSelect, onStatusChange };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe("Today's waiting-room list", () => {
  it('lists the day in time order with time, patient, reason, room and status', () => {
    renderList([
      apt({ id: 2, startTime: at(11), patientName: 'Шарко', title: 'Vaccination', roomId: 3 }),
      apt({ id: 1, startTime: at(9, 15), patientName: 'Bella' }),
    ]);

    const bella = screen.getByText('Bella');
    const sharko = screen.getByText('Шарко');
    expect(bella.compareDocumentPosition(sharko) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('09:15')).toBeInTheDocument();
    expect(screen.getByText('Vaccination')).toBeInTheDocument();
    expect(screen.getByText('Exam A')).toBeInTheDocument();
    expect(screen.getAllByText('appointments:status.scheduled')).toHaveLength(2);
  });

  it('shows how long a checked-in patient has been waiting', () => {
    const arrived = new Date(Date.now() - 17 * 60_000 - 5_000).toISOString();
    renderList([apt({ status: 'checked_in', checkedInAt: arrived })]);

    expect(screen.getByText('appointments:waiting.waitingFor:17')).toBeInTheDocument();
  });

  it('moves the visit on with one click', () => {
    const { onStatusChange, onSelect } = renderList([apt({ status: 'checked_in', checkedInAt: at(9) })]);

    fireEvent.click(screen.getByRole('button', { name: /appointments:actions.startConsult/ }));

    expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'in_progress');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers no step for a finished visit — reopening is in the panel', () => {
    renderList([apt({ status: 'completed' })]);
    expect(screen.queryByRole('button', { name: /appointments:actions/ })).not.toBeInTheDocument();
  });

  it('opens the panel when a row is clicked', () => {
    const { onSelect } = renderList([apt({ id: 5 })]);

    fireEvent.click(screen.getByText('Bella'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  it('greys and strikes out cancelled and no-show visits', () => {
    renderList([
      apt({ id: 1, status: 'cancelled', patientName: 'Gone' }),
      apt({ id: 2, status: 'no_show', patientName: 'Missed', startTime: at(10) }),
      apt({ id: 3, status: 'scheduled', patientName: 'Live', startTime: at(11) }),
    ]);

    expect(screen.getByText('Gone').closest('[data-closed="true"]')).not.toBeNull();
    expect(screen.getByText('Missed').closest('[data-closed="true"]')).not.toBeNull();
    expect(screen.getByText('Live').closest('[data-closed="true"]')).toBeNull();
  });

  it('says when nobody is booked today', () => {
    renderList([]);
    expect(screen.getByText('appointments:waiting.empty')).toBeInTheDocument();
  });
});
