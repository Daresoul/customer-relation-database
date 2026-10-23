import type { MedicalRecordLineItem, LineItemTemplate } from '@/types/lineItem';
import type { MoneyLine, TaxRate } from '@/types/clinic';

/** The lines as the backend's money math takes them (`calculate_invoice_totals`). */
export function toMoneyLines(items: MedicalRecordLineItem[]): MoneyLine[] {
  return items.map((item) => ({
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    vatPercent: item.vatPercent ?? null,
    vatLabel: item.vatName ?? null,
  }));
}

/** The line with `rate` as its VAT rate; null or undefined removes the rate. */
export function withRate(item: MedicalRecordLineItem, rate: TaxRate | null | undefined): MedicalRecordLineItem {
  return {
    ...item,
    taxRateId: rate ? rate.id : null,
    vatName: rate ? rate.name : null,
    vatPercent: rate ? rate.percent : null,
  };
}

/** The template's default rate, if it is among `rates`. */
export function rateForTemplate(template: LineItemTemplate, rates: TaxRate[]): TaxRate | undefined {
  if (template.defaultTaxRateId == null) return undefined;
  return rates.find((r) => r.id === template.defaultTaxRateId);
}

/** The clinic's default rate, if it set one. */
export function defaultRate(rates: TaxRate[]): TaxRate | undefined {
  return rates.find((r) => r.isDefault && r.isActive);
}
