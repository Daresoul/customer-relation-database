import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from 'antd';
import { MedicalRecordDetailPage } from '..';

const mocks = vi.hoisted(() => ({
  atVersion: vi.fn(),
  open: vi.fn(),
  saveAs: vi.fn(),
  print: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/components/LabResults/RecordLabValues', () => ({ default: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.version ? `${key} ${opts.version}` : key),
  }),
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/useClinic', () => ({
  useInvoiceTotals: () => ({
    data: { subtotal: 1500, discountAmount: 0, total: 1500, netTotal: 1500, vatTotal: 0, pricesIncludeVat: true, vatGroups: [], lineAmounts: [1500] },
  }),
}));

const at = '2026-10-20T10:00:00Z';
const current = {
  id: 7,
  patientId: 3,
  recordType: 'procedure',
  name: 'Consult',
  description: 'Notes',
  prescriptionNotes: 'Amoxicillin',
  version: 2,
  lineItems: [{ id: 1, name: 'Exam', unitPrice: 1500, currencyId: 1, quantity: 1 }],
  createdAt: at,
  updatedAt: at,
};
const recordQuery = {
  data: {
    record: current,
    attachments: [
      { id: 601, originalName: 'report.pdf', attachmentType: 'simple_report', mimeType: 'application/pdf', uploadedAt: at },
      { id: 605, originalName: 'xray.png', attachmentType: 'file', mimeType: 'image/png', uploadedAt: at },
      {
        id: 606, originalName: 'BM-1.xml', attachmentType: 'test_result', mimeType: 'application/xml', uploadedAt: at,
        deviceType: 'exigo_eos_vet', deviceName: 'Exigo',
      },
    ],
    history: [
      { id: 2, medicalRecordId: 7, version: 2, changedFields: 'prescription_notes', changedAt: '2026-10-21T10:00:00Z' },
      { id: 1, medicalRecordId: 7, version: 1, changedFields: 'created', changedAt: at },
    ],
  },
  isLoading: false,
  isError: false,
  refetch: mocks.refetch,
};
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecord: () => recordQuery,
  useUpdateMedicalRecord: () => ({ mutateAsync: () => Promise.resolve(), isPending: false }),
  useCurrencies: () => ({ data: [{ id: 1, code: 'MKD', name: 'Denar', symbol: 'ден' }] }),
  useUploadAttachment: () => ({ mutateAsync: () => Promise.resolve() }),
}));
vi.mock('@/hooks/usePatient', () => ({ usePatientDetail: () => ({ data: undefined }) }));
vi.mock('@/services/medicalService', () => ({
  MedicalService: {
    formatFileSize: () => '1 KB',
    validateFile: () => null,
    getMedicalRecordAtVersion: mocks.atVersion,
    openAttachmentExternally: mocks.open,
    saveAttachmentAs: mocks.saveAs,
    printAttachment: mocks.print,
    deleteAttachment: mocks.remove,
  },
}));
vi.mock('@/components/MedicalRecordModal/MedicalRecordForm', () => ({ default: () => <div>record-edit-form</div> }));
vi.mock('@/components/PdfInlineViewer', () => ({ default: () => null }));
vi.mock('@/components/PdfMultiPagePreview', () => ({ default: () => null }));
vi.mock('@/components/RecentDeviceFiles', () => ({ default: () => null }));
vi.mock('@/components/PrintReportModal', () => ({ default: () => null }));
vi.mock('@/components/DiagnosisTagList', () => ({ default: () => null }));
vi.mock('@/components/DeviceStatusBar', () => ({ DeviceStatusInline: () => null }));

function renderPage(path = '/medical-records/7') {
  const router = createMemoryRouter(
    [{ path: '/medical-records/:id', element: <MedicalRecordDetailPage /> }],
    { initialEntries: [path] },
  );
  render(
    <App>
      <RouterProvider router={router} />
    </App>,
  );
}

const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

beforeEach(() => {
  mocks.atVersion.mockReset().mockResolvedValue({ ...current, version: 1, prescriptionNotes: null, lineItems: undefined });
  mocks.open.mockReset().mockResolvedValue(undefined);
  mocks.saveAs.mockReset().mockResolvedValue(undefined);
  mocks.print.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(null);
  mocks.refetch.mockReset().mockResolvedValue(undefined);
});

describe('record page: an old version', () => {
  it('shows that version only, says so, and offers no Edit', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
    expect(screen.getByTestId('medical-record-edit-btn')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'v1' }));

    expect(await screen.findByText('medical:detail.viewingVersion 1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Amoxicillin')).not.toBeInTheDocument());
    expect(screen.queryByTestId('medical-record-edit-btn')).not.toBeInTheDocument();
    expect(screen.queryByText('Exam')).not.toBeInTheDocument();
    expect(screen.getByText('medical:detail.oldVersionNoInvoice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'medical:detail.backToCurrent' }));

    expect(await screen.findByText('Amoxicillin')).toBeInTheDocument();
    expect(screen.getByTestId('medical-record-edit-btn')).toBeInTheDocument();
    expect(screen.queryByText('medical:detail.viewingVersion 1')).not.toBeInTheDocument();
  });
});

describe('record page: money', () => {
  it('shows denar amounts without decimals and with the denar sign after', () => {
    renderPage();
    const exam = row('Exam');
    expect(exam.textContent).toContain('1.500 ден');
    expect(exam.textContent).not.toContain('1500.00');
  });
});

describe('record page: opening in edit mode', () => {
  it('opens the form when the link asks for edit mode', () => {
    renderPage('/medical-records/7?edit=1');
    expect(screen.getByText('record-edit-form')).toBeInTheDocument();
  });
});

describe('record page: file actions', () => {
  it('says so when a file can not be opened', async () => {
    const user = userEvent.setup();
    mocks.open.mockRejectedValue('no app for .png');
    renderPage();

    await user.click(within(row('xray.png')).getByRole('button', { name: 'medical:detail.openInApp' }));

    expect(await screen.findByText('medical:detail.openFailed')).toBeInTheDocument();
  });

  it('says so when a download fails', async () => {
    const user = userEvent.setup();
    mocks.saveAs.mockRejectedValue('disk full');
    renderPage();

    await user.click(within(row('xray.png')).getByRole('button', { name: 'common:download' }));

    expect(await screen.findByText('medical:messages.downloadFailed')).toBeInTheDocument();
  });

  it('prints a PDF from its row and says so when printing fails', async () => {
    const user = userEvent.setup();
    mocks.print.mockRejectedValue('no printer');
    renderPage();
    expect(within(row('xray.png')).queryByRole('button', { name: 'common:print' })).not.toBeInTheDocument();

    await user.click(within(row('report.pdf')).getByRole('button', { name: 'common:print' }));

    expect(mocks.print).toHaveBeenCalledWith(601);
    expect(await screen.findByText('medical:pdfPreview.printFailed')).toBeInTheDocument();
  });

  it('warns when the lab report could not be rebuilt after deleting a lab result', async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ kind: 'device_report', ok: false, error: 'Java not found' });
    renderPage();

    await user.click(within(row('BM-1.xml')).getByRole('button', { name: /common:buttons.delete/ }));
    const confirm = await screen.findByText('medical:detail.deleteAttachmentConfirm');
    await user.click(within(confirm.closest('.ant-popover') as HTMLElement).getByRole('button', { name: /common:buttons.delete/ }));

    expect(await screen.findByText('medical:detail.labReportNotRebuilt')).toBeInTheDocument();
  });
});
