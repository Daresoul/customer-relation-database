import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from 'antd';
import { MedicalRecordDetailPage } from '..';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
// The lab values card reads through react-query, which this test stubs out.
vi.mock('@/components/LabResults/RecordLabValues', () => ({ default: () => null }));

// A record from before manual totals were cleared on save: items plus a
// stale manual total.
const recordQuery = {
  data: {
    record: {
      id: 7,
      patientId: 3,
      recordType: 'note',
      name: 'Visit',
      description: 'Notes',
      version: 1,
      manualTotal: 2000,
      lineItems: [{ id: 1, name: 'Exam', unitPrice: 1500, currencyId: 1, quantity: 1 }],
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
    attachments: [],
    history: [],
  },
  isLoading: false,
  isError: false,
  refetch: () => Promise.resolve(),
};
const updateMutation = { mutateAsync: () => Promise.resolve(), isPending: false };
const currencies = { data: [] };
const upload = { mutateAsync: () => Promise.resolve() };
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecord: () => recordQuery,
  useUpdateMedicalRecord: () => updateMutation,
  useCurrencies: () => currencies,
  useUploadAttachment: () => upload,
}));
vi.mock('@/hooks/usePatient', () => ({ usePatientDetail: () => ({ data: undefined }) }));
vi.mock('@/services/medicalService', () => ({ MedicalService: {} }));
vi.mock('@/components/PdfInlineViewer', () => ({ default: () => null }));
vi.mock('@/components/PdfMultiPagePreview', () => ({ default: () => null }));
vi.mock('@/components/RecentDeviceFiles', () => ({ default: () => null }));
vi.mock('@/components/PrintReportModal', () => ({ default: () => null }));
vi.mock('@/components/DiagnosisTagList', () => ({ default: () => null }));
vi.mock('@/components/DeviceStatusBar', () => ({ DeviceStatusInline: () => null }));

// The backend works out the totals; the page shows them as they come.
const totalsQuery = {
  data: {
    subtotal: 1500,
    discountAmount: 0,
    total: 1500,
    netTotal: 1271.19,
    vatTotal: 228.81,
    pricesIncludeVat: true,
    vatGroups: [{ label: 'ДДВ 18%', percent: 18, net: 1271.19, vat: 228.81, gross: 1500 }],
    lineAmounts: [1500],
  },
};
const useInvoiceTotals = vi.fn((..._args: unknown[]) => totalsQuery);
vi.mock('@/hooks/useClinic', () => ({
  useInvoiceTotals: (...args: unknown[]) => useInvoiceTotals(...args),
}));

function renderPage() {
  render(
    <App>
      <RouterProvider
        router={createMemoryRouter([{ path: '/medical-records/:id', element: <MedicalRecordDetailPage /> }], {
          initialEntries: ['/medical-records/7'],
        })}
      />
    </App>,
  );
}

describe('record page total', () => {
  it('is the sum of the line items, not a leftover manual total', () => {
    renderPage();

    const totalLabel = screen.getByText('medical:lineItems.total:');
    const totalRow = totalLabel.closest('tr') as HTMLElement;
    expect(totalRow.textContent).toContain('1.500,00');
    expect(totalRow.textContent).not.toContain('2000');
  });

  it('comes from the backend, with the VAT per rate', () => {
    renderPage();

    expect(useInvoiceTotals).toHaveBeenLastCalledWith(
      [{ unitPrice: 1500, quantity: 1, vatPercent: null, vatLabel: null }],
      undefined,
    );
    const vatRow = screen.getByText('ДДВ 18%').closest('tr') as HTMLElement;
    expect(vatRow.textContent).toContain('228,81');
  });
});
