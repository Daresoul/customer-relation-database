import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o ? `${key} ${Object.values(o).join(' ')}` : key),
  }),
}));

vi.mock('../../../hooks/usePatients', () => ({
  usePatients: () => ({
    patients: [
      { id: 7, name: 'Rex', species: 'Dog', isActive: true, householdId: 1, microchipId: '807123456783456' },
      { id: 8, name: 'Rex', species: 'Dog', isActive: true, householdId: 2 },
    ],
  }),
}));
vi.mock('../../../hooks/useRooms', () => ({ useRooms: () => ({ data: [] }) }));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

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
  patientName: 'Rex',
  title: 'Vaccination',
  description: '',
  startTime: '2030-01-10T09:00:00.000Z',
  endTime: '2030-01-10T09:30:00.000Z',
  roomId: 3,
  status: 'scheduled',
} as never;

const rooms = [{ id: 3, name: 'Exam 1', capacity: 2 }];

function renderModal(onSave = vi.fn().mockResolvedValue(undefined), mode: 'edit' | 'create' = 'edit') {
  if (!checkConflicts.getMockImplementation()) checkConflicts.mockResolvedValue({ conflicts: [], patientConflicts: [] });
  invokeMock.mockImplementation((cmd: string) =>
    Promise.resolve(
      cmd === 'get_all_households'
        ? [
            { household: { id: 1, household_name: 'Петровски' }, people: [] },
            { household: { id: 2, householdName: 'Stojanovski' }, people: [] },
          ]
        : null,
    ),
  );
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <AppointmentModal
          open
          mode={mode}
          appointment={mode === 'edit' ? appointment : null}
          initialDate={new Date(2030, 0, 10)}
          onCancel={vi.fn()}
          onSave={onSave}
          rooms={rooms}
        />
      </App>
    </QueryClientProvider>,
  );
  return { ...view, onSave };
}

const selectors = () => document.querySelectorAll('.ant-select-selector');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('AppointmentModal edits', () => {
  it('the patient picker tells two pets with the same name apart by owner and chip', async () => {
    renderModal();
    await screen.findByDisplayValue('Vaccination');

    fireEvent.mouseDown(selectors()[0]);

    // antd renders each option twice (visible list + accessible listbox).
    expect((await screen.findAllByText(/Петровски/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Stojanovski/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3456/).length).toBeGreaterThan(0);
  });

  it('saves a changed patient', async () => {
    const { onSave } = renderModal();
    await screen.findByDisplayValue('Vaccination');

    fireEvent.mouseDown(selectors()[0]);
    fireEvent.click((await screen.findAllByText(/Stojanovski/))[0]);
    fireEvent.click(screen.getByText('common:update'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ patientId: 8 }));
  });

  it('sends an explicit null when the room is cleared', async () => {
    const { onSave, container } = renderModal();
    await screen.findByDisplayValue('Vaccination');

    const roomSelect = selectors()[1].closest('.ant-select') as HTMLElement;
    fireEvent.mouseEnter(roomSelect);
    const clear = container.ownerDocument.querySelector('.ant-select-clear') as HTMLElement;
    fireEvent.mouseDown(clear);
    fireEvent.click(clear);
    fireEvent.click(screen.getByText('common:update'));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toHaveProperty('roomId', null);
  });

  it('warns when the same patient is already booked at that time, even without a room', async () => {
    checkConflicts.mockResolvedValue({
      conflicts: [],
      patientConflicts: [
        { id: 9, title: 'Nails', startTime: '2030-01-10T09:15:00.000Z', endTime: '2030-01-10T09:45:00.000Z' },
      ],
    });
    renderModal(undefined, 'create');

    fireEvent.mouseDown(selectors()[0]);
    fireEvent.click((await screen.findAllByText(/Петровски/))[0]);

    await waitFor(() =>
      expect(checkConflicts).toHaveBeenCalledWith(expect.objectContaining({ patientId: 7 })),
    );
    expect(await screen.findByText('appointments:conflicts.samePatientTitle')).toBeInTheDocument();
    expect(screen.getByText(/Nails/)).toBeInTheDocument();
  });
});
