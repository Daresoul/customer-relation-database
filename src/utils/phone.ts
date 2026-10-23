/**
 * Digits of a phone number with the Macedonian country code read as the
 * local 0, so "+389 70 123 456" and "070-123-456" compare equal. Mirrors
 * `normalize_phone` in the backend (household_duplicates.rs).
 */
export function phoneDigits(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('389') && digits.length > 3) digits = `0${digits.slice(3).replace(/^0+/, '')}`;
  return digits;
}

/** True when the typed text, as phone digits, appears in one of the phones. */
export function phoneMatches(typed: string, phones: Array<string | null | undefined>): boolean {
  if (!/^[\d\s+\-/().]+$/.test(typed.trim())) return false;
  const wanted = phoneDigits(typed);
  if (wanted.length < 3) return false;
  return phones.some((p) => !!p && phoneDigits(p).includes(wanted));
}
