import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { App } from 'antd';
import LineItemsSettings from '../components/LineItemsSettings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const templates = [
  {
    id: 4,
    name: 'Surgery',
    defaultPrice: 1180,
    currencyId: 1,
    displayOrder: 0,
    isActive: true,
    defaultTaxRateId: 1,
    createdAt: '',
    updatedAt: '',
  },
];
const createTemplate = vi.fn((..._args: unknown[]) => Promise.resolve(templates[0]));

vi.mock('@/hooks/useLineItemTemplates', () => ({
  useLineItemTemplates: () => ({ data: templates, isLoading: false, refetch: vi.fn() }),
  useCreateLineItemTemplate: () => ({ mutateAsync: createTemplate, isPending: false }),
  useUpdateLineItemTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLineItemTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useCurrencies', () => ({
  useCurrencies: () => ({ data: [{ id: 1, code: 'MKD', name: 'Denar', symbol: 'ден' }] }),
}));
vi.mock('@/hooks/useAppSettings', () => ({ useAppSettings: () => ({ settings: { currencyId: 1 } }) }));
vi.mock('@/utils/themeStyles', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/hooks/useClinic', () => ({
  useTaxRates: () => ({
    data: [
      { id: 1, name: 'ДДВ 18%', percent: 18, isDefault: false, isActive: true, displayOrder: 0 },
      { id: 2, name: 'ДДВ 5%', percent: 5, isDefault: true, isActive: true, displayOrder: 1 },
    ],
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Price list VAT', () => {
  it("shows each item's default VAT rate", () => {
    render(<App><LineItemsSettings isUpdating={false} /></App>);
    const row = screen.getByText('Surgery').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('ДДВ 18%');
  });

  it("starts a new item with the clinic's default rate", async () => {
    render(<App><LineItemsSettings isUpdating={false} /></App>);
    fireEvent.click(screen.getByRole('button', { name: /settings:lineItems.addButton/ }));
    fireEvent.change(await screen.findByLabelText('settings:lineItems.name'), { target: { value: 'Drug' } });
    fireEvent.click(screen.getByRole('button', { name: /OK/ }));

    await waitFor(() => expect(createTemplate).toHaveBeenCalled());
    expect(createTemplate.mock.calls[0][0]).toMatchObject({ name: 'Drug', defaultTaxRateId: 2 });
  });
});
