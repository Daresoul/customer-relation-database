import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import MedicalRecordForm from '../MedicalRecordForm';
import type { MedicalRecord, RecordTemplate } from '@/types/medical';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  templatesFor: vi.fn(),
}));
vi.mock('@/services/invoke', () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/hooks/useRecordTemplates', () => ({
  useRecordTemplates: (recordType?: string) => ({ data: mocks.templatesFor(recordType), isLoading: false }),
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

const at = '2026-10-20T10:00:00Z';
const templates: RecordTemplate[] = [
  {
    id: 1,
    recordType: 'procedure',
    title: 'Вакцинација',
    description: 'Вакцина DHPPi, општ преглед.',
    prescriptionNotes: 'Без капење 3 дена.',
    lineItems: [
      { lineItemTemplateId: 11, quantity: 1, name: 'Вакцина DHPPi', unitPrice: 900, currencyId: 1, taxRateId: 2, vatName: 'ДДВ 5%', vatPercent: 5, isActive: true },
      { lineItemTemplateId: 12, quantity: 1, name: 'Стара вакцина', unitPrice: 700, currencyId: 1, taxRateId: null, vatName: null, vatPercent: null, isActive: false },
    ],
    diagnosisIds: [4],
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 2,
    recordType: 'note',
    title: 'Контрола',
    description: 'Контролен преглед.',
    prescriptionNotes: null,
    lineItems: [],
    diagnosisIds: [],
    createdAt: at,
    updatedAt: at,
  },
];

const lastRecord = {
  recordId: 40,
  recordType: 'procedure',
  name: 'Отитис — прв преглед',
  createdAt: '2026-10-15 09:00:00',
  description: 'Црвено уво, исцедок.',
  prescriptionNotes: 'Капки 2x дневно, 7 дена.',
  diagnosisIds: [3],
  lineItems: [
    { id: 90, medicalRecordId: 40, templateId: 13, name: 'Капки за уво', unitPrice: 350, currencyId: 1, quantity: 2, taxRateId: 1, vatName: 'ДДВ 18%', vatPercent: 18, createdAt: at },
  ],
};

function mockBackend(last: unknown = lastRecord) {
  mocks.invoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_diagnoses') {
      return Promise.resolve([
        { id: 3, name: 'Отитис', isActive: true },
        { id: 4, name: 'Здрав', isActive: true },
      ]);
    }
    if (cmd === 'get_diagnoses_for_record') return Promise.resolve([]);
    if (cmd === 'get_last_record_for_copy') return Promise.resolve(last);
    return Promise.resolve(null);
  });
}

function renderCreate() {
  const onSubmit = vi.fn();
  render(
    <App>
      <MedicalRecordForm onSubmit={onSubmit} onCancel={vi.fn()} loading={false} isEdit={false} patientId={3} recordId={null} />
    </App>,
  );
  return { onSubmit };
}

const pickerInput = () => screen.getByTestId('record-template-picker').querySelector('input') as HTMLElement;
const optionTexts = () =>
  Array.from(document.querySelectorAll('.ant-select-item-option-content')).map((o) => o.textContent ?? '');
const description = () => screen.getByTestId('medical-record-description-input') as HTMLTextAreaElement;
const submit = () => screen.getByTestId('medical-record-form-submit-btn');

async function pickTemplate(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(pickerInput());
  const option = await screen.findByText(title, { selector: '.ant-select-item-option-content *, .ant-select-item-option-content' });
  await user.click(option);
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.templatesFor.mockReset().mockImplementation(() => templates);
  mockBackend();
});
afterEach(cleanup);

