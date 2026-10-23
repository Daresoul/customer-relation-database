import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { LineItemsFieldGroup } from '../LineItemsFieldGroup';
import type { MedicalRecordLineItem } from '@/types/lineItem';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../../hooks/useLineItemTemplates', () => ({
  useLineItemTemplates: () => ({
    data: [
      { id: 5, name: 'Vaccine', description: null, defaultPrice: 800, currencyId: 1 },
      { id: 6, name: 'Exam', description: null, defaultPrice: 1500, currencyId: 1 },
    ],
    isLoading: false,
  }),
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

const vaccine = {
  templateId: 5,
  name: 'Vaccine',
  description: undefined,
  unitPrice: 800,
  currencyId: 1,
  quantity: 1,
} as unknown as MedicalRecordLineItem;

function renderGroup(lineItems: MedicalRecordLineItem[]) {
  const onLineItemsChange = vi.fn();
  render(
    <LineItemsFieldGroup
      lineItems={lineItems}
      discountPercent={null}
      onLineItemsChange={onLineItemsChange}
      onDiscountChange={vi.fn()}
      onManualTotalChange={vi.fn()}
    />,
  );
  return { onLineItemsChange };
}

const priceList = () => screen.getAllByRole('combobox')[0];

function search(text: string) {
  fireEvent.mouseDown(priceList());
  fireEvent.change(priceList(), { target: { value: text } });
}

const optionTexts = () =>
  Array.from(document.querySelectorAll('.ant-select-item-option-content')).map((n) => n.textContent ?? '');

describe('LineItemsFieldGroup price list', () => {
  it('can be searched by name', async () => {
    renderGroup([]);

    search('vacc');

    await waitFor(() => expect(optionTexts().some((o) => o.startsWith('Vaccine'))).toBe(true));
    expect(optionTexts().some((o) => o.startsWith('Exam'))).toBe(false);
  });

  it('adds one to the quantity of an item already on the invoice', async () => {
    const { onLineItemsChange } = renderGroup([vaccine]);

    search('Vacc');
    const option = await waitFor(() => {
      const found = Array.from(document.querySelectorAll('.ant-select-item-option')).find((n) =>
        (n.textContent ?? '').startsWith('Vaccine'),
      );
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    fireEvent.click(option);

    expect(onLineItemsChange).toHaveBeenCalledTimes(1);
    const items = onLineItemsChange.mock.calls[0][0] as MedicalRecordLineItem[];
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });
});
