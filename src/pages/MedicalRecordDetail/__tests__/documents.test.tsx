import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from 'antd';
import { MedicalRecordDetailPage } from '..';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  validate: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key} ${opts.name}` : key) }),
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

const at = '2026-10-20T10:00:00Z';
const recordQuery = {
  data: {
    record: {
      id: 7,
      patientId: 3,
      recordType: 'procedure',
      name: 'Consult',
      description: 'Notes',
      version: 1,
      createdAt: at,
      updatedAt: at,
    },
    attachments: [
      { id: 601, originalName: 'report.pdf', attachmentType: 'simple_report', mimeType: 'application/pdf', uploadedAt: at },
      { id: 602, originalName: 'invoice.pdf', attachmentType: 'invoice', mimeType: 'application/pdf', uploadedAt: at },
      { id: 603, originalName: 'pharmacy.pdf', attachmentType: 'pharmacy_note', mimeType: 'application/pdf', uploadedAt: at },
      { id: 604, originalName: 'lab-report.pdf', attachmentType: 'generated_pdf', mimeType: 'application/pdf', uploadedAt: at },
      { id: 605, originalName: 'xray.png', attachmentType: 'file', mimeType: 'image/png', uploadedAt: at },
    ],
    history: [],
  },
  isLoading: false,
  isError: false,
  refetch: mocks.refetch,
};
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecord: () => recordQuery,
  useUpdateMedicalRecord: () => ({ mutateAsync: () => Promise.resolve(), isPending: false }),
  useCurrencies: () => ({ data: [] }),
  useUploadAttachment: () => ({ mutateAsync: () => Promise.resolve() }),
}));
vi.mock('@/hooks/usePatient', () => ({ usePatientDetail: () => ({ data: undefined }) }));
vi.mock('@/services/medicalService', () => ({
  MedicalService: {
    formatFileSize: () => '1 KB',
    uploadAttachment: mocks.upload,
    validateFile: mocks.validate,
    deleteAttachment: mocks.remove,
  },
}));
vi.mock('@/components/PdfInlineViewer', () => ({ default: () => null }));
vi.mock('@/components/PdfMultiPagePreview', () => ({ default: () => null }));
vi.mock('@/components/RecentDeviceFiles', () => ({ default: () => null }));
vi.mock('@/components/PrintReportModal', () => ({ default: () => null }));
vi.mock('@/components/DiagnosisTagList', () => ({ default: () => null }));
vi.mock('@/components/DeviceStatusBar', () => ({ DeviceStatusInline: () => null }));

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/medical-records/:id', element: <MedicalRecordDetailPage /> }],
    { initialEntries: ['/medical-records/7'] },
  );
  render(
    <App>
      <RouterProvider router={router} />
    </App>,
  );
}

const documentsCard = () => screen.getByText('medical:fields.documents').closest('.ant-card') as HTMLElement;
const fileInput = () => {
  const input = documentsCard().querySelector('input[type="file"]');
  expect(input, 'the Documents card has an upload area').not.toBeNull();
  return input as HTMLInputElement;
};
const png = (name: string) => new File(['x'], name, { type: 'image/png' });

beforeEach(() => {
  mocks.upload.mockReset().mockResolvedValue({ id: 900 });
  mocks.validate.mockReset().mockReturnValue(null);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.refetch.mockReset().mockResolvedValue(undefined);
});

describe('record page documents: upload', () => {
  it('uploads several files, each once, and refreshes the record', async () => {
    const user = userEvent.setup();
    renderPage();
    const a = png('a.png');
    const b = png('b.png');

    await user.upload(fileInput(), [a, b]);

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(mocks.upload).toHaveBeenCalledWith(7, a);
    expect(mocks.upload).toHaveBeenCalledWith(7, b);
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
  });

  it('shows progress for a file while it uploads', async () => {
    const user = userEvent.setup();
    let finish: (v: unknown) => void = () => {};
    mocks.upload.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();

    await user.upload(fileInput(), [png('slow.png')]);

    const row = await screen.findByTestId('upload-row-slow.png');
    expect(within(row).getByRole('progressbar')).toBeInTheDocument();
    finish({ id: 1 });
    await waitFor(() => expect(screen.queryByTestId('upload-row-slow.png')).not.toBeInTheDocument());
  });

  it('keeps a failed file with its error, and Retry sends it again', async () => {
    const user = userEvent.setup();
    mocks.upload.mockRejectedValueOnce('disk full').mockResolvedValueOnce({ id: 2 });
    renderPage();
    const file = png('scan.png');

    await user.upload(fileInput(), [file]);

    const row = await screen.findByTestId('upload-row-scan.png');
    expect(await within(row).findByText('medical:upload.failed')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: /medical:upload.retry/ }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(mocks.upload).toHaveBeenLastCalledWith(7, file);
    await waitFor(() => expect(screen.queryByTestId('upload-row-scan.png')).not.toBeInTheDocument());
  });

  it('refuses a file over the size limit before sending it', async () => {
    const user = userEvent.setup();
    mocks.validate.mockReturnValue('File is larger than 100 MB');
    renderPage();

    await user.upload(fileInput(), [png('huge.png')]);

    const row = await screen.findByTestId('upload-row-huge.png');
    expect(within(row).getByText('File is larger than 100 MB')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /medical:upload.retry/ })).not.toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('record page documents: delete', () => {
  it('offers Delete on a user file but not on generated documents', () => {
    renderPage();
    for (const name of ['report.pdf', 'invoice.pdf', 'pharmacy.pdf', 'lab-report.pdf']) {
      const row = screen.getByText(name).closest('tr') as HTMLElement;
      expect(within(row).queryByRole('button', { name: /common:buttons.delete/ })).not.toBeInTheDocument();
    }
    const fileRow = screen.getByText('xray.png').closest('tr') as HTMLElement;
    expect(within(fileRow).getByRole('button', { name: /common:buttons.delete/ })).toBeInTheDocument();
  });

  it('deletes a user file after the confirm', async () => {
    const user = userEvent.setup();
    renderPage();
    const fileRow = screen.getByText('xray.png').closest('tr') as HTMLElement;

    await user.click(within(fileRow).getByRole('button', { name: /common:buttons.delete/ }));
    expect(mocks.remove).not.toHaveBeenCalled();
    const confirm = await screen.findByText('medical:detail.deleteAttachmentConfirm');
    const popup = confirm.closest('.ant-popover') as HTMLElement;
    await user.click(within(popup).getByRole('button', { name: /common:buttons.delete/ }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(605));
  });
});
