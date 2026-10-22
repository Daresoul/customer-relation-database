/**
 * Numbers typed the Macedonian way or the English way.
 *
 * - "," and "." are both read as the decimal mark: "4,5" and "4.5" are 4.5.
 * - When both appear, the last one is the decimal mark and the other groups
 *   thousands: "1.500,50" and "1,500.50" are 1500.5.
 * - One mark used more than once groups thousands: "1.500.000" is 1500000.
 * - A single mark is always decimal, so "1.500" is 1.5, never 1500. Type
 *   "1500" (or "1.500,00") for one thousand five hundred.
 * - Spaces, currency symbols and "%" are ignored.
 */
export function normalizeLocaleNumber(text: string): string {
  const cleaned = text.replace(/[^\d.,-]/g, '');
  const negative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/-/g, '');

  const lastDot = unsigned.lastIndexOf('.');
  const lastComma = unsigned.lastIndexOf(',');
  let decimalMark: string | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalMark = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const mark = lastDot >= 0 ? '.' : ',';
    decimalMark = unsigned.split(mark).length > 2 ? null : mark;
  }

  let normalized: string;
  if (decimalMark === null) {
    normalized = unsigned.replace(/[.,]/g, '');
  } else {
    const at = unsigned.lastIndexOf(decimalMark);
    normalized = `${unsigned.slice(0, at).replace(/[.,]/g, '')}.${unsigned.slice(at + 1).replace(/[.,]/g, '')}`;
  }
  return negative ? `-${normalized}` : normalized;
}

export function parseLocaleNumber(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (text == null) return null;
  const normalized = normalizeLocaleNumber(text);
  if (!/\d/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** `parser` for antd InputNumber: accepts a decimal comma. */
export const localeNumberParser = (text?: string): string => normalizeLocaleNumber(text ?? '');
