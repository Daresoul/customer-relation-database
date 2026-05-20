/**
 * Tests for the keyboard-wedge barcode scanner detector.
 *
 * Covers:
 *   1. `normalizeMicrochip` pure function — exhaustive cases that mirror the
 *      Rust-side tests so both sides agree on every fixture.
 *   2. The hook itself — fires onScan on fast bursts, ignores slow typing,
 *      replaces input values when editable, prevents form submission via
 *      Enter, dedup against normalized form.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useBarcodeScanner, normalizeMicrochip } from '../useBarcodeScanner';

// ---------------------------------------------------------------------------
// normalizeMicrochip — pure function tests
// ---------------------------------------------------------------------------

describe('normalizeMicrochip', () => {
  // Known fixture matching the Rust side
  const KNOWN_HEX = 'C9C2540C01FE';
  const KNOWN_DECIMAL = '807010000007678';

  it('decodes the canonical Macedonia chip', () => {
    expect(normalizeMicrochip(KNOWN_HEX)).toBe(KNOWN_DECIMAL);
  });

  it('is case-insensitive for hex input', () => {
    expect(normalizeMicrochip('c9c2540c01fe')).toBe(KNOWN_DECIMAL);
    expect(normalizeMicrochip('c9C2540c01FE')).toBe(KNOWN_DECIMAL);
  });

  it('passes through 15-digit decimal unchanged', () => {
    expect(normalizeMicrochip(KNOWN_DECIMAL)).toBe(KNOWN_DECIMAL);
    expect(normalizeMicrochip('978000000000001')).toBe('978000000000001');
  });

  it('passes through 10-hex AVID FDX-A unchanged', () => {
    expect(normalizeMicrochip('1A2B3C4D5E')).toBe('1A2B3C4D5E');
  });

  it('passes through 9-digit legacy unchanged', () => {
    expect(normalizeMicrochip('123456789')).toBe('123456789');
  });

  it('passes through invalid lengths unchanged', () => {
    expect(normalizeMicrochip('')).toBe('');
    expect(normalizeMicrochip('abc')).toBe('abc');
    expect(normalizeMicrochip('not-a-chip')).toBe('not-a-chip');
  });

  it('passes through 12 chars with non-hex content', () => {
    expect(normalizeMicrochip('AAAAAAAAGGGG')).toBe('AAAAAAAAGGGG');
  });

  it('decodes country=0 + animal=0 to all-zero passport', () => {
    expect(normalizeMicrochip('000000000000')).toBe('000000000000000');
  });

  it('decodes country boundary (1023 = top 10 bits)', () => {
    // 0xFFC0000000000 has top 10 bits = 0x3FF (1023), animal = 0. 12 hex chars exact.
    const hex = (BigInt(1023) << 38n).toString(16).toUpperCase().padStart(12, '0');
    expect(hex.length).toBe(12);
    expect(normalizeMicrochip(hex)).toBe('1023000000000000');
  });
});

// ---------------------------------------------------------------------------
// useBarcodeScanner — hook tests
// ---------------------------------------------------------------------------

describe('useBarcodeScanner — fast burst detection', () => {
  let onScan: ReturnType<typeof vi.fn>;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    onScan = vi.fn();
    user = userEvent.setup({ delay: 5 }); // 5 ms between chars — well below 50ms threshold
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onScan with normalized code after fast 12-hex burst + Enter', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));

    await user.keyboard('C9C2540C01FE{Enter}');

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('807010000007678');
  });

  it('fires onScan with 15-digit decimal as-is', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    await user.keyboard('807010000007678{Enter}');
    expect(onScan).toHaveBeenCalledWith('807010000007678');
  });

  it('does NOT fire on slow typing', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    const slowUser = userEvent.setup({ delay: 200 }); // human pace
    await slowUser.keyboard('123');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('rejects bursts that do not match a known length', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    await user.keyboard('1234567{Enter}'); // 7 chars — not 9/10/12/15
    expect(onScan).not.toHaveBeenCalled();
  });

  it('rejects 12 chars with non-hex content', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    await user.keyboard('AAAAAAAAGGGG{Enter}'); // G is not hex
    expect(onScan).not.toHaveBeenCalled();
  });

  it('dedupes back-to-back scans of the same chip within 500ms', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    await user.keyboard('C9C2540C01FE{Enter}');
    await user.keyboard('C9C2540C01FE{Enter}');
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('dedupes hex + decimal of the same chip', async () => {
    // After my change, dedup is against the normalized form so the same chip
    // scanned in hex then decimal counts as one.
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    await user.keyboard('C9C2540C01FE{Enter}');
    await user.keyboard('807010000007678{Enter}');
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});

describe('useBarcodeScanner — editable focus', () => {
  let onScan: ReturnType<typeof vi.fn>;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    onScan = vi.fn();
    user = userEvent.setup({ delay: 5 });
  });

  it('replaces the input value with normalized form on finalize', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(<input data-testid="chip" />);
    const input = screen.getByTestId('chip') as HTMLInputElement;
    input.focus();

    await user.keyboard('C9C2540C01FE{Enter}');

    // After finalize, the input shows the normalized 15-digit form.
    expect(input.value).toBe('807010000007678');
  });

  it('prevents form submission on the scanner Enter inside an input', async () => {
    const onSubmit = vi.fn((e: any) => e.preventDefault());
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(
      <form onSubmit={onSubmit}>
        <input data-testid="chip" />
        <button type="submit">Submit</button>
      </form>
    );
    const input = screen.getByTestId('chip') as HTMLInputElement;
    input.focus();

    await user.keyboard('C9C2540C01FE{Enter}');

    expect(onScan).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('still fires onScan when burst lands in an editable element', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(<input data-testid="chip" />);
    (screen.getByTestId('chip') as HTMLInputElement).focus();

    await user.keyboard('C9C2540C01FE{Enter}');
    expect(onScan).toHaveBeenCalledWith('807010000007678');
  });
});

describe('useBarcodeScanner — guards', () => {
  it('does not buffer modifier-key combinations', async () => {
    const onScan = vi.fn();
    const user = userEvent.setup({ delay: 5 });
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));

    // Ctrl+combinations should be ignored entirely
    await user.keyboard('{Control>}c{/Control}{Control>}v{/Control}{Enter}');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('respects minLength option', async () => {
    const onScan = vi.fn();
    const user = userEvent.setup({ delay: 5 });
    // Short codes (8 chars) — set minLength=15 to require ISO FDX-B only
    renderHook(() =>
      useBarcodeScanner({ onScan, suffixKey: 'Enter', minLength: 15, allowedLengths: [15] }),
    );
    await user.keyboard('123456789{Enter}'); // 9 digits — below minLength
    expect(onScan).not.toHaveBeenCalled();
  });
});
