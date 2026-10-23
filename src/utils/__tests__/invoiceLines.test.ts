import { describe, it, expect } from 'vitest';
import { toMoneyLines, withRate, rateForTemplate, defaultRate } from '../invoiceLines';
import type { MedicalRecordLineItem, LineItemTemplate } from '@/types/lineItem';
import type { TaxRate } from '@/types/clinic';

const r18: TaxRate = { id: 1, name: 'ДДВ 18%', percent: 18, isDefault: false, isActive: true, displayOrder: 0 };
const r5: TaxRate = { id: 2, name: 'ДДВ 5%', percent: 5, isDefault: true, isActive: true, displayOrder: 1 };

const exam: MedicalRecordLineItem = { name: 'Exam', unitPrice: 1180, currencyId: 1, quantity: 2 };

describe('invoice lines', () => {
  it('sends each line with the VAT percent and name it was saved with', () => {
    expect(toMoneyLines([{ ...exam, taxRateId: 1, vatName: 'ДДВ 18%', vatPercent: 18 }, exam])).toEqual([
      { unitPrice: 1180, quantity: 2, vatPercent: 18, vatLabel: 'ДДВ 18%' },
      { unitPrice: 1180, quantity: 2, vatPercent: null, vatLabel: null },
    ]);
  });

  it('sets a rate on a line, and clears it', () => {
    const rated = withRate(exam, r18);
    expect(rated).toMatchObject({ taxRateId: 1, vatName: 'ДДВ 18%', vatPercent: 18 });
    expect(withRate(rated, null)).toMatchObject({ taxRateId: null, vatName: null, vatPercent: null });
  });

  it("takes a template's default rate when it is still offered", () => {
    const template = { id: 4, defaultTaxRateId: 1 } as LineItemTemplate;
    expect(rateForTemplate(template, [r18, r5])).toBe(r18);
    expect(rateForTemplate({ ...template, defaultTaxRateId: 9 }, [r18, r5])).toBeUndefined();
    expect(rateForTemplate({ ...template, defaultTaxRateId: null }, [r18, r5])).toBeUndefined();
  });

  it('starts a custom line with the default rate, if the clinic set one', () => {
    expect(defaultRate([r18, r5])).toBe(r5);
    expect(defaultRate([r18])).toBeUndefined();
    expect(defaultRate([{ ...r5, isActive: false }])).toBeUndefined();
  });
});
