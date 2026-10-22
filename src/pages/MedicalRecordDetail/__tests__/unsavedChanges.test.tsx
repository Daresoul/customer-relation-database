import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App } from 'antd';
import { MedicalRecordDetailPage } from '..';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
// Stable objects: the page's effects depend on the record's identity.
const recordQuery = {
  data: {
    record: {
      id: 7,
      patientId: 3,
      recordType: 'note',
      name: 'Visit',
      description: 'Notes',
      version: 1,
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
    attachments: [],
    history: [],
  },
  isLoading: false,
  isError: false,
  refetch: () => Promise.resolve(),
};
const updateMutation = { mutateAsync: () => Promise.resolve(), isPending: false };
const currencies = { data: [] };
const upload = { mutateAsync: () => Promise.resolve() };
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecord: () => recordQuery,
  useUpdateMedicalRecord: () => updateMutation,
  useCurrencies: () => currencies,
  useUploadAttachment: () => upload,
}));
vi.mock('@/hooks/usePatient', () => ({ usePatientDetail: () => ({ data: undefined }) }));
vi.mock('@/services/medicalService', () => ({ MedicalService: {} }));
vi.mock('@/components/PdfInlineViewer', () => ({ default: () => null }));
vi.mock('@/components/PdfMultiPagePreview', () => ({ default: () => null }));
vi.mock('@/components/RecentDeviceFiles', () => ({ default: () => null }));
vi.mock('@/components/PrintReportModal', () => ({ default: () => null }));
vi.mock('@/components/DiagnosisTagList', () => ({ default: () => null }));
vi.mock('@/components/DeviceStatusBar', () => ({ DeviceStatusInline: () => null }));
vi.mock('@/components/MedicalRecordModal/MedicalRecordForm', () => ({
  default: ({ onDirtyChange, onCancel }: { onDirtyChange?: (d: boolean) => void; onCancel: () => void }) => (
    <div>
      <span>editing form</span>
      <button onClick={() => onDirtyChange?.(true)}>type something</button>
      <button onClick={onCancel}>form cancel</button>
    </div>
  ),
}));

afterEach(cleanup);

function renderPage() {
  render(
    <App>
      <MemoryRouter initialEntries={['/medical-records/7']}>
        <Routes>
          <Route path="/medical-records/:id" element={<MedicalRecordDetailPage />} />
          <Route path="/patients/:id" element={<div>patient page</div>} />
        </Routes>
      </MemoryRouter>
    </App>,
  );
}

function startEditing(typeSomething: boolean) {
  fireEvent.click(screen.getByTestId('medical-record-edit-btn'));
  if (typeSomething) fireEvent.click(screen.getByText('type something'));
}

const backButton = () => screen.getByRole('button', { name: /medical:detail.backToPatient/ });

describe('record page: unsaved changes', () => {
  it('goes back at once when nothing was typed', () => {
    renderPage();
    startEditing(false);
    fireEvent.click(backButton());
    expect(screen.getByText('patient page')).toBeInTheDocument();
  });

  it('asks before Back throws away typed text, and leaves on Discard', async () => {
    renderPage();
    startEditing(true);

    fireEvent.click(backButton());

    expect(await screen.findByText('medical:unsaved.title')).toBeInTheDocument();
    expect(screen.queryByText('patient page')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'medical:unsaved.discard' }));
    await waitFor(() => expect(screen.getByText('patient page')).toBeInTheDocument());
  });

  it('keeps the form open when Cancel is answered with "keep editing"', async () => {
    renderPage();
    startEditing(true);

    fireEvent.click(screen.getByText('form cancel'));
    fireEvent.click(await screen.findByRole('button', { name: 'medical:unsaved.keepEditing' }));

    await waitFor(() => expect(screen.queryByText('medical:unsaved.title')).not.toBeInTheDocument());
    expect(screen.getByText('editing form')).toBeInTheDocument();
  });

  it('asks the browser to confirm closing or reloading while there is typed text', () => {
    renderPage();
    startEditing(true);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
