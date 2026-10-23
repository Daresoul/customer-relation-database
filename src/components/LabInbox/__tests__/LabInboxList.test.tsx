import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LabInboxItem } from '@/types/labInbox';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  discard: vi.fn(),
  restore: vi.fn(),
  getDeviceData: vi.fn(),
  move: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, a?: unknown, b?: unknown) => {
      const opts = (typeof a === 'object' && a) || (typeof b === 'object' && b) || undefined;
      if (!opts) return key;
      const vars = Object.entries(opts as Record<string, unknown>)
        .filter(([k]) => k !== 'defaultValue')
        .map(([k, v]) => `${k}=${v}`);
      return [key, ...vars].join(' ');
    },
  }),
}));
vi.mock('@/services/labInboxService', () => ({
  labInboxService: {
    list: mocks.list,
    discard: mocks.discard,
    restore: mocks.restore,
    getDeviceData: mocks.getDeviceData,
    move: mocks.move,
  },
}));
vi.mock('@/hooks/usePatients', () => ({
  usePatients: () => ({ patients: [{ id: 7, name: 'Koko', species: 'Dog' }], refreshPatients: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecords: () => ({ data: { records: [] }, isLoading: false, isError: false }),
}));

import { DeviceImportProvider } from '@/contexts/DeviceImportContext';
import { useDeviceImport } from '@/contexts/useDeviceImport';
import LabInboxList from '../LabInboxList';

let importCtx: ReturnType<typeof useDeviceImport>;
function Probe() {
  importCtx = useDeviceImport();
  return null;
}

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeviceImportProvider>
        <AntApp>
          <MemoryRouter>
            <Probe />
            <LabInboxList />
          </MemoryRouter>
        </AntApp>
      </DeviceImportProvider>
    </QueryClientProvider>,
  );
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function item(overrides: Partial<LabInboxItem> = {}): LabInboxItem {
  return {
    fileId: 'r1',
    originalName: 'BM-53672_1219.xml',
    deviceType: 'exigo_eos_vet',
    deviceName: 'Exigo',
    receivedAt: hoursAgo(1),
    status: 'ok',
    state: 'waiting',
    machinePatientId: 'KOKO',
    matchMethod: 'name',
    matchAmbiguous: false,
    matchCandidates: 1,
    matchedPatientId: 7,
    matchedPatientName: 'Koko',
    values: [
      { code: 'WBC', value: '18.2', unit: '10e+9/L', range: '6.0–17.0', flag: 'H' },
      { code: 'HGB', value: '9.1', unit: 'g/dL', range: '12.0–18.0', flag: 'L' },
      { code: 'PLT', value: '210', unit: '10e+9/L', range: '200–500', flag: null },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.list.mockReset().mockImplementation(async (state?: string) => (state === 'waiting' ? [item()] : []));
  mocks.discard.mockReset().mockResolvedValue(undefined);
  mocks.restore.mockReset().mockResolvedValue(undefined);
  mocks.getDeviceData.mockReset();
  mocks.move.mockReset();
});

describe('LabInboxList — waiting results', () => {
  it('shows the machine, its patient ID, the match and the values with H/L flags', async () => {
    renderList();

    const row = (await screen.findByText('KOKO')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Exigo')).toBeInTheDocument();
    expect(within(row).getByText('devices:inbox.match.name')).toBeInTheDocument();
    expect(within(row).getByText(/Koko/, { selector: '[data-testid="matched-patient"]' })).toBeInTheDocument();
    expect(within(row).getByTestId('lab-value-WBC')).toHaveTextContent('WBC 18.2 10e+9/L H');
    expect(within(row).getByTestId('lab-value-HGB')).toHaveTextContent('HGB 9.1 g/dL L');
    expect(within(row).getByTestId('lab-value-PLT')).not.toHaveTextContent(/ [HL]$/);
    expect(mocks.list).toHaveBeenCalledWith('waiting');
  });

  it('highlights a result that has waited more than 24 hours', async () => {
    mocks.list.mockResolvedValue([item({ fileId: 'old', receivedAt: hoursAgo(30) }), item({ fileId: 'new', machinePatientId: 'REX' })]);
    renderList();

    const oldRow = (await screen.findByText('KOKO')).closest('tr') as HTMLElement;
    const newRow = screen.getByText('REX').closest('tr') as HTMLElement;
    expect(oldRow).toHaveAttribute('data-overdue', 'true');
    expect(within(oldRow).getByText('devices:inbox.overdue')).toBeInTheDocument();
    expect(newRow).not.toHaveAttribute('data-overdue', 'true');
  });

  it('says when a result could not be read and offers only Discard', async () => {
    mocks.list.mockResolvedValue([
      item({ status: 'failed', error: 'not xml', values: [], machinePatientId: null, matchMethod: 'none' }),
    ]);
    renderList();

    const row = (await screen.findByText('devices:recentFiles.couldNotRead')).closest('tr') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /devices:inbox.attach/ })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /devices:inbox.discard/ })).toBeInTheDocument();
  });

  it('shows a load error with Retry instead of an empty list', async () => {
    mocks.list.mockRejectedValue(new Error('db locked'));
    renderList();

    expect(await screen.findByText('devices:inbox.loadFailed')).toBeInTheDocument();
    mocks.list.mockResolvedValue([item()]);
    await userEvent.click(screen.getByRole('button', { name: /common:retry/ }));
    expect(await screen.findByText('KOKO')).toBeInTheDocument();
  });
});

