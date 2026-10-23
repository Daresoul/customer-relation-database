import React, { useMemo } from 'react';
import { Table, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useInvoiceTotals } from '@/hooks/useClinic';
import { toMoneyLines } from '@/utils/invoiceLines';
import type { MedicalRecordLineItem } from '@/types/lineItem';

const { Text } = Typography;

interface InvoiceSummaryRowsProps {
  lineItems: MedicalRecordLineItem[];
  discountPercent?: number | null;
  currencySymbol: string;
  /** Columns before the amount column. */
  labelSpan: number;
}

/**
 * Subtotal, discount, VAT per rate and total under a line item table, as
 * the backend works them out for the invoice PDF.
 */
export const InvoiceSummaryRows: React.FC<InvoiceSummaryRowsProps> = ({
  lineItems,
  discountPercent,
  currencySymbol,
  labelSpan,
}) => {
  const { t } = useTranslation(['medical']);
  const lines = useMemo(() => toMoneyLines(lineItems), [lineItems]);
  const { data: totals } = useInvoiceTotals(lines, discountPercent);
  const money = (amount: number | undefined) =>
    amount === undefined ? '—' : `${currencySymbol}${amount.toFixed(2)}`;

  return (
    <Table.Summary>
      <Table.Summary.Row>
        <Table.Summary.Cell index={0} colSpan={labelSpan} align="right">
          <Text type="secondary">{t('medical:lineItems.subtotal', 'Subtotal')}:</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={1} align="right">
          <Text>{money(totals?.subtotal)}</Text>
        </Table.Summary.Cell>
      </Table.Summary.Row>
      {discountPercent != null && discountPercent > 0 && (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0} colSpan={labelSpan} align="right">
            <Text type="secondary">{t('medical:lineItems.discount', 'Discount')} ({discountPercent}%):</Text>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={1} align="right">
            <Text type="danger">{totals ? money(-totals.discountAmount) : '—'}</Text>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      )}
      {totals?.vatGroups.map(group => (
        <Table.Summary.Row key={group.label}>
          <Table.Summary.Cell index={0} colSpan={labelSpan} align="right">
            <Text type="secondary">{group.label}</Text>{' '}
            <Text type="secondary">({t('medical:lineItems.vatBase')} {money(group.net)})</Text>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={1} align="right">
            <Text type="secondary">{money(group.vat)}</Text>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      ))}
      {totals && totals.vatGroups.length > 0 && !totals.pricesIncludeVat && (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0} colSpan={labelSpan} align="right">
            <Text type="secondary">{t('medical:lineItems.vatAdded')}:</Text>
          </Table.Summary.Cell>
          <Table.Summary.Cell index={1} align="right">
            <Text>{money(totals.vatTotal)}</Text>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      )}
      <Table.Summary.Row>
        <Table.Summary.Cell index={0} colSpan={labelSpan} align="right">
          <Text strong>{t('medical:lineItems.total', 'Total')}:</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={1} align="right">
          <Text strong style={{ fontSize: '1.1em' }}>{money(totals?.total)}</Text>
        </Table.Summary.Cell>
      </Table.Summary.Row>
    </Table.Summary>
  );
};

export default InvoiceSummaryRows;