describe('record form: template picker', () => {
  it('lists every template, of any record type, as soon as it opens', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(pickerInput());

    await waitFor(() => expect(optionTexts().some((o) => o.includes('Вакцинација'))).toBe(true));
    expect(optionTexts().some((o) => o.includes('Контрола'))).toBe(true);
    expect(mocks.templatesFor).toHaveBeenCalledWith(undefined);
  });

  it('narrows the list as you type, ignoring Cyrillic case', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(pickerInput());
    await user.type(pickerInput(), 'КОНТ');

    await waitFor(() => expect(optionTexts().some((o) => o.includes('Вакцинација'))).toBe(false));
    expect(optionTexts().some((o) => o.includes('Контрола'))).toBe(true);
  });

  it('fills title, text, prescription, price-list lines with their VAT and diagnoses', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCreate();

    await pickTemplate(user, 'Вакцинација');
    expect(screen.queryByText('medical:templatePicker.replaceTitle')).not.toBeInTheDocument();
    expect(await screen.findByText('medical:templatePicker.inactiveSkipped')).toBeInTheDocument();
    await user.click(submit());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [values, , , , diagnosisIds] = onSubmit.mock.calls[0];
    expect(values).toMatchObject({
      recordType: 'procedure',
      name: 'Вакцинација',
      description: 'Вакцина DHPPi, општ преглед.',
      prescriptionNotes: 'Без капење 3 дена.',
    });
    expect(values.lineItems).toEqual([
      expect.objectContaining({ templateId: 11, name: 'Вакцина DHPPi', unitPrice: 900, currencyId: 1, quantity: 1, taxRateId: 2 }),
    ]);
    expect(diagnosisIds).toEqual([4]);
  });

  it("sets the record type to the template's", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCreate();

    await pickTemplate(user, 'Контрола');
    await user.click(submit());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].recordType).toBe('note');
  });

  it('asks before replacing typed text, and keeps it on "keep mine"', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.type(description(), 'Моја белешка');

    await pickTemplate(user, 'Вакцинација');
    expect(await screen.findByText('medical:templatePicker.replaceTitle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'medical:templatePicker.keepMine' }));
    await waitFor(() => expect(screen.queryByText('medical:templatePicker.replaceTitle')).not.toBeInTheDocument());
    expect(description().value).toBe('Моја белешка');

    await pickTemplate(user, 'Вакцинација');
    await user.click(await screen.findByRole('button', { name: 'medical:templatePicker.replace' }));
    await waitFor(() => expect(description().value).toBe('Вакцина DHPPi, општ преглед.'));
  });
});

describe('record form: copy from last record', () => {
  it('fills description, prescription and diagnoses, but not the lines unless asked', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCreate();

    await user.click(screen.getByRole('button', { name: /medical:copyLast.button/ }));
    expect(mocks.invoke).toHaveBeenCalledWith('get_last_record_for_copy', { patientId: 3 });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'medical:copyLast.copy' }));

    await waitFor(() => expect(description().value).toBe('Црвено уво, исцедок.'));
    await user.type(screen.getByTestId('medical-record-name-input').querySelector('input') ?? screen.getByTestId('medical-record-name-input'), 'Контрола');
    await user.click(submit());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [values, , , , diagnosisIds] = onSubmit.mock.calls[0];
    expect(values.name).toBe('Контрола');
    expect(values.prescriptionNotes).toBe('Капки 2x дневно, 7 дена.');
    expect(values.lineItems).toBeUndefined();
    expect(diagnosisIds).toEqual([3]);
    expect(values).not.toHaveProperty('invoiceNumber');
  });

  it('copies the invoice lines too when ticked', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCreate();

    await user.click(screen.getByRole('button', { name: /medical:copyLast.button/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'medical:copyLast.copy' }));
    await waitFor(() => expect(description().value).toBe('Црвено уво, исцедок.'));
    await user.type(screen.getByTestId('medical-record-name-input').querySelector('input') ?? screen.getByTestId('medical-record-name-input'), 'Контрола');
    await user.click(submit());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const lines = onSubmit.mock.calls[0][0].lineItems;
    expect(lines).toEqual([
      expect.objectContaining({ templateId: 13, name: 'Капки за уво', unitPrice: 350, quantity: 2, taxRateId: 1 }),
    ]);
    expect(lines[0]).not.toHaveProperty('id');
  });

  it('says so when the patient has no earlier record', async () => {
    const user = userEvent.setup();
    mockBackend(null);
    renderCreate();

    await user.click(screen.getByRole('button', { name: /medical:copyLast.button/ }));

    expect(await screen.findByText('medical:copyLast.none')).toBeInTheDocument();
  });

  it('is not offered when editing a saved record', async () => {
    render(
      <App>
        <MedicalRecordForm
          initialValues={{ id: 7, patientId: 3, recordType: 'note', name: 'Visit', description: 'Notes', lineItems: [], isArchived: false, version: 1, createdAt: at, updatedAt: at } as unknown as MedicalRecord}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          loading={false}
          isEdit
          patientId={3}
          recordId={7}
        />
      </App>,
    );
    await waitFor(() => expect(screen.getByTestId('record-template-picker')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /medical:copyLast.button/ })).not.toBeInTheDocument();
  });
});
