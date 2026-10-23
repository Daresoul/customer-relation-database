import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import dayjs from 'dayjs';

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

const rooms = [{ id: 3, name: 'Exam 1', capacity: 1 }];

function renderModal(props: Record<string, unknown> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <AppointmentModal open mode="create" onCancel={vi.fn()} onSave={vi.fn()} rooms={rooms} {...props} />
      </App>
    </QueryClientProvider>,
  );
}

describe('AppointmentModal create', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('starts today at the next 15-minute slot after now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(dayjs().hour(10).minute(7).second(0).toDate());
    renderModal();

    expect(await screen.findByDisplayValue('10:15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10:45')).toBeInTheDocument();
  });

  it('starts another day at 09:00', async () => {
    renderModal({ initialDate: dayjs().add(3, 'day').toDate() });

    expect(await screen.findByDisplayValue('09:00')).toBeInTheDocument();
  });

  it('warns when the start is already in the past', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(dayjs().hour(10).minute(7).second(0).toDate());
    const start = dayjs().hour(8).minute(0).second(0);
    renderModal({ initialDate: start.toDate(), initialEndDate: start.add(30, 'minute').toDate() });

    expect(await screen.findByText('appointments:validation.startInPast')).toBeInTheDocument();
  });

  it('has the given patient picked', async () => {
    renderModal({ initialPatientId: 7 });

    expect(await screen.findByText('Rex · Dog')).toBeInTheDocument();
  });

  it('keeps a warning on screen while the conflict check fails, until one succeeds', async () => {
    checkConflicts.mockRejectedValueOnce(new Error('db busy'));
    const { container } = renderModal({ initialPatientId: 7, initialDate: dayjs().add(3, 'day').toDate() });
    await screen.findByText('Rex · Dog');

    const roomSelect = container.ownerDocument.querySelectorAll('.ant-select-selector')[1];
    fireEvent.mouseDown(roomSelect);
    fireEvent.click(await screen.findByText(/Exam 1/));

    expect(await screen.findByText('appointments:validation.conflictCheckFailed')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('appointments:validation.conflictCheckFailed')).toBeInTheDocument();

    checkConflicts.mockResolvedValueOnce({ conflicts: [], patientConflicts: [] });
    // Clearing the room runs the check again (the patient is still there).
    fireEvent.mouseDown(container.ownerDocument.querySelector('.ant-select-clear')!);

    await waitFor(() => expect(checkConflicts).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText('appointments:validation.conflictCheckFailed')).not.toBeInTheDocument(),
    );
  });
});
