import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp, Form, Input } from 'antd';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  patients: [] as Array<Record<string, unknown>>,
  createRecord: vi.fn(),
  upload: vi.fn(),
  saveForLater: vi.fn(),
  markProcessed: vi.fn(),
  generateReport: vi.fn(),
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
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/hooks/usePatients', () => ({
  usePatients: () => ({ patients: mocks.patients, refreshPatients: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/useMedicalRecords', () => ({
  useCreateMedicalRecord: () => ({ mutateAsync: mocks.createRecord }),
  useUploadAttachment: () => ({ mutateAsync: mocks.upload }),
}));
vi.mock('@/hooks/useRecordTemplates', () => ({
  useSearchRecordTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useAppSettings', () => ({ useAppSettings: () => ({ settings: {} }) }));
vi.mock('@/services/fileHistoryService', () => ({
  fileHistoryService: {
    saveDeviceFilesForLater: mocks.saveForLater,
    markPendingEntryProcessed: mocks.markProcessed,
    downloadDeviceFile: vi.fn(),
  },
}));
vi.mock('@/services/medicalService', () => ({
  MedicalService: { generateConfiguredReport: mocks.generateReport, openAttachmentExternally: vi.fn() },
}));
vi.mock('@/components/forms/fieldGroups', () => ({
  TabbedMedicalRecordFields: () => (
    <>
      <Form.Item name="recordType" hidden><Input /></Form.Item>
      <Form.Item name="name"><Input aria-label="record-name" /></Form.Item>
      <Form.Item name="description"><Input aria-label="record-description" /></Form.Item>
    </>
  ),
}));
vi.mock('../CreatePatientSection', () => ({ default: () => null }));
vi.mock('../../RecentDeviceFiles', () => ({ default: () => null }));

import { DeviceImportProvider, useDeviceImport, PendingDeviceFile } from '../../../contexts/DeviceImportContext';
import DeviceImportModal from '../DeviceImportModal';

let ctx: ReturnType<typeof useDeviceImport>;
function Probe() {
  ctx = useDeviceImport();
  return null;
}

function RecordPage() {
  const { id } = useParams();
  return <div>record page {id}</div>;
}

function renderModal() {
  return render(
    <DeviceImportProvider>
      <AntApp>
        <MemoryRouter initialEntries={['/']}>
          <Probe />
          <DeviceImportModal />
          <Routes>
            <Route path="/" element={<div>dashboard</div>} />
            <Route path="/medical-records/:id" element={<RecordPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </DeviceImportProvider>,
  );
}

const MAX = { id: 1, name: 'Max', species: 'Dog', microchipId: '807010000000001' };
const BELLA = { id: 2, name: 'Bella', species: 'Dog', microchipId: '807010000000002' };

function result(overrides: Partial<PendingDeviceFile> = {}): PendingDeviceFile {
  return {
    id: `f-${Math.random()}`,
    deviceType: 'exigo_eos_vet',
    deviceName: 'Exigo',
    connectionMethod: 'file_watch',
    fileName: 'exigo.xml',
    fileData: [1, 2, 3],
    mimeType: 'application/xml',
    testResults: { WBC: '12.1' },
    detectedAt: '2026-10-23T10:00:00Z',
    ...overrides,
  };
}

const maxResult = () =>
  result({ fileName: 'max.xml', patientId: 1, patientIdentifier: MAX.microchipId, matchMethod: 'microchip' });
const bellaResult = () =>
  result({ fileName: 'bella.xml', fileData: [9], patientId: 2, patientIdentifier: BELLA.microchipId, matchMethod: 'microchip' });

function receive(file: PendingDeviceFile) {
  act(() => ctx.receiveDeviceResult(file));
}

function dialog() {
  return within(screen.getAllByRole('dialog')[0]);
}

async function confirmCancel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(dialog().getByRole('button', { name: /common:buttons.cancel/ }));
  const confirm = await screen.findByText('medical:deviceImport.confirmCancel');
  const confirmDialog = confirm.closest('.ant-modal') as HTMLElement;
  await user.click(within(confirmDialog).getByRole('button', { name: /OK/i }));
}

beforeEach(() => {
  mocks.patients = [MAX, BELLA];
  mocks.createRecord.mockReset().mockResolvedValue({ id: 99 });
  mocks.upload.mockReset().mockResolvedValue({ id: 500 });
  mocks.saveForLater.mockReset().mockResolvedValue(1);
  mocks.markProcessed.mockReset().mockResolvedValue(undefined);
  mocks.generateReport.mockReset().mockResolvedValue({ id: 600 });
});

describe('DeviceImportModal — one result at a time', () => {
  it('shows that another result is waiting and keeps the first patient', async () => {
    renderModal();
    receive(maxResult());
    receive(bellaResult());

    expect(await screen.findByText('medical:deviceImport.moreWaiting count=1')).toBeInTheDocument();
    expect(dialog().getByText('Max - Dog')).toBeInTheDocument();
    expect(dialog().queryByText('Bella - Dog')).not.toBeInTheDocument();
    expect(dialog().getByText('max.xml')).toBeInTheDocument();
    expect(dialog().queryByText('bella.xml')).not.toBeInTheDocument();
  });

  it('opens the waiting result with its own patient after cancel', async () => {
    const user = userEvent.setup();
    renderModal();
    receive(maxResult());
    receive(bellaResult());

    await confirmCancel(user);

    await waitFor(() => expect(dialog().getByText('bella.xml')).toBeInTheDocument());
    expect(dialog().getByText('Bella - Dog')).toBeInTheDocument();
    expect(screen.queryByText(/medical:deviceImport.moreWaiting/)).not.toBeInTheDocument();
  });
});

describe('DeviceImportModal — save', () => {
  it('opens the new record inside the app', async () => {
    const user = userEvent.setup();
    const hrefBefore = window.location.href;
    renderModal();
    receive(maxResult());

    await user.click(await screen.findByTestId('device-import-submit-btn'));

    expect(await screen.findByText('record page 99')).toBeInTheDocument();
    expect(window.location.href).toBe(hrefBefore);
    expect(mocks.createRecord).toHaveBeenCalledWith(expect.objectContaining({ patientId: 1 }));
  });

  it('marks only the saved-for-later entries whose file uploaded', async () => {
    const user = userEvent.setup();
    renderModal();
    act(() => {
      ctx.addDeviceFile(result({ fileName: 'ok.xml', pendingEntryId: 5, patientId: 1 }));
      ctx.addDeviceFile(result({ fileName: 'broken.xml', fileData: [7], pendingEntryId: 6 }));
    });
    mocks.upload.mockImplementation(async ({ file }: { file: File }) => {
      if (file.name === 'broken.xml') throw new Error('disk full');
      return { id: 501 };
    });

    await user.click(await screen.findByTestId('device-import-submit-btn'));

    await screen.findByText('record page 99');
    expect(mocks.markProcessed).toHaveBeenCalledTimes(1);
    expect(mocks.markProcessed).toHaveBeenCalledWith(5);
  });
});

describe('DeviceImportModal — save for later', () => {
  it('parks a result under its own machine ID, and the next result gets its own', async () => {
    const user = userEvent.setup();
    renderModal();
    receive(result({ fileName: 'a.xml', patientIdentifier: 'REX' }));
    receive(result({ fileName: 'b.xml', fileData: [8], patientIdentifier: 'LUNA' }));

    const serial = await screen.findByPlaceholderText('medical:deviceImport.serialPlaceholder');
    expect(serial).toHaveValue('REX');
    await user.click(dialog().getByRole('button', { name: 'medical:deviceImport.saveForLater' }));

    expect(mocks.saveForLater).toHaveBeenCalledWith('REX', expect.any(Array), 'REX');
    await waitFor(() => expect(dialog().getByText('b.xml')).toBeInTheDocument());
    expect(screen.getByPlaceholderText('medical:deviceImport.serialPlaceholder')).toHaveValue('LUNA');
  });

  it('a cancelled result does not leave its serial for the next one', async () => {
    const user = userEvent.setup();
    renderModal();
    receive(result({ fileName: 'a.xml', patientIdentifier: 'REX' }));
    receive(result({ fileName: 'b.xml', fileData: [8], patientIdentifier: 'LUNA' }));
    const serial = await screen.findByPlaceholderText('medical:deviceImport.serialPlaceholder');
    await user.clear(serial);
    await user.type(serial, 'typed by hand');

    await confirmCancel(user);

    await waitFor(() => expect(dialog().getByText('b.xml')).toBeInTheDocument());
    expect(screen.getByPlaceholderText('medical:deviceImport.serialPlaceholder')).toHaveValue('LUNA');
  });

  it('treats "saved 0 files" as an error and keeps the result open', async () => {
    const user = userEvent.setup();
    mocks.saveForLater.mockResolvedValue(0);
    renderModal();
    receive(result({ fileName: 'a.xml', patientIdentifier: 'REX' }));

    await user.click(await screen.findByRole('button', { name: 'medical:deviceImport.saveForLater' }));

    expect(await screen.findByText('medical:deviceImport.savedNone')).toBeInTheDocument();
    expect(dialog().getByText('a.xml')).toBeInTheDocument();
  });
});

describe('DeviceImportModal — machine said / you picked', () => {
  it('shows the match strength next to the picker', async () => {
    renderModal();
    receive(maxResult());
    expect(await screen.findByText('medical:deviceImport.matchChip')).toBeInTheDocument();
  });

  it('says when a chip matches several patients', async () => {
    renderModal();
    receive(result({ patientIdentifier: MAX.microchipId, matchMethod: 'microchip', matchAmbiguous: true }));
    expect(await screen.findByText('medical:deviceImport.matchChipAmbiguous')).toBeInTheDocument();
  });

  it('warns when the picked patient differs from what the machine said, and asks before saving', async () => {
    const user = userEvent.setup();
    renderModal();
    receive(result({ patientId: 1, patientIdentifier: 'BELLA', matchMethod: 'name', testResults: { ID2: 'Bella' } }));

    expect(
      await screen.findByText('medical:deviceImport.machineSaidName machine=Bella picked=Max'),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('device-import-submit-btn'));

    const attach = await screen.findByRole('button', { name: 'medical:deviceImport.attachAnyway name=Max' });
    expect(mocks.createRecord).not.toHaveBeenCalled();
    await user.click(attach);

    expect(await screen.findByText('record page 99')).toBeInTheDocument();
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
  });

  it('does not save when the user goes back from the warning', async () => {
    const user = userEvent.setup();
    renderModal();
    receive(result({ patientId: 1, patientIdentifier: 'BELLA', matchMethod: 'name', testResults: { ID2: 'Bella' } }));

    await user.click(await screen.findByTestId('device-import-submit-btn'));
    await user.click(await screen.findByRole('button', { name: 'medical:deviceImport.goBack' }));

    expect(mocks.createRecord).not.toHaveBeenCalled();
    expect(dialog().getByText('exigo.xml')).toBeInTheDocument();
  });
});

describe('DeviceImportModal — failures shown', () => {
  it('marks a result whose values could not be read', async () => {
    renderModal();
    receive(result({ testResults: {} }));
    expect(await screen.findByText('medical:deviceImport.noValuesRead')).toBeInTheDocument();
  });
});

describe('DeviceImportModal — closed', () => {
  it('ignores chip scans while no import is open', async () => {
    const user = userEvent.setup({ delay: 5 });
    renderModal();

    await user.keyboard('807010000009999{Enter}');

    expect(screen.queryByText('medical:deviceImport.noPatientMatch')).not.toBeInTheDocument();
  });
});
