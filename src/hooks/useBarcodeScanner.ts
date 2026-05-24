/**
 * Lightweight barcode-scanner detector using keyboard events.
 *
 * Goals:
 * - Treat fast, bursty keystrokes as a scan (vs human typing).
 * - Optionally require a prefix/suffix to reduce false positives.
 * - Prevent default only during an active scan so normal typing isn’t affected.
 * - Only runs when this window is focused; won’t capture in other apps.
 * - If a scan lands inside an editable element, replace its value with the
 *   normalized form so the field never shows the raw hex from FDX-B readers.
 */

import { useEffect, useRef } from 'react';

/**
 * Set the value of a React-controlled <input>/<textarea> programmatically so
 * the framework's onChange handler fires. React listens to the input's value
 * via a property descriptor it owns; we have to call the native setter and
 * dispatch an 'input' event to bypass its bookkeeping.
 */
function setReactInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function isEditableElement(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  return (el as HTMLElement).isContentEditable === true;
}

export interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  // Require a prefix at the start of the scan (e.g., "SCN-")
  prefix?: string;
  // Finalize on a specific terminating key (e.g., Enter). If not provided, will finalize on timeout.
  suffixKey?: 'Enter' | 'Tab';
  // Minimum number of characters to consider valid
  minLength?: number;
  // Maximum inter-key delay (ms) to consider part of a scan.
  // Industry standard: 50ms (use-scan-detection). Covers Honeywell (~10ms) through
  // Zebra (~80ms) while staying well below human typing speed (200-400ms).
  interKeyDelay?: number;
  // Timeout (ms) to finalize the scan if no keys arrive
  finalizeTimeout?: number;
  // Only accept these exact lengths (e.g., [15, 12, 10, 9] for microchips).
  // 15 = ISO 11784 FDX-B passport decimal, 12 = ISO 11784 FDX-B raw 48-bit hex,
  // 10 = AVID FDX-A, 9 = legacy European.
  allowedLengths?: number[];
  // If true, require all characters to be digits (with hex exception for 10- and 12-char codes)
  digitsOnly?: boolean;
}

/**
 * Normalize a microchip read to its canonical 15-digit FDX-B passport form.
 *
 * Some readers emit the raw 48-bit FDX-B ID as 12 hex characters instead of
 * the 15-digit decimal printed on the pet passport. We normalize at the
 * detection boundary so consumers and storage see one consistent format
 * regardless of how the scanner is configured.
 *
 * 12-hex bit layout: top 10 bits = ISO 3166-1 country, bottom 38 bits = animal ID.
 */
export function normalizeMicrochip(code: string): string {
  if (code.length === 12 && /^[0-9A-Fa-f]+$/.test(code)) {
    const n = BigInt('0x' + code);
    const country = Number((n >> 38n) & 0x3FFn);
    const animal = n & ((1n << 38n) - 1n);
    return country.toString().padStart(3, '0') + animal.toString().padStart(12, '0');
  }
  return code;
}

