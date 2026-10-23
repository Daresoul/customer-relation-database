import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { App } from 'antd';
import dayjs from 'dayjs';
import MedicalRecordModal from '../MedicalRecordModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
const createRecord = vi.fn();
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecord: () => ({ data: undefined, isLoading: false, isError: false }),
  useCreateMedicalRecord: () => ({ mutateAsync: (...a: unknown[]) => createRecord(...a) }),
  useUpdateMedicalRecord: () => ({ mutateAsync: vi.fn() }),
  useUploadAttachment: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../MedicalRecordForm', () => ({
  default: ({ onSubmit }: { onSubmit: (...a: unknown[]) => void }) => (
    <button onClick={() => onSubmit({ name: 'Consult' }, [], new Map(), undefined, undefined, 12.5)}>
      stub-save
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  createRecord.mockReset();
});

describe('MedicalRecordModal: weight taken during the visit', () => {
  it('adds the weight to the log, pointing at the new record', async () => {
    createRecord.mockResolvedValue({ id: 77 });
    invokeMock.mockResolvedValue({ id: 1 });
    const onClose = vi.fn();
    render(
      <App>
        <MedicalRecordModal open onClose={onClose} patientId={3} patientName="Rex" recordId={null} />
      </App>,
    );

    fireEvent.click(screen.getByText('stub-save'));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('add_patient_weight', {
        patientId: 3,
        weight: 12.5,
        measuredOn: dayjs().format('YYYY-MM-DD'),
        medicalRecordId: 77,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says the weight was not saved when only that step fails', async () => {
    createRecord.mockResolvedValue({ id: 77 });
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'add_patient_weight') throw new Error('database is locked');
      return null;
    });
    render(
      <App>
        <MedicalRecordModal open onClose={vi.fn()} patientId={3} patientName="Rex" recordId={null} />
      </App>,
    );

    fireEvent.click(screen.getByText('stub-save'));

    expect(await screen.findByText('patients:chart.weights.recordSaveFailed')).toBeInTheDocument();
  });
});
