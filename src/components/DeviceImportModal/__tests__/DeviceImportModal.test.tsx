import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp, Form, Input } from 'antd';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  patients: [] as Array<Record<string, unknown>>,
  createRecord: vi.fn(),
  upload: vi.fn(),
  regenerateLabReport: vi.fn(),
  downloadDeviceFile: vi.fn(),
  generateReport: vi.fn(),
  openAttachment: vi.fn(),
  previewValues: vi.fn(),
  listen: vi.fn(),
  /** Patients whose record list fails to load. */
  recordsFailFor: [] as number[],
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
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@/hooks/usePatients', () => ({
  usePatients: () => ({ patients: mocks.patients, refreshPatients: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/useMedicalRecords', () => ({
  useCreateMedicalRecord: () => ({ mutateAsync: mocks.createRecord }),
  useUploadAttachment: () => ({ mutateAsync: mocks.upload }),
  useMedicalRecords: (patientId: number) => ({
    data: patientId === 1
      ? {
          records: [
            { id: 60, name: 'Vaccination', recordType: 'procedure', createdAt: '2020-01-01T10:00:00Z', isArchived: false },
            { id: 61, name: 'Consult', recordType: 'procedure', createdAt: new Date().toISOString(), isArchived: false },
          ],
        }
      : mocks.recordsFailFor.includes(patientId) ? undefined : { records: [] },
    isLoading: false,
    isError: mocks.recordsFailFor.includes(patientId),
  }),
}));
vi.mock('@/services/labInboxService', () => ({
  labInboxService: { regenerateLabReport: mocks.regenerateLabReport, previewValues: mocks.previewValues },
}));
vi.mock('@/hooks/useRecordTemplates', () => ({
  useSearchRecordTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useAppSettings', () => ({ useAppSettings: () => ({ settings: {} }) }));
vi.mock('@/services/fileHistoryService', () => ({
  fileHistoryService: {
    downloadDeviceFile: mocks.downloadDeviceFile,
  },
}));
vi.mock('@/services/medicalService', () => ({
  MedicalService: { generateConfiguredReport: mocks.generateReport, openAttachmentExternally: mocks.openAttachment },
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
vi.mock('../../RecentDeviceFiles', () => ({
  default: ({ onAddToRecord }: { onAddToRecord: (fileId: string, name: string) => void }) => (
    <button onClick={() => onAddToRecord('hist-abc', 'healvet.json')}>add recent</button>
  ),
}));

import { DeviceImportProvider } from '../../../contexts/DeviceImportContext';
import { useDeviceImport, type PendingDeviceFile } from '../../../contexts/useDeviceImport';
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
  mocks.recordsFailFor = [];
  mocks.createRecord.mockReset().mockResolvedValue({ id: 99 });
  mocks.upload.mockReset().mockResolvedValue({ id: 500 });
  mocks.regenerateLabReport.mockReset().mockResolvedValue({ id: 700 });
  mocks.generateReport.mockReset().mockResolvedValue({ id: 600 });
  mocks.openAttachment.mockReset();
  mocks.previewValues.mockReset().mockResolvedValue([]);
  mocks.listen.mockReset().mockImplementation(async () => () => {});
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

describe('DeviceImportModal — woken from the tray', () => {
  it('a result that arrives while the window is open but empty becomes the current one, not a waiting one', async () => {
    renderModal();
    act(() => ctx.openModal());
    receive(maxResult());

    expect(await screen.findByText('max.xml')).toBeInTheDocument();
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

  // device-import #14: the backend builds the lab report on create; the
  // import built a second one.
  it('builds the lab report once and opens the one the save made', async () => {
    const user = userEvent.setup();
    localStorage.setItem('autoOpenGeneratedReport', 'true');
    mocks.createRecord.mockResolvedValue({
      id: 99,
      pdfs: [{ kind: 'device_report', ok: true, error: null, attachmentId: 801 }],
    });
    try {
      renderModal();
      receive(maxResult());

      await user.click(await screen.findByTestId('device-import-submit-btn'));

      expect(await screen.findByText('record page 99')).toBeInTheDocument();
      expect(mocks.generateReport).not.toHaveBeenCalled();
      expect(mocks.openAttachment).toHaveBeenCalledWith(801);
    } finally {
      localStorage.removeItem('autoOpenGeneratedReport');
    }
  });
});

describe('DeviceImportModal — recent files', () => {
  it('a file added from recent files keeps its link to the file history', async () => {
    const user = userEvent.setup();
    mocks.downloadDeviceFile.mockResolvedValue({
      fileName: 'healvet.json',
      fileData: [4, 4],
      mimeType: 'application/json',
      deviceType: 'healvet_hv_fia_3000',
      deviceName: 'Healvet',
      testResults: { T4: '2.1' },
    });
    renderModal();
    receive(maxResult());

    await user.click(await screen.findByText('medical:deviceImport.browseRecentFiles'));
    await user.click(await screen.findByText('add recent'));
    await waitFor(() => expect(dialog().getByText('healvet.json')).toBeInTheDocument());
    await user.click(screen.getByTestId('device-import-submit-btn'));

    await screen.findByText('record page 99');
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ sourceFileId: 'hist-abc' }));
  });

  it('adding a file keeps the patient chosen by a chip scan', async () => {
    const user = userEvent.setup({ delay: 5 });
    renderModal();
    receive(maxResult());
    await screen.findByText('Max - Dog');

    await user.keyboard(`${BELLA.microchipId}{Enter}`);
    await waitFor(() => expect(dialog().getByText('Bella - Dog')).toBeInTheDocument());
    act(() => ctx.addDeviceFile(result({ fileName: 'extra.xml', fileData: [5, 5] })));

    await waitFor(() => expect(dialog().getByText('extra.xml')).toBeInTheDocument());
    expect(dialog().getByText('Bella - Dog')).toBeInTheDocument();
  });

  it('adding a file updates the default description', async () => {
    renderModal();
    receive(maxResult());
    await screen.findByText('Max - Dog');

    act(() => ctx.addDeviceFile(result({ fileName: 'extra.xml', fileData: [5, 5] })));

    await waitFor(() =>
      expect((screen.getByLabelText('record-description') as HTMLInputElement).value).toContain('extra.xml'),
    );
  });

  it('adding a file keeps a description the user wrote', async () => {
    const user = userEvent.setup();
    renderModal();
    receive(maxResult());
    const description = await screen.findByLabelText('record-description');
    await user.clear(description);
    await user.type(description, 'Pre-op bloods');

    act(() => ctx.addDeviceFile(result({ fileName: 'extra.xml', fileData: [5, 5] })));

    await waitFor(() => expect(dialog().getByText('extra.xml')).toBeInTheDocument());
    expect(description).toHaveValue('Pre-op bloods');
  });
});

describe('DeviceImportModal — not now', () => {
  it('has no typed serial: the result waits in the lab inbox', async () => {
    renderModal();
    receive(result({ fileName: 'a.xml', patientIdentifier: 'REX' }));

    await screen.findByText('a.xml');
    expect(screen.queryByPlaceholderText('medical:deviceImport.serialPlaceholder')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'medical:deviceImport.saveForLater' })).not.toBeInTheDocument();
  });

  it('Not now closes this result without saving and opens the next one', async () => {
    const user = userEvent.setup();
    renderModal();
    receive(result({ fileName: 'a.xml', patientIdentifier: 'REX' }));
    receive(result({ fileName: 'b.xml', fileData: [8], patientIdentifier: 'LUNA' }));

    await user.click(await screen.findByRole('button', { name: /medical:deviceImport.notNow/ }));

    await waitFor(() => expect(dialog().getByText('b.xml')).toBeInTheDocument());
    expect(await screen.findByText('medical:deviceImport.keptInInbox')).toBeInTheDocument();
    expect(mocks.createRecord).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('DeviceImportModal — attach to an existing record', () => {
  async function chooseExisting(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByLabelText('medical:deviceImport.target.existing'));
    const select = await screen.findByTestId('record-select');
    await waitFor(() => expect(within(select).getByText(/Consult/)).toBeInTheDocument());
  }

  it("defaults to the patient's record from today and adds the result to it", async () => {
    const user = userEvent.setup();
    renderModal();
    receive({ ...maxResult(), sourceFileId: 'hist-1' });

    await chooseExisting(user);
    await user.click(screen.getByTestId('device-import-submit-btn'));

    expect(await screen.findByText('record page 61')).toBeInTheDocument();
    expect(mocks.createRecord).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({ medicalRecordId: 61, attachmentType: 'test_result', deviceType: 'exigo_eos_vet', sourceFileId: 'hist-1' }),
    );
    expect(mocks.regenerateLabReport).toHaveBeenCalledWith(61);
    expect(mocks.generateReport).not.toHaveBeenCalled();
  });

  // Final review: the record picked for the first patient stayed chosen after
  // switching patient, so Attach put the result on the wrong patient's record.
  it('forgets the chosen record when the patient changes', async () => {
    mocks.recordsFailFor = [2];
    const user = userEvent.setup({ delay: 5 });
    renderModal();
    receive(result({ patientId: 1 }));
    await chooseExisting(user);

    await user.keyboard(`${BELLA.microchipId}{Enter}`);
    await waitFor(() => expect(dialog().getByText('Bella - Dog')).toBeInTheDocument());
    await user.click(screen.getByTestId('device-import-submit-btn'));

    expect(await screen.findByText('medical:deviceImport.pickRecord')).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('does not ask for the record form when adding to an existing record', async () => {
    const user = userEvent.setup();
    renderModal();
    receive(maxResult());

    await chooseExisting(user);

    expect(screen.queryByLabelText('record-name')).not.toBeInTheDocument();
  });

  it('still asks before adding a result the machine said is another patient', async () => {
    const user = userEvent.setup();
    renderModal();
    receive(result({ patientId: 1, patientIdentifier: 'BELLA', matchMethod: 'name', testResults: { ID2: 'Bella' } }));

    await chooseExisting(user);
    await user.click(screen.getByTestId('device-import-submit-btn'));
    await user.click(await screen.findByRole('button', { name: 'medical:deviceImport.goBack' }));

    expect(mocks.upload).not.toHaveBeenCalled();
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

// device-import #7: the list showed only the file name and tags.
describe('DeviceImportModal — values per result', () => {
  it('shows the values of each result', async () => {
    mocks.previewValues.mockResolvedValue([{ code: 'WBC', value: '12.1', unit: null, range: '6 - 17', flag: null }]);
    renderModal();
    receive(maxResult());

    expect(await screen.findByTestId('lab-value-WBC')).toBeInTheDocument();
    expect(mocks.previewValues).toHaveBeenCalledWith('exigo_eos_vet', { WBC: '12.1' });
  });
});

// device-import #5: two dogs called Max looked the same in the picker.
describe('DeviceImportModal — patient picker', () => {
  it('tells patients apart by chip ending and age', async () => {
    mocks.patients = [{ ...MAX, dateOfBirth: '2020-01-15' }, BELLA];
    renderModal();
    receive(maxResult());

    expect(await screen.findByText('Max - Dog')).toBeInTheDocument();
    expect(dialog().getByText(/medical:deviceImport.optionChip last4=0001/)).toBeInTheDocument();
    expect(dialog().getByText(/medical:deviceImport.optionAgeYears years=\d+/)).toBeInTheDocument();
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

describe('DeviceImportModal — scanner events', () => {
  it('a scan listener that registers after the import closed is removed', async () => {
    // Tauri registers listeners over IPC: listen() resolves later than the effect runs.
    const handlers = new Map<string, Set<(event: { payload: unknown }) => void>>();
    const pending: Array<() => void> = [];
    mocks.listen.mockImplementation(
      (name: string, handler: (event: { payload: unknown }) => void) =>
        new Promise((resolve) => {
          pending.push(() => {
            if (!handlers.has(name)) handlers.set(name, new Set());
            handlers.get(name)!.add(handler);
            resolve(() => handlers.get(name)!.delete(handler));
          });
        }),
    );
    const user = userEvent.setup();
    renderModal();
    receive(result({ fileName: 'a.xml', patientIdentifier: 'REX' }));
    await screen.findByText('a.xml');

    await user.click(screen.getByRole('button', { name: /medical:deviceImport.notNow/ }));
    await waitFor(() => expect(screen.queryByText('a.xml')).not.toBeInTheDocument());
    await act(async () => {
      pending.splice(0).forEach((register) => register());
    });

    expect(handlers.get('scanner:barcode')?.size ?? 0).toBe(0);
    expect(handlers.get('wake-from-tray')?.size ?? 0).toBe(0);
  });
});
