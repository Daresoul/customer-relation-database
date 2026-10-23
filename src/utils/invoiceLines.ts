import type { MedicalRecordLineItem, LineItemTemplate } from '@/types/lineItem';
import type { MoneyLine, TaxRate } from '@/types/clinic';

export function toMoneyLines(_items: MedicalRecordLineItem[]): MoneyLine[] {
  return [];
}

export function withRate(item: MedicalRecordLineItem, _rate: TaxRate | null | undefined): MedicalRecordLineItem {
  return item;
}

export function rateForTemplate(_template: LineItemTemplate, _rates: TaxRate[]): TaxRate | undefined {
  return undefined;
}

export function defaultRate(_rates: TaxRate[]): TaxRate | undefined {
  return undefined;
}
