import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../hooks/usePatients', () => ({
  usePatients: () => ({ patients: [{ id: 7, name: 'Rex', species: 'Dog' }] }),
}));

vi.mock('../../../hooks/useRooms', () => ({
  useRooms: () => ({ data: [] }),
}));

vi.mock('@/services/invoke', () => ({ invoke: () => Promise.resolve([]) }));

const checkConflicts = vi.fn();
vi.mock('../../../services/appointmentService', () => ({
  default: {
    checkConflicts: (...a: unknown[]) => checkConflicts(...a),
    generateTimeSlots: () => [],
  },
}));

import AppointmentModal from '../AppointmentModal';

const appointment = {
  id: 1,
  patientId: 7,
  title: 'Vaccination',
  description: '',
  startTime: '2030-01-10T09:00:00.000Z',
  endTime: '2030-01-10T09:30:00.000Z',
  roomId: undefined,
  status: 'scheduled',
} as never;

const rooms = [{ id: 3, name: 'Exam 1', capacity: 1 }];

function renderModal(onSave: (d: unknown) => Promise<void>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <AppointmentModal open mode="edit" appointment={appointment} onCancel={vi.fn()} onSave={onSave} rooms={rooms} />
      </App>
    </QueryClientProvider>,
  );
}

describe('AppointmentModal save', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps what was typed when the save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('backend said no'));
    renderModal(onSave);

    const title = await screen.findByDisplayValue('Vaccination');
    fireEvent.change(title, { target: { value: 'Vaccination and nails' } });
    fireEvent.click(screen.getByText('common:update'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByDisplayValue('Vaccination and nails')).toBeInTheDocument();
  });

  it('asks before saving into a room that is over capacity', async () => {
    checkConflicts.mockResolvedValue({
      conflicts: [
        { id: 2, title: 'A', startTime: appointment.startTime, endTime: appointment.endTime },
        { id: 3, title: 'B', startTime: appointment.startTime, endTime: appointment.endTime },
      ],
    });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = renderModal(onSave);
    await screen.findByDisplayValue('Vaccination');

    const roomSelect = container.ownerDocument.querySelectorAll('.ant-select-selector')[1];
    fireEvent.mouseDown(roomSelect);
    fireEvent.click(await screen.findByText(/Exam 1/));
    await waitFor(() => expect(checkConflicts).toHaveBeenCalled());
    await screen.findByText('appointments:conflicts.roomCapacityExceeded');

    fireEvent.click(screen.getByText('common:update'));

    expect(await screen.findByText('appointments:conflicts.confirmTitle')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
