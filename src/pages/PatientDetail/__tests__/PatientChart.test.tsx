import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import dayjs from 'dayjs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? [key, ...Object.values(opts)].join('|') : key,
  }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { PatientBanner } from '../chart/PatientBanner';
import { MarkDeceasedModal } from '../chart/MarkDeceasedModal';
import { WeightLogCard } from '../chart/WeightLogCard';
import type { PatientDetail } from '../../../types/patient';

const TODAY = dayjs().format('YYYY-MM-DD');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App>{children}</App>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function rex(overrides: Partial<PatientDetail> = {}): PatientDetail {
  return {
    id: 3,
    name: 'Rex',
    species: 'Dog',
    breed: 'Beagle',
    gender: 'Female',
    neutered: true,
    dateOfBirth: dayjs().subtract(5, 'week').subtract(2, 'day').format('YYYY-MM-DD'),
    weight: 12.4,
    lastWeightAt: '2026-03-03',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    alerts: [{ id: 1, patientId: 3, alertType: 'allergy', note: 'Penicillin', createdAt: '' }],
    household: {
      id: 8,
      householdName: 'Petrovski',
      primaryContact: {
        id: 1,
        firstName: 'Ana',
        lastName: 'Petrovska',
        isPrimary: true,
        contacts: [{ id: 1, type: 'phone', value: '070 123 456', isPrimary: true }],
      },
    },
    ...overrides,
  } as PatientDetail;
}

function answer(map: Record<string, unknown>) {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd in map) {
      const v = map[cmd];
      if (v instanceof Error) throw v;
      return v;
    }
    return null;
  });
}

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  document.body.innerHTML = '';
});

