import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from 'antd';
import { MedicalRecordDetailPage } from '..';

const mocks = vi.hoisted(() => ({ attach: vi.fn(), regenerate: vi.fn(), refetch: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

const recordQuery = {
  data: {
    record: {
      id: 7,
      patientId: 3,
      recordType: 'procedure',
      name: 'Consult',
      description: 'Notes',
      version: 1,
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
    attachments: [
      { id: 500, originalName: 'BM-53672_1219.xml', attachmentType: 'test_result', deviceType: 'exigo_eos_vet', deviceName: 'Exigo', mimeType: 'application/xml', uploadedAt: '2026-10-20T10:00:00Z' },
      { id: 501, originalName: 'xray.png', attachmentType: 'file', mimeType: 'image/png', uploadedAt: '2026-10-20T10:00:00Z' },
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
vi.mock('@/services/medicalService', () => ({ MedicalService: { formatFileSize: () => '1 KB' } }));
vi.mock('@/services/labInboxService', () => ({
  labInboxService: { attach: mocks.attach, regenerateLabReport: mocks.regenerate },
}));
vi.mock('@/components/PdfInlineViewer', () => ({ default: () => null }));
vi.mock('@/components/PdfMultiPagePreview', () => ({ default: () => null }));
vi.mock('@/components/RecentDeviceFiles', () => ({
  default: ({ onAddToRecord }: { onAddToRecord: (fileId: string, name: string) => void }) => (
    <button onClick={() => onAddToRecord('hist-9', 'chem.hl7')}>add recent</button>
  ),
}));
vi.mock('@/components/PrintReportModal', () => ({ default: () => null }));
vi.mock('@/components/DiagnosisTagList', () => ({ default: () => null }));
vi.mock('@/components/DeviceStatusBar', () => ({ DeviceStatusInline: () => null }));
vi.mock('@/components/LabInbox/MoveLabResultModal', () => ({
  default: ({ open, attachmentId, currentPatientId }: { open: boolean; attachmentId?: number; currentPatientId?: number }) =>
    open ? <div>move dialog {attachmentId} from patient {currentPatientId}</div> : null,
}));

function renderPage() {
  // The page's unsaved-changes guard uses useBlocker, which needs a data router.
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

beforeEach(() => {
  mocks.attach.mockReset().mockResolvedValue(900);
  mocks.regenerate.mockReset().mockResolvedValue({ id: 901 });
  mocks.refetch.mockReset().mockResolvedValue(undefined);
});

describe('record page lab results', () => {
  it('offers Move to another patient on a lab result, not on other files', async () => {
    const user = userEvent.setup();
    renderPage();

    const labRow = screen.getByText('BM-53672_1219.xml').closest('tr') as HTMLElement;
    const fileRow = screen.getByText('xray.png').closest('tr') as HTMLElement;
    expect(within(fileRow).queryByRole('button', { name: /devices:inbox.move/ })).not.toBeInTheDocument();
    await user.click(within(labRow).getByRole('button', { name: /devices:inbox.move/ }));

    expect(screen.getByText('move dialog 500 from patient 3')).toBeInTheDocument();
  });

  it('a recent device file is added as a lab result and the lab report is rebuilt', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText('medical:actions.browseRecentFiles'));
    await user.click(await screen.findByText('add recent'));

    await waitFor(() => expect(mocks.attach).toHaveBeenCalledWith('hist-9', 7));
    await waitFor(() => expect(mocks.regenerate).toHaveBeenCalledWith(7));
  });
});