describe('LabInboxList — actions', () => {
  it('Attach opens the import for that result with the matched patient', async () => {
    mocks.getDeviceData.mockResolvedValue({
      deviceType: 'exigo_eos_vet',
      deviceName: 'Exigo',
      connectionMethod: 'file_watch',
      patientIdentifier: 'KOKO',
      testResults: { WBC: '18.2' },
      originalFileName: 'BM-53672_1219.xml',
      fileData: [1, 2],
      mimeType: 'application/xml',
      detectedAt: '2026-10-23T08:00:00Z',
    });
    renderList();

    await userEvent.click(await screen.findByRole('button', { name: /devices:inbox.attach/ }));

    await waitFor(() => expect(importCtx.modalOpen).toBe(true));
    expect(mocks.getDeviceData).toHaveBeenCalledWith('r1');
    const file = importCtx.getGroupedFiles()[0];
    expect(file).toMatchObject({ sourceFileId: 'r1', patientId: 7, matchMethod: 'name', patientIdentifier: 'KOKO' });
  });

  it('Discard asks for a reason and reports success only after the save', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    mocks.discard.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderList();

    await user.click(await screen.findByRole('button', { name: /devices:inbox.discard/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('devices:inbox.reasons.qc'));
    await user.type(within(dialog).getByRole('textbox'), 'morning control');
    await user.click(within(dialog).getByRole('button', { name: /devices:inbox.discardConfirm/ }));

    expect(mocks.discard).toHaveBeenCalledWith('r1', 'qc', 'morning control');
    expect(screen.queryByText('devices:inbox.discarded')).not.toBeInTheDocument();
    finish();
    expect(await screen.findByText('devices:inbox.discarded')).toBeInTheDocument();
  });

  it('Discard needs a reason', async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(await screen.findByRole('button', { name: /devices:inbox.discard/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /devices:inbox.discardConfirm/ }));

    expect(await within(dialog).findByText('devices:inbox.reasonRequired')).toBeInTheDocument();
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it('the Discarded filter shows the reason and can restore a result', async () => {
    const user = userEvent.setup();
    mocks.list.mockImplementation(async (state?: string) =>
      state === 'discarded' ? [item({ state: 'discarded', discardReason: 'duplicate', discardedAt: hoursAgo(2) })] : [],
    );
    renderList();

    await user.click(await screen.findByText('devices:inbox.filter.discarded'));
    const row = (await screen.findByText('devices:inbox.reasons.duplicate')).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /devices:inbox.restore/ }));

    expect(mocks.restore).toHaveBeenCalledWith('r1');
  });

  it('an attached result names its patient and record and can be moved', async () => {
    const user = userEvent.setup();
    mocks.list.mockImplementation(async (state?: string) =>
      state === 'attached'
        ? [item({ state: 'attached', attachedRecordId: 40, attachedRecordName: 'Max bloods', attachedPatientId: 3, attachedPatientName: 'Max', attachmentId: 500 })]
        : [],
    );
    renderList();

    await user.click(await screen.findByText('devices:inbox.filter.attached'));
    const row = (await screen.findByText('Max bloods')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Max')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: /devices:inbox.move/ }));

    expect(await screen.findByText('devices:inbox.moveTitle')).toBeInTheDocument();
  });
});
