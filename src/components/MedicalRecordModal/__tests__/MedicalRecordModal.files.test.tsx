import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import MedicalRecordModal from '../MedicalRecordModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.names ? `${key} ${opts.names}` : key),
  }),
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
const createRecord = vi.fn();
const upload = vi.fn();
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecord: () => ({ data: undefined, isLoading: false, isError: false }),
  useUpdateMedicalRecord: () => ({ mutateAsync: vi.fn() }),
  useCreateMedicalRecord: () => ({ mutateAsync: (...a: unknown[]) => createRecord(...a) }),
  useUploadAttachment: () => ({ mutateAsync: (...a: unknown[]) => upload(...a) }),
}));
const attachLab = vi.fn();
vi.mock('@/services/labInboxService', () => ({
  labInboxService: { attach: (...a: unknown[]) => attachLab(...a) },
}));
vi.mock('@/hooks/invalidation', () => ({ invalidatePatientData: vi.fn(), invalidateLabInboxData: vi.fn() }));

let submitArgs: unknown[] = [];
vi.mock('../MedicalRecordForm', () => ({
  default: ({ onSubmit }: { onSubmit: (...a: unknown[]) => void }) => (
    <button onClick={() => onSubmit(...submitArgs)}>stub-save</button>
  ),
}));

afterEach(() => {
  cleanup();
  createRecord.mockReset();
  upload.mockReset();
  attachLab.mockReset();
});

function renderModal() {
  const router = createMemoryRouter([
    { path: '/', element: <MedicalRecordModal open onClose={vi.fn()} patientId={3} patientName="Rex" recordId={null} /> },
  ]);
  render(
    <App>
      <RouterProvider router={router} />
    </App>,
  );
}

const file = (name: string) => new File(['x'], name, { type: 'application/xml' });

describe('MedicalRecordModal: files added while creating a record', () => {
  it('attaches a recent device file as a lab result, the way the record page does', async () => {
    createRecord.mockResolvedValue({ id: 77 });
    attachLab.mockResolvedValue(501);
    const result = file('BM-1.xml');
    submitArgs = [{ name: 'Consult' }, [result], new Map([['BM-1.xml', 'f-1']])];
    renderModal();

    fireEvent.click(screen.getByText('stub-save'));

    await waitFor(() => expect(attachLab).toHaveBeenCalledWith('f-1', 77));
    expect(upload).not.toHaveBeenCalled();
  });

  it('names the files that did not upload and keeps the ones that did', async () => {
    createRecord.mockResolvedValue({ id: 77 });
    upload.mockImplementation(({ file: f }: { file: File }) =>
      f.name === 'bad.png' ? Promise.reject(new Error('disk full')) : Promise.resolve({ id: 1 }),
    );
    submitArgs = [{ name: 'Consult' }, [file('good.png'), file('bad.png')], new Map()];
    renderModal();

    fireEvent.click(screen.getByText('stub-save'));

    expect(await screen.findByText('messages.uploadFailedFiles bad.png')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