export function useBarcodeScanner(options: UseBarcodeScannerOptions) {
  const {
    onScan,
    prefix,
    // Default to requiring Enter to finalize
    suffixKey = 'Enter',
    // More conservative defaults to avoid false positives
    minLength = 8,
    // 50ms: industry standard (use-scan-detection). Catches Zebra (~80ms) while
    // staying well below human typing speed (200-400ms).
    interKeyDelay = 50,
    finalizeTimeout = 100,
    // 15 = ISO FDX-B passport decimal, 12 = ISO FDX-B raw hex,
    // 10 = AVID FDX-A (hex), 9 = legacy European
    allowedLengths = [15, 12, 10, 9],
    digitsOnly = true,
  } = options;

  const bufferRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);
  const isScanningRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);
  // Safety watchdog: if scanning state is entered but never resolved by a
  // suffix key (e.g., the user mashed letters fast and stopped without
  // pressing Enter), we'd otherwise stay in scanning mode forever and
  // preventDefault every subsequent letter keystroke app-wide. The
  // watchdog hard-resets state after a period of inactivity.
  const watchdogRef = useRef<number | null>(null);
  // Dedup: prevent the same code from firing twice within 500ms
  const lastScanRef = useRef<{ code: string; time: number } | null>(null);

  useEffect(() => {
    const reset = () => {
      bufferRef.current = '';
      lastTimeRef.current = 0;
      isScanningRef.current = false;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (watchdogRef.current) {
        window.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
    };

    // Reset scanning state if no key activity for this long. Long enough
    // that real scanners (which finish a chip ID in <500ms) never trigger
    // it, short enough that a stuck-scanning state from accidental fast
    // typing self-recovers before the user notices their keyboard is
    // unresponsive for long. 1500ms is roughly the time it takes to type
    // 6-7 characters at a relaxed pace.
    const WATCHDOG_MS = 1500;
    const scheduleWatchdog = () => {
      if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
      watchdogRef.current = window.setTimeout(() => {
        // Soft reset — we abandon the buffered burst rather than calling
        // finalize() so we don't try to emit a malformed scan from
        // partial input that's now stale.
        bufferRef.current = '';
        lastTimeRef.current = 0;
        isScanningRef.current = false;
        watchdogRef.current = null;
      }, WATCHDOG_MS) as unknown as number;
    };

    const finalize = () => {
      const raw = bufferRef.current;
      reset();
      if (!raw) return;
      // Strip prefix if configured
      if (prefix) {
        if (!raw.startsWith(prefix)) return; // Not a scan we care about
      }
      const code = prefix ? raw.slice(prefix.length) : raw;
      // Enforce exact lengths
      if (!allowedLengths.includes(code.length)) return;
      // Validate character set based on code length
      if (digitsOnly) {
        if (code.length === 10 || code.length === 12) {
          // AVID FDX-A (10) and raw FDX-B (12): hex digits (0-9, A-F)
          if (!/^[0-9A-Fa-f]+$/.test(code)) return;
        } else {
          // ISO 15-digit and legacy 9-digit: digits only
          if (!/^\d+$/.test(code)) return;
        }
      }
      if (code.length < minLength) return;
      // Normalize: 12-hex FDX-B reads are converted to the 15-digit passport form
      // so downstream consumers always see a single canonical representation.
      const normalized = normalizeMicrochip(code);
      // Dedup: skip if same code scanned within 500ms (dedup against normalized form)
      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.code === normalized &&
        now - lastScanRef.current.time < 500
      ) {
        return;
      }
      lastScanRef.current = { code: normalized, time: now };

      // If the burst landed in an editable element, the raw chars may have
      // partially leaked into it before scan-detection kicked in. Replace
      // with the normalized form so the field never shows hex.
      const active = document.activeElement;
      if (
        active &&
        (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
      ) {
        setReactInputValue(active, normalized);
      }
      // Always notify the consumer so it can run auto-select / prefill / search
      // logic. Consumers that care about which field was focused can inspect
      // document.activeElement themselves.
      onScan(normalized);
    };

    const scheduleFinalize = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(finalize, finalizeTimeout) as unknown as number;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys and combinations
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const now = performance.now();
      const isChar = e.key.length === 1 || e.key === '-' || e.key === '.' || e.key === '_' || e.key === '/';

      // If an editable element is focused, let keystrokes flow into it normally
      // (preventDefault would block the user's typing). We still track timing
      // and buffer the burst so finalize() can replace the value with the
      // normalized form if it turns out to be a microchip scan.
      const editable = isEditableElement(document.activeElement);

      // Once we've recognized this as a scan burst, behavior depends on
      // whether the user is in an editable element:
      //   - Suffix key (typically Enter): ALWAYS preventDefault, even in
      //     editable elements. Otherwise the Enter that terminates the
      //     scan would also submit the surrounding form before finalize()
      //     can set the normalized value.
      //   - Char keys in an editable element: do NOT preventDefault. We
      //     still buffer them for finalize() to overwrite the field with
      //     the normalized form if it turns out to be a real scan. The
      //     code comment block above (line ~179) promised this behavior
      //     but v0.5.x had a regression where chars got preventDefault'd
      //     unconditionally — symptom was "letters stop typing in the
      //     whole app after mashing keys fast" because the scanning
      //     state could get stuck and silently swallow every letter.
      //   - Char keys outside editable elements: preventDefault as before
      //     so stray scanner output doesn't navigate / trigger shortcuts.
      if (isScanningRef.current) {
        if (suffixKey && e.key === suffixKey) {
          e.preventDefault();
          finalize();
          return;
        }
        if (isChar) {
          if (!editable) {
            e.preventDefault();
          }
          bufferRef.current += e.key;
          lastTimeRef.current = now;
          // Re-arm the safety watchdog on every char. If the user is
          // genuinely scanning, the suffix key arrives in well under
          // WATCHDOG_MS and finalize() clears it. If they were just
          // typing fast and stopped, the watchdog fires and we exit
          // scanning mode cleanly.
          scheduleWatchdog();
          if (!suffixKey) scheduleFinalize();
        }
        return;
      }

      // Not currently scanning
      // Only consider if key is a character (or if suffix key is pressed after we already have something)
      if (!isChar) {
        // If suffix key is pressed right after characters, treat as finalize
        if (suffixKey && e.key === suffixKey && bufferRef.current.length >= minLength) {
          if (!editable) e.preventDefault();
          finalize();
        }
        return;
      }

      // Determine if this is the start or continuation of a fast burst
      const delta = now - (lastTimeRef.current || now);
      lastTimeRef.current = now;

      // Append char
      if (isChar) bufferRef.current += e.key;

      // If we have at least 3 characters and the inter-key delay is small, assume scanning and start preventing defaults
      const longEnough = bufferRef.current.length >= 3;
      const fastEnough = delta <= interKeyDelay;

      // If a prefix is required, only enter scanning mode once buffer matches it
      const prefixOk = prefix ? bufferRef.current.startsWith(prefix) : true;

      if (longEnough && fastEnough && prefixOk) {
        isScanningRef.current = true;
        // Arm the safety watchdog the moment we enter scanning mode.
        // Without this, a burst that fails to complete (user just typing
        // fast then stopping, scanner output dropped mid-scan, etc.) would
        // leave isScanningRef pinned to true forever and silently swallow
        // every subsequent letter keystroke in the app.
        scheduleWatchdog();
        // For the trigger key itself: only preventDefault outside editable
        // elements. The first ≤2 chars before we recognized the burst may
        // have already landed in a focused textbox, and finalize() will
        // overwrite the value with the normalized form when the scan
        // completes — so letting the char through to the input here is
        // consistent and doesn't worsen the displayed state. In a
        // non-editable context (focus on a button, page background, etc.)
        // we still preventDefault to keep stray scanner chars from
        // triggering accelerators / navigation.
        if (!editable) {
          e.preventDefault();
        }
      }
      // If a suffixKey is required, do not auto-finalize via timeout; wait for suffix
      if (!suffixKey) scheduleFinalize();
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      reset();
    };
  }, [onScan, prefix, suffixKey, minLength, interKeyDelay, finalizeTimeout]);
}

export default useBarcodeScanner;
