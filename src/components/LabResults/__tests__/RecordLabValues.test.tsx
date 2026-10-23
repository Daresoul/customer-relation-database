import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? [key, ...Object.values(opts)].join('|') : key,
  }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { RecordLabValues } from '../RecordLabValues';
import type { RecordLabValue } from '../../../types/labResults';

function value(over: Partial<RecordLabValue>): RecordLabValue {
  return {
    id: 1,
    patientId: 3,
    medicalRecordId: 7,
    attachmentId: 2,
    deviceType: 'exigo_eos_vet',
    sampleAt: '2026-07-17T09:00:00',
    code: 'WBC',
    name: 'WBC - леукоцити',
    position: 3,
    valueText: '18.0',
    valueNum: 18,
    unit: '10e+9/L',
    refLow: 6,
    refHigh: 17,
    rangeText: '6.0 - 17.0',
    flag: 'H',
    previous: null,
    ...over,
  };
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <RecordLabValues recordId={7} attachmentsKey="2" />
      </App>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  localStorage.clear();
});

describe('Record lab values', () => {
  it('shows each value with its flag and an arrow against the previous one', async () => {
    invokeMock.mockResolvedValue([
      value({ previous: { valueText: '10.4', valueNum: 10.4, flag: 'N', sampleAt: '2026-07-10T14:52:11' } }),
      value({ id: 2, code: 'PLT', name: 'PLT', valueText: '250', valueNum: 250, flag: 'N', previous: { valueText: '300', valueNum: 300, flag: 'N', sampleAt: '2026-07-10T14:52:11' } }),
      value({ id: 3, code: 'HGB', name: 'HGB', valueText: '14', valueNum: 14, flag: 'N' }),
    ]);
    renderCard();

    expect(await screen.findByText('WBC')).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith('get_record_lab_values', { medicalRecordId: 7 });
    expect(screen.getByLabelText('devices:labs.flags.H')).toBeInTheDocument();
    expect(screen.getByLabelText('devices:labs.record.up')).toBeInTheDocument();
    expect(screen.getByLabelText('devices:labs.record.down')).toBeInTheDocument();
    expect(screen.getByText('10.4')).toBeInTheDocument();
    expect(screen.getByText('10/07/2026')).toBeInTheDocument();
  });

  it('shows nothing on a record without lab values', async () => {
    invokeMock.mockResolvedValue([]);
    const { container } = renderCard();

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
