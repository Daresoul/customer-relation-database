import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
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

const totals = {
  subtotal: 1180,
  discountAmount: 118,
  total: 1062,
  netTotal: 900,
  vatTotal: 162,
  pricesIncludeVat: true,
  vatGroups: [{ label: 'ДДВ 18%', percent: 18, net: 900, vat: 162, gross: 1062 }],
  lineAmounts: [1180],
};
const useInvoiceTotals = vi.fn((..._args: unknown[]) => ({ data: totals }));
vi.mock('../../../../hooks/useClinic', () => ({
  useTaxRates: () => ({
    data: [{ id: 1, name: 'ДДВ 18%', percent: 18, isDefault: false, isActive: true, displayOrder: 0 }],
  }),
  useInvoiceTotals: (...args: unknown[]) => useInvoiceTotals(...args),
}));

afterEach(cleanup);

const surgery: MedicalRecordLineItem = {
  name: 'Surgery',
  unitPrice: 1180,
  currencyId: 1,
  quantity: 1,
  taxRateId: 1,
  vatName: 'ДДВ 18%',
  vatPercent: 18,
};

function renderGroup() {
  render(
    <LineItemsFieldGroup
      lineItems={[surgery]}
      discountPercent={10}
      onLineItemsChange={vi.fn()}
      onDiscountChange={vi.fn()}
      onManualTotalChange={vi.fn()}
    />,
  );
}

describe('LineItemsFieldGroup VAT', () => {
  it('asks the backend for the totals of the lines on screen', () => {
    renderGroup();
    expect(useInvoiceTotals).toHaveBeenLastCalledWith(
      [{ unitPrice: 1180, quantity: 1, vatPercent: 18, vatLabel: 'ДДВ 18%' }],
      10,
    );
  });

  it('shows the total and the VAT per rate from the backend', () => {
    renderGroup();
    const card = screen.getByTestId('line-items-totals');
    expect(card.textContent).toContain('1062.00');
    expect(card.textContent).toContain('-118.00');
    const vatRow = within(card).getByTestId('vat-group-ДДВ 18%');
    expect(vatRow.textContent).toContain('900.00');
    expect(vatRow.textContent).toContain('162.00');
  });

  it("shows each line's VAT rate", () => {
    renderGroup();
    const row = screen.getByText('Surgery').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('ДДВ 18%');
  });
});
