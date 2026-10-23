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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, type FormEvent } from 'react';
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
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
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

describe('useBarcodeScanner — host re-renders', () => {
  it('a scan into a field that re-renders its host on every key still fires', async () => {
    const onScan = vi.fn();
    const user = userEvent.setup({ delay: 5 });
    function Host() {
      const [value, setValue] = useState('');
      // A new handler each render, as callers write it.
      useBarcodeScanner({ suffixKey: 'Enter', onScan: (code) => onScan(code) });
      return <input data-testid="search" value={value} onChange={(e) => setValue(e.target.value)} />;
    }
    render(<Host />);
    (screen.getByTestId('search') as HTMLInputElement).focus();

    await user.keyboard('807010000007678{Enter}');

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

// ---------------------------------------------------------------------------
// useBarcodeScanner — regression: don't get stuck after rapid typing
// ---------------------------------------------------------------------------
//
// User report (v0.5.11 production): "mashed some keys on the keyboard ...
// after that the keyboard stopped working in the application, but the
// keyboard worked in notepad". Bug was: scanning state entered on a fast
// burst, never exited because the suffix key never arrived, and every
// subsequent letter keystroke was preventDefault'd by the capture-phase
// listener — app-wide, regardless of focused element. Backspace/arrows
// kept working (not classified as `isChar`).
//
// Two fixes covered below:
//   1. Watchdog timeout resets scanning state after inactivity.
//   2. preventDefault is skipped inside editable elements even during
//      scanning, so the user's typing is never silently swallowed even
//      if the scan-burst heuristic misfires.

describe('useBarcodeScanner — regression: stuck-scanning recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exits scanning mode via watchdog when suffix never arrives', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));

    // Simulate a fast burst that triggers scan detection. Dispatch raw
    // keyboard events on window (capture-phase listener picks them up
    // before any input would).
    const burst = ['1', '2', '3', '4', '5'];
    for (const key of burst) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    // Now without pressing Enter, dispatch a letter as if the user
    // resumed normal typing. While stuck in scanning mode, the hook
    // would preventDefault this. We track preventDefault via the event.
    const stuckEvent = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    window.dispatchEvent(stuckEvent);
    expect(stuckEvent.defaultPrevented).toBe(true);

    // Advance time past the watchdog threshold (1500ms). The hook
    // should reset scanning state.
    vi.advanceTimersByTime(2000);

    // Now a fresh letter should NOT be preventDefault'd — keyboard
    // works again.
    const recoveredEvent = new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true });
    window.dispatchEvent(recoveredEvent);
    expect(recoveredEvent.defaultPrevented).toBe(false);
  });

  it('does not preventDefault letter keys when focus is in an editable element', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));

    // Mount a textarea and put focus on it. The hook should detect this
    // via document.activeElement and skip preventDefault for chars.
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    try {
      // Fast burst — triggers scan detection
      const burst = ['1', '2', '3', '4', '5'];
      for (const key of burst) {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }

      // While stuck-scanning, dispatch a letter as if the user resumed
      // typing into the textarea. preventDefault must NOT fire — the
      // user's typing has to flow into the field.
      const letterEvent = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      textarea.dispatchEvent(letterEvent);
      expect(letterEvent.defaultPrevented).toBe(false);

      // "12345a" is no chip, so its Enter belongs to the field (a new line
      // here). A real chip's Enter is still held back; see "prevents form
      // submission on the scanner Enter inside an input".
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      textarea.dispatchEvent(enterEvent);
      expect(enterEvent.defaultPrevented).toBe(false);
    } finally {
      document.body.removeChild(textarea);
    }
  });
});

// ---------------------------------------------------------------------------
// useBarcodeScanner — a scan never replaces text the user wrote
// ---------------------------------------------------------------------------

describe('useBarcodeScanner — focused field with text', () => {
  let onScan: ReturnType<typeof vi.fn>;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    onScan = vi.fn();
    user = userEvent.setup({ delay: 5 });
  });

  it('keeps the text of a focused textarea and drops the scanned characters', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(<textarea data-testid="notes" defaultValue="Calm, ate well." />);
    const notes = screen.getByTestId('notes') as HTMLTextAreaElement;
    await user.click(notes);

    await user.keyboard('C9C2540C01FE{Enter}');

    expect(notes.value).toBe('Calm, ate well.');
    expect(onScan).toHaveBeenCalledWith('807010000007678');
  });

  it('keeps the text of a focused notes-type input', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(<input name="notes" data-testid="notes" defaultValue="Owner called" />);
    const notes = screen.getByTestId('notes') as HTMLInputElement;
    await user.click(notes);

    await user.keyboard('807010000007678{Enter}');

    expect(notes.value).toBe('Owner called');
    expect(onScan).toHaveBeenCalledWith('807010000007678');
  });

  it('fills an empty focused field with the normalized chip', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(<textarea data-testid="notes" />);
    const notes = screen.getByTestId('notes') as HTMLTextAreaElement;
    await user.click(notes);

    await user.keyboard('C9C2540C01FE{Enter}');

    expect(notes.value).toBe('807010000007678');
  });

  it('replaces the text of a focused microchip field', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(<input id="microchipId" data-testid="chip" defaultValue="9851" />);
    const chip = screen.getByTestId('chip') as HTMLInputElement;
    await user.click(chip);

    await user.keyboard('C9C2540C01FE{Enter}');

    expect(chip.value).toBe('807010000007678');
  });

  it('replaces the text of a focused search field', async () => {
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(<input type="search" data-testid="search" defaultValue="Rex" />);
    const search = screen.getByTestId('search') as HTMLInputElement;
    await user.click(search);

    await user.keyboard('C9C2540C01FE{Enter}');

    expect(search.value).toBe('807010000007678');
  });
});

// frontend-data.md #5 / serial-pipeline.md #7: typed digits kept piling up in
// the scan buffer, so a number typed by hand plus Enter counted as a scan;
// and a fast typist's Enter was swallowed even when no chip was read.
describe('useBarcodeScanner — typing is not scanning', () => {
  it('a number typed by hand and Enter is not a scan', async () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(<input data-testid="notes" />);
    const input = screen.getByTestId('notes') as HTMLInputElement;
    input.focus();

    const human = userEvent.setup({ delay: 120 });
    await human.keyboard('123456789{Enter}');

    expect(onScan).not.toHaveBeenCalled();
    expect(input.value).toBe('123456789');
  });

  it('Enter after fast typing that is no chip still submits the form', async () => {
    const onScan = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    renderHook(() => useBarcodeScanner({ onScan, suffixKey: 'Enter' }));
    render(
      <form onSubmit={onSubmit}>
        <input data-testid="search" />
        <button type="submit">Go</button>
      </form>,
    );
    (screen.getByTestId('search') as HTMLInputElement).focus();

    const fast = userEvent.setup({ delay: 5 });
    await fast.keyboard('rex{Enter}');

    expect(onScan).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalled();
  });
});
