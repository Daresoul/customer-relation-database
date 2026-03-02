/**
 * Lightweight barcode-scanner detector using keyboard events.
 *
 * Goals:
 * - Treat fast, bursty keystrokes as a scan (vs human typing).
 * - Optionally require a prefix/suffix to reduce false positives.
 * - Prevent default only during an active scan so normal typing isn’t affected.
 * - Only runs when this window is focused; won’t capture in other apps.
 */

import { useEffect, useRef } from 'react';

export interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  // Require a prefix at the start of the scan (e.g., "SCN-")
  prefix?: string;
  // Finalize on a specific terminating key (e.g., Enter). If not provided, will finalize on timeout.
  suffixKey?: 'Enter' | 'Tab';
  // Minimum number of characters to consider valid
  minLength?: number;
  // Maximum inter-key delay (ms) to consider part of a scan
  interKeyDelay?: number;
  // Timeout (ms) to finalize the scan if no keys arrive
  finalizeTimeout?: number;
  // Only accept these exact lengths (e.g., [15, 10] for microchips)
  allowedLengths?: number[];
  // If true, require all characters to be digits (common for microchips)
  digitsOnly?: boolean;
}

export function useBarcodeScanner(options: UseBarcodeScannerOptions) {
  const {
    onScan,
    prefix,
    // Default to requiring Enter to finalize
    suffixKey = 'Enter',
    // More conservative defaults to avoid false positives
    minLength = 8,
    interKeyDelay = 12,
    finalizeTimeout = 100,
    allowedLengths = [15, 10],
    digitsOnly = true,
  } = options;

  const bufferRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);
  const isScanningRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const reset = () => {
      bufferRef.current = '';
      lastTimeRef.current = 0;
      isScanningRef.current = false;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
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
      if (digitsOnly && !/^\d+$/.test(code)) return;
      if (code.length >= minLength) {
        onScan(code);
      }
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

      // If an editable element is focused, let input receive keys normally.
      const active = (document.activeElement as HTMLElement | null);
      const isEditable = !!active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        (active as any).isContentEditable === true
      );
      if (isEditable) {
        // Do not intercept or buffer when user is actively typing into a field
        return;
      }

      // If we are already in scanning mode, prevent default to avoid polluting inputs
      if (isScanningRef.current) {
        // Allow Enter/Tab to finalize without inserting
        if (suffixKey && e.key === suffixKey) {
          e.preventDefault();
          finalize();
          return;
        }
        if (isChar) {
          e.preventDefault();
          bufferRef.current += e.key;
          lastTimeRef.current = now;
          // If suffixKey is required, do not auto-finalize on timeout
          if (!suffixKey) scheduleFinalize();
        }
        return;
      }

      // Not currently scanning
      // Only consider if key is a character (or if suffix key is pressed after we already have something)
      if (!isChar) {
        // If suffix key is pressed right after characters, treat as finalize
        if (suffixKey && e.key === suffixKey && bufferRef.current.length >= minLength) {
          e.preventDefault();
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
        // Prevent this key from hitting the focused input
        e.preventDefault();
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
