import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

import { LabsTab } from '../LabsTab';
import type { LabResultRow } from '../../../types/labResults';

let nextId = 1;
function v(over: Partial<LabResultRow>): LabResultRow {
  return {
    id: nextId++,
    patientId: 3,
    medicalRecordId: 7,
    recordName: 'Bloods',
    attachmentId: 1,
    deviceType: 'exigo_eos_vet',
    deviceName: 'Exigo',
    sampleAt: '2026-07-10T14:52:11',
    code: 'WBC',
    name: 'WBC - леукоцити',
    position: 3,
    valueText: '10.4',
    valueNum: 10.4,
    unit: '10e+9/L',
    refLow: 6,
    refHigh: 17,
    rangeText: '6.0 - 17.0',
    flag: 'N',
    ...over,
  };
}

const VALUES = [
  v({ attachmentId: 3, deviceType: 'mnchip_pointcare_chemistry', code: 'ALT', name: 'ALT', position: 7, sampleAt: '2026-07-17T09:30:00', valueText: '120', valueNum: 120, unit: 'U/L', rangeText: '10-100', flag: 'H' }),
  v({ attachmentId: 2, sampleAt: '2026-07-17T09:00:00', valueText: '18.0', valueNum: 18, flag: 'H' }),
  v({ attachmentId: 1, sampleAt: '2026-07-10T14:52:11' }),
];

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <LabsTab patientId={3} />
      </App>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  localStorage.clear();
});

describe('Labs tab', () => {
  it('shows each analyte by date, newest left, with its unit, range and H/L flag', async () => {
    invokeMock.mockResolvedValue(VALUES);
    renderTab();

    expect(await screen.findByText('WBC')).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith('get_patient_lab_results', { patientId: 3 });
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.findIndex((h) => h?.includes('17.07.2026'))).toBeLessThan(headers.findIndex((h) => h?.includes('10.07.2026')));
    expect(screen.getByText('18.0')).toBeInTheDocument();
    expect(screen.getByText('10.4')).toBeInTheDocument();
    expect(screen.getAllByLabelText('devices:labs.flags.H')).toHaveLength(2);
    expect(screen.getByText('6.0 - 17.0')).toBeInTheDocument();
    expect(screen.getByText('U/L')).toBeInTheDocument();
  });

  it('opens the trend of an analyte with its reference band when clicked', async () => {
    invokeMock.mockResolvedValue(VALUES);
    renderTab();

    fireEvent.click(await screen.findByText('WBC'));

    const chart = await screen.findByRole('img', { name: 'devices:labs.trend.label|WBC' });
    expect(chart.querySelectorAll('circle')).toHaveLength(2);
    expect(chart.querySelector('[data-testid="reference-band"]')).not.toBeNull();
  });

  it('filters by machine', async () => {
    invokeMock.mockResolvedValue(VALUES);
    renderTab();
    await screen.findByText('WBC');

    fireEvent.click(screen.getByText('devices:labs.panels.chemistry'));

    await waitFor(() => expect(screen.queryByText('WBC')).not.toBeInTheDocument());
    expect(screen.getByText('ALT')).toBeInTheDocument();
  });

  it('says when the patient has no lab results', async () => {
    invokeMock.mockResolvedValue([]);
    renderTab();

    expect(await screen.findByText('devices:labs.empty')).toBeInTheDocument();
  });

  it('shows a load failure with Retry instead of an empty table', async () => {
    invokeMock.mockRejectedValue(new Error('db locked'));
    renderTab();

    expect(await screen.findByText('devices:labs.loadFailed')).toBeInTheDocument();
    expect(screen.queryByText('devices:labs.empty')).not.toBeInTheDocument();
    invokeMock.mockResolvedValue(VALUES);
    fireEvent.click(screen.getByRole('button', { name: /common:retry/ }));
    expect(await screen.findByText('WBC')).toBeInTheDocument();
  });
});
