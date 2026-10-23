import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LineItemsFieldGroup } from '../LineItemsFieldGroup';
import type { MedicalRecordLineItem } from '@/types/lineItem';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../../hooks/useLineItemTemplates', () => ({
  useLineItemTemplates: () => ({ data: [], isLoading: false }),
  useCreateLineItemTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../../../hooks/useCurrencies', () => ({
  useCurrencies: () => ({ data: [{ id: 1, code: 'MKD', name: 'Denar', symbol: 'ден' }] }),
}));
vi.mock('../../../../hooks/useAppSettings', () => ({
  useAppSettings: () => ({ settings: { currencyId: 1 } }),
}));
vi.mock('../../../../hooks/useClinic', () => ({
  useTaxRates: () => ({ data: [] }),
  useInvoiceTotals: () => ({ data: undefined }),
}));

afterEach(cleanup);

const exam: MedicalRecordLineItem = {
  templateId: undefined,
  name: 'Exam',
  description: undefined,
  unitPrice: 1500,
  currencyId: 1,
  quantity: 1,
} as MedicalRecordLineItem;

function renderGroup(props: Partial<React.ComponentProps<typeof LineItemsFieldGroup>> = {}) {
  const handlers = {
    onLineItemsChange: vi.fn(),
    onDiscountChange: vi.fn(),
    onManualTotalChange: vi.fn(),
  };
  render(<LineItemsFieldGroup lineItems={[exam]} discountPercent={10} {...handlers} {...props} />);
  return handlers;
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('LineItemsFieldGroup number inputs', () => {
  it('reads a discount typed with a decimal comma', () => {
    const { onDiscountChange } = renderGroup();
    type('medical:lineItems.discountPercent', '12,5');
    expect(onDiscountChange).toHaveBeenLastCalledWith(12.5);
  });

  it('reports a cleared discount as null so the save can remove it', () => {
    const { onDiscountChange } = renderGroup();
    type('medical:lineItems.discountPercent', '');
    expect(onDiscountChange).toHaveBeenLastCalledWith(null);
  });

  it('reports a discount set to 0 as 0, not as "unchanged"', () => {
    const { onDiscountChange } = renderGroup();
    type('medical:lineItems.discountPercent', '0');
    expect(onDiscountChange).toHaveBeenLastCalledWith(0);
  });

  it('reads an inline unit price typed with a decimal comma', () => {
    const { onLineItemsChange } = renderGroup();
    type('medical:lineItems.unitPrice', '150,50');
    expect(onLineItemsChange).toHaveBeenLastCalledWith([expect.objectContaining({ unitPrice: 150.5 })]);
  });

  it('reads a manual total typed with a decimal comma, and a cleared one as null', () => {
    const { onManualTotalChange } = renderGroup({ lineItems: [], manualTotal: 2000 });
    type('medical:lineItems.manualTotal', '250,50');
    expect(onManualTotalChange).toHaveBeenLastCalledWith(250.5);
    type('medical:lineItems.manualTotal', '');
    expect(onManualTotalChange).toHaveBeenLastCalledWith(null);
  });
});
