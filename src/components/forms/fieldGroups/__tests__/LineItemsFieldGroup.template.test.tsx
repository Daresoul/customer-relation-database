import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { LineItemsFieldGroup } from '../LineItemsFieldGroup';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const createTemplate = vi.fn(async (..._args: unknown[]) => ({ id: 9 }));
vi.mock('../../../../hooks/useLineItemTemplates', () => ({
  useLineItemTemplates: () => ({ data: [], isLoading: false }),
  useCreateLineItemTemplate: () => ({ mutateAsync: createTemplate, isPending: false }),
}));
vi.mock('../../../../hooks/useCurrencies', () => ({
  useCurrencies: () => ({ data: [{ id: 1, code: 'MKD', name: 'Denar', symbol: 'ден' }] }),
}));
vi.mock('../../../../hooks/useAppSettings', () => ({
  useAppSettings: () => ({ settings: { currencyId: 1 } }),
}));
vi.mock('../../../../hooks/useClinic', () => ({
  useTaxRates: () => ({
    data: [{ id: 1, name: 'ДДВ 18%', percent: 18, isDefault: true, isActive: true, displayOrder: 0 }],
  }),
  useInvoiceTotals: () => ({ data: undefined }),
}));

afterEach(cleanup);

// Final review: the new price-list item was saved without its VAT rate, so
// every later invoice using it started with no VAT.
describe('Save as template & add', () => {
  it('saves the price-list item with the VAT rate chosen for the line', async () => {
    render(
      <LineItemsFieldGroup
        lineItems={[]}
        onLineItemsChange={vi.fn()}
        onDiscountChange={vi.fn()}
        onManualTotalChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('medical:lineItems.addCustom'));
    fireEvent.change(await screen.findByLabelText('medical:lineItems.name'), { target: { value: 'Vaccine' } });
    fireEvent.click(screen.getByText('medical:lineItems.saveAsTemplateAndAdd'));

    await waitFor(() => expect(createTemplate).toHaveBeenCalled());
    expect(createTemplate.mock.calls[0][0]).toMatchObject({ name: 'Vaccine', defaultTaxRateId: 1 });
  });
});
