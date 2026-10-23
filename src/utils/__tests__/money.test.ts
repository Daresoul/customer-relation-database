import { describe, it, expect } from 'vitest';
import { formatMoney } from '../money';

const denar = { code: 'MKD', symbol: 'ден' };

describe('formatMoney', () => {
  it('writes whole denars without decimals, dot-grouped, sign after', () => {
    expect(formatMoney(1500, denar)).toBe('1.500 ден');
    expect(formatMoney(1234567, denar)).toBe('1.234.567 ден');
  });

  it('keeps the cents of a denar amount that has them, as the invoice PDF does', () => {
    expect(formatMoney(228.81, denar)).toBe('228,81 ден');
  });

  it('writes other currencies with two decimals and the sign before', () => {
    expect(formatMoney(12.5, { code: 'EUR', symbol: '€' })).toBe('€12,50');
    expect(formatMoney(1500, { code: 'EUR', symbol: '€' })).toBe('€1.500,00');
  });

  it('writes an amount of unknown currency with two decimals', () => {
    expect(formatMoney(1500)).toBe('1.500,00');
  });

  it('keeps the minus of a discount', () => {
    expect(formatMoney(-150, denar)).toBe('-150 ден');
  });
});