describe('patient banner', () => {
  it('shows who the animal is at a glance', async () => {
    answer({ get_patient_weights: [] });
    render(<PatientBanner patient={rex()} onDelete={vi.fn()} />, { wrapper });

    expect(screen.getByRole('heading', { name: 'Rex' })).toBeInTheDocument();
    expect(screen.getByText(/Beagle/)).toBeInTheDocument();
    expect(screen.getByText('patients:chart.sex.femaleSpayed')).toBeInTheDocument();
    expect(screen.getByText('patients:chart.age.weeks|5')).toBeInTheDocument();
    expect(screen.getByText('patients:chart.banner.weightOn|12.4|03/03/2026')).toBeInTheDocument();
    expect(screen.getByText('Ana Petrovska')).toBeInTheDocument();
    expect(screen.getByText('070 123 456')).toBeInTheDocument();
    expect(screen.getByText(/patients:chart.alerts.short.allergy/)).toBeInTheDocument();
  });

  it('shows a deceased patient as deceased, with its date', () => {
    answer({ get_patient_weights: [] });
    render(
      <PatientBanner patient={rex({ isActive: false, deceasedAt: '2026-01-05' })} onDelete={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByText('patients:chart.status.deceasedOn|05/01/2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /patients:chart.banner.addWeight/ })).not.toBeInTheDocument();
  });

  it('adds a weight dated today from the banner', async () => {
    answer({ get_patient_weights: [], add_patient_weight: { id: 9 } });
    render(<PatientBanner patient={rex()} onDelete={vi.fn()} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: /patients:chart.banner.addWeight/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '12,5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /common:save/ }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('add_patient_weight', {
        patientId: 3,
        weight: 12.5,
        measuredOn: TODAY,
        medicalRecordId: null,
      }),
    );
  });

  it('adds an alert with its type and note', async () => {
    answer({ get_patient_weights: [], add_patient_alert: { id: 2 } });
    render(<PatientBanner patient={rex({ alerts: [] })} onDelete={vi.fn()} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: /patients:chart.banner.editAlerts/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('patients:chart.alerts.types.aggressive'));
    fireEvent.change(within(dialog).getByPlaceholderText('patients:chart.alerts.notePlaceholder'), {
      target: { value: 'Bites' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /patients:chart.alerts.add/ }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('add_patient_alert', {
        patientId: 3,
        alertType: 'aggressive',
        note: 'Bites',
      }),
    );
  });
});

describe('mark as deceased', () => {
  const future = [
    { id: 11, title: 'Vaccine', start_time: '2030-01-10T09:00:00Z', status: 'scheduled' },
    { id: 12, title: 'Check-up', start_time: '2030-02-10T09:00:00Z', status: 'scheduled' },
  ];

  it('lists the future appointments ticked, and cancels the ticked ones after marking', async () => {
    answer({
      get_appointments: { appointments: future, total: 2, has_more: false },
      mark_patient_deceased: { id: 3 },
      update_appointment: { id: 11 },
    });
    render(<MarkDeceasedModal open patient={{ id: 3, name: 'Rex' }} onClose={vi.fn()} />, { wrapper });

    const dialog = await screen.findByRole('dialog');
    const boxes = await within(dialog).findAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => expect(b).toBeChecked());
    fireEvent.click(boxes[1]);
    fireEvent.click(within(dialog).getByRole('button', { name: /patients:chart.deceased.confirm/ }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('mark_patient_deceased', { id: 3, deceasedOn: TODAY, note: null }),
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('update_appointment', expect.objectContaining({ id: 11, input: { status: 'cancelled' } })),
    );
    expect(invokeMock).not.toHaveBeenCalledWith('update_appointment', expect.objectContaining({ id: 12 }));
  });

  it('asks only for future appointments of this patient', async () => {
    answer({ get_appointments: { appointments: [], total: 0, has_more: false } });
    render(<MarkDeceasedModal open patient={{ id: 3, name: 'Rex' }} onClose={vi.fn()} />, { wrapper });

    await screen.findByText('patients:chart.deceased.noFuture');
    const [, args] = invokeMock.mock.calls.find(([cmd]) => cmd === 'get_appointments')!;
    expect(args.filter.patient_id).toBe(3);
    expect(dayjs(args.filter.start_date).isAfter(dayjs().subtract(1, 'minute'))).toBe(true);
  });

  it('says so when the future appointments could not be loaded', async () => {
    answer({ get_appointments: new Error('database is locked') });
    render(<MarkDeceasedModal open patient={{ id: 3, name: 'Rex' }} onClose={vi.fn()} />, { wrapper });

    expect(await screen.findByText('patients:chart.deceased.appointmentsLoadFailed')).toBeInTheDocument();
  });
});

describe('weight log', () => {
  const log = [
    { id: 3, patientId: 3, weight: 12.4, measuredOn: '2026-03-03', medicalRecordId: null },
    { id: 2, patientId: 3, weight: 11, measuredOn: '2026-01-10', medicalRecordId: 55 },
    { id: 1, patientId: 3, weight: 10, measuredOn: '2025-11-01', medicalRecordId: null },
  ];

  it('lists the weights newest first with a trend line', async () => {
    answer({ get_patient_weights: log });
    const { container } = render(<WeightLogCard patientId={3} />, { wrapper });

    await screen.findByText('03/03/2026');
    const dates = screen.getAllByText(/\/20(25|26)$/).map((el) => el.textContent);
    expect(dates).toEqual(['03/03/2026', '10/01/2026', '01/11/2025']);
    const line = container.querySelector('svg polyline');
    expect(line?.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(3);
  });

  it('removes a weight after confirming', async () => {
    answer({ get_patient_weights: log, delete_patient_weight: true });
    render(<WeightLogCard patientId={3} />, { wrapper });

    await screen.findByText('03/03/2026');
    fireEvent.click(screen.getAllByRole('button', { name: /patients:chart.weights.remove/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /common:delete/ }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('delete_patient_weight', { id: 3 }));
  });

  it('says so when the log could not be loaded', async () => {
    answer({ get_patient_weights: new Error('database is locked') });
    render(<WeightLogCard patientId={3} />, { wrapper });

    expect(await screen.findByText('patients:chart.weights.loadFailed')).toBeInTheDocument();
  });
});
