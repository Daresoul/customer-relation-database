import { describe, expect, it } from 'vitest';
import en from '../locales/en/settings.json';
import mk from '../locales/mk/settings.json';

// settings.md #20: the price list is not an invoice ("Factura").
describe('price list texts', () => {
  it('name the price list as services and prices', () => {
    expect(en.sections.lineItems).toBe('Services and prices');
    expect(en.lineItems.title).toBe('Services and prices');
    expect(mk.sections.lineItems).toBe('Услуги и цени');
    expect(mk.lineItems.title).toBe('Услуги и цени');
    expect(JSON.stringify(en)).not.toMatch(/factura/i);
  });
});
