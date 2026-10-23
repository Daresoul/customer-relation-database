import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import MedicalRecordForm from '../MedicalRecordForm';

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
beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string, args?: { input?: { name: string } }) => {
    if (cmd === 'get_diagnoses') return Promise.resolve([{ id: 3, name: 'Otitis', isActive: true }]);
    if (cmd === 'create_diagnosis') return Promise.resolve({ id: 9, name: args?.input?.name, isActive: true });
    return Promise.resolve(null);
  });
});

function renderCreate() {
  const onSubmit = vi.fn();
  render(
    <App>
      <MedicalRecordForm onSubmit={onSubmit} onCancel={vi.fn()} loading={false} isEdit={false} patientId={3} recordId={null} />
    </App>,
  );
  return { onSubmit };
}

const titleInput = () =>
  (screen.getByTestId('medical-record-name-input').querySelector('input') ??
    screen.getByTestId('medical-record-name-input')) as HTMLInputElement;

describe('MedicalRecordForm (new record)', () => {
  it('does not save when Enter is pressed in the title', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCreate();
    fireEvent.change(screen.getByLabelText('medical:fields.description'), { target: { value: 'Notes' } });

    await user.type(titleInput(), 'Consult{Enter}');

    await new Promise((r) => setTimeout(r, 50));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('adds a diagnosis that is not in the list yet, and selects it', async () => {
    const user = userEvent.setup();
    renderCreate();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('get_diagnoses', { activeOnly: true }));
    const picker = screen.getByText('medical:placeholders.selectDiagnoses').closest('.ant-select') as HTMLElement;

    fireEvent.mouseDown(picker.querySelector('.ant-select-selector') as HTMLElement);
    await user.type(picker.querySelector('input') as HTMLInputElement, 'Pyometra');
    await user.click(await screen.findByRole('button', { name: /medical:diagnosisPicker.add/ }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('create_diagnosis', {
        input: { name: 'Pyometra', description: null, color: null },
      }),
    );
    expect(await screen.findByText('Pyometra', { selector: '.ant-tag *, .ant-tag' })).toBeInTheDocument();
  });
});
