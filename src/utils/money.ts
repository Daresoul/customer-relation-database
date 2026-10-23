/** The bits of a currency the formatter needs. */
export interface MoneyCurrency {
  code?: string | null;
  symbol?: string | null;
}

const isDenar = (c?: MoneyCurrency | null) =>
  !!c && (c.code?.toUpperCase() === 'MKD' || /^ден/i.test(c.symbol ?? ''));

/** A non-negative amount with dot grouping and a decimal comma. */
function digits(amount: number, decimals: number): string {
  const [whole, fraction] = amount.toFixed(decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction ? `${grouped},${fraction}` : grouped;
}

/**
 * Money on screen, written as the invoice PDF writes it: dot grouping and a
 * decimal comma. Denars: no decimals for a whole amount, the sign after
 * ("1.500 ден", "228,81 ден"). Other currencies: two decimals, the sign
 * before ("€12,50"). Unknown currency: two decimals, no sign.
 */
export function formatMoney(amount: number, currency?: MoneyCurrency | null): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const minus = amount < 0 && cents !== 0 ? '-' : '';
  if (isDenar(currency)) {
    const text = digits(cents / 100, cents % 100 === 0 ? 0 : 2);
    return `${minus}${text} ${currency?.symbol || 'ден'}`;
  }
  return `${minus}${currency?.symbol ?? ''}${digits(cents / 100, 2)}`;
}
