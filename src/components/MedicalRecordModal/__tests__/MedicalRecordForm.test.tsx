import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { App } from 'antd';
import MedicalRecordForm from '../MedicalRecordForm';
import type { MedicalRecord } from '@/types/medical';

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/hooks/useRecordTemplates', () => ({
  useRecordTemplates: () => ({ data: [], isLoading: false }),
  useSearchRecordTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useAppSettings', () => ({ useAppSettings: () => ({ settings: { currencyId: 1 } }) }));
vi.mock('@/hooks/useLineItemTemplates', () => ({
  useLineItemTemplates: () => ({ data: [], isLoading: false }),
  useCreateLineItemTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useCurrencies', () => ({
  useCurrencies: () => ({ data: [{ id: 1, code: 'MKD', name: 'Denar', symbol: 'ден' }] }),
}));
vi.mock('../../RecentDeviceFiles', () => ({ default: () => null }));
vi.mock('@/hooks/useClinic', () => ({
  useTaxRates: () => ({ data: [] }),
  useInvoiceTotals: () => ({ data: undefined }),
}));

afterEach(cleanup);

const record = {
  id: 7,
  patientId: 3,
  recordType: 'procedure',
  name: 'Visit',
  description: 'Notes',
  prescriptionNotes: '',
  discountPercent: null,
  manualTotal: null,
  lineItems: [],
  isArchived: false,
  version: 1,
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T10:00:00Z',
} as unknown as MedicalRecord;

type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

function mockDiagnoses(forRecord: () => Promise<unknown>) {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === 'get_diagnoses') return Promise.resolve([{ id: 3, name: 'Otitis', isActive: true }]);
    if (cmd === 'get_diagnoses_for_record') return forRecord();
    return Promise.resolve(null);
  });
}

function renderEdit(overrides: Partial<MedicalRecord> = {}, extra: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  render(
    <App>
      <MedicalRecordForm
        initialValues={{ ...record, ...overrides } as MedicalRecord}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        loading={false}
        isEdit
        patientId={3}
        recordId={7}
        {...extra}
      />
    </App>,
  );
  return { onSubmit };
}

const submitButton = () => screen.getByTestId('medical-record-form-submit-btn');

beforeEach(() => invokeMock.mockReset());

describe('MedicalRecordForm: diagnoses must load before an edit can save', () => {
  it('keeps Update disabled while the record diagnoses are still loading', async () => {
    mockDiagnoses(() => new Promise(() => {}));
    renderEdit();
    await waitFor(() => expect(submitButton()).toBeDisabled());
  });

  it('shows a message with Retry when they fail, then saves once they load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempt = 0;
    const pending: Deferred[] = [];
    mockDiagnoses(
      () =>
        new Promise((resolve, reject) => {
          attempt += 1;
          if (attempt === 1) reject(new Error('database is locked'));
          else pending.push({ resolve, reject });
        }),
    );
    const { onSubmit } = renderEdit();

    expect(await screen.findByText('medical:messages.diagnosesLoadFailed')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'medical:actions.retry' }));
    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve([{ id: 3, name: 'Otitis', isActive: true }]);
    await waitFor(() => expect(submitButton()).toBeEnabled());

    fireEvent.click(submitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][4]).toEqual([3]);
  });
});

describe('MedicalRecordForm: an edit sends cleared values explicitly', () => {
  it('sends an empty line item list and null discount and manual total', async () => {
    mockDiagnoses(() => Promise.resolve([]));
    const { onSubmit } = renderEdit();
    await waitFor(() => expect(submitButton()).toBeEnabled());

    fireEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.lineItems).toEqual([]);
    expect(payload).toHaveProperty('discountPercent', null);
    expect(payload).toHaveProperty('manualTotal', null);
  });

  it('drops a manual total once the record has line items', async () => {
    mockDiagnoses(() => Promise.resolve([]));
    const { onSubmit } = renderEdit({
      manualTotal: 2000,
      lineItems: [{ name: 'Exam', unitPrice: 1500, currencyId: 1, quantity: 1 }],
    } as Partial<MedicalRecord>);
    await waitFor(() => expect(submitButton()).toBeEnabled());

    fireEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toHaveProperty('manualTotal', null);
  });

  it("sends each line's VAT rate, and null for a line saved without one", async () => {
    mockDiagnoses(() => Promise.resolve([]));
    const { onSubmit } = renderEdit({
      lineItems: [
        { name: 'Exam', unitPrice: 1500, currencyId: 1, quantity: 1, templateId: 4 },
        { name: 'Surgery', unitPrice: 1180, currencyId: 1, quantity: 1, taxRateId: 1, vatName: 'ДДВ 18%', vatPercent: 18 },
      ],
    } as Partial<MedicalRecord>);
    await waitFor(() => expect(submitButton()).toBeEnabled());

    fireEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const items = onSubmit.mock.calls[0][0].lineItems as Array<{ taxRateId: number | null }>;
    expect(items.map((i) => i.taxRateId)).toEqual([null, 1]);
  });
});

describe('MedicalRecordForm: weight taken during the visit', () => {
  function renderCreate() {
    const onSubmit = vi.fn();
    render(
      <App>
        <MedicalRecordForm
          initialValues={{ ...record, id: 0 } as MedicalRecord}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          loading={false}
          isEdit={false}
          patientId={3}
          recordId={null}
        />
      </App>,
    );
    return { onSubmit };
  }

  it('hands a typed weight to the save, read with a decimal comma', async () => {
    mockDiagnoses(() => Promise.resolve([]));
    const { onSubmit } = renderCreate();

    fireEvent.change(screen.getByLabelText('patients:chart.weights.recordField'), { target: { value: '12,5' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][5]).toBe(12.5);
  });

  it('hands no weight when none was typed', async () => {
    mockDiagnoses(() => Promise.resolve([]));
    const { onSubmit } = renderCreate();

    fireEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][5]).toBeUndefined();
  });
});

describe('MedicalRecordForm: unsaved changes', () => {
  it('reports itself dirty once the user types', async () => {
    mockDiagnoses(() => Promise.resolve([]));
    const onDirtyChange = vi.fn();
    renderEdit({}, { onDirtyChange });
    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByTestId('medical-record-description-input'), { target: { value: 'Notes, corrected' } });

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});

describe('MedicalRecordForm: new record from an appointment', () => {
  it('starts with the given title', async () => {
    mockDiagnoses(() => Promise.resolve([]));
    render(
      <App>
        <MedicalRecordForm
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          loading={false}
          isEdit={false}
          patientId={3}
          recordId={null}
          defaultTitle="Vaccination"
        />
      </App>,
    );

    expect(await screen.findByDisplayValue('Vaccination')).toBeInTheDocument();
  });
});
