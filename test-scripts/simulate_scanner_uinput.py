#!/usr/bin/env python3
"""
Linux-only: Simulate a USB/Bluetooth barcode scanner by creating a virtual
keyboard device via /dev/uinput and emitting key events at scanner speed.

Why this is "correct enough"
- Many scanners present as HID keyboards ("keyboard wedge").
- This script uses the kernel's uinput to register a real input device
  (no window focus hacks), so the OS treats it like a hardware keyboard.

Prerequisites
- Linux with uinput enabled (most distros).
- Install python-uinput:  pip install python-uinput
- Run as root (or grant write access to /dev/uinput):  sudo python3 test-scripts/simulate_scanner_uinput.py

Usage
  sudo python3 test-scripts/simulate_scanner_uinput.py             # random 15-digit + Enter
  sudo python3 test-scripts/simulate_scanner_uinput.py --code 123456789012345
  sudo python3 test-scripts/simulate_scanner_uinput.py --len 10    # legacy 10-digit
  sudo python3 test-scripts/simulate_scanner_uinput.py --delay-ms 3

Notes
- This cannot wake a hidden app; it behaves like a real keyboard device.
- Your app must be visible/focused to receive keys (unless it captures devices directly).
"""

import argparse
import random
import string
import time

try:
    import uinput  # type: ignore
except ImportError as e:
    raise SystemExit("python-uinput not installed. Install with: pip install python-uinput")


def gen_digits(n: int) -> str:
    return ''.join(random.choice(string.digits) for _ in range(n))


# Map ASCII digits to uinput key codes
KEYMAP = {
    '0': uinput.KEY_0,
    '1': uinput.KEY_1,
    '2': uinput.KEY_2,
    '3': uinput.KEY_3,
    '4': uinput.KEY_4,
    '5': uinput.KEY_5,
    '6': uinput.KEY_6,
    '7': uinput.KEY_7,
    '8': uinput.KEY_8,
    '9': uinput.KEY_9,
}


def send_code(code: str, delay_ms: int, send_enter: bool) -> None:
    events = [
        uinput.KEY_0, uinput.KEY_1, uinput.KEY_2, uinput.KEY_3, uinput.KEY_4,
        uinput.KEY_5, uinput.KEY_6, uinput.KEY_7, uinput.KEY_8, uinput.KEY_9,
        uinput.KEY_ENTER,
    ]
    with uinput.Device(events, name="VirtualBarcodeScanner") as device:
        delay = max(0, delay_ms) / 1000.0
        for ch in code:
            key = KEYMAP.get(ch)
            if key is None:
                continue  # digits only
            device.emit_click(key)
            time.sleep(delay)
        if send_enter:
            device.emit_click(uinput.KEY_ENTER)


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate a barcode scanner via uinput")
    parser.add_argument("--code", help="Explicit numeric code to send")
    parser.add_argument("--len", type=int, default=15, help="Length to generate if --code not given (default 15)")
    parser.add_argument("--delay-ms", type=int, default=3, help="Per-key delay in ms (default 3)")
    parser.add_argument("--no-enter", action="store_true", help="Do not send Enter at end")
    args = parser.parse_args()

    code = args.code if args.code else gen_digits(args.len)
    if not code.isdigit():
        print("Code must be digits-only")
        return 2

    send_code(code, args.delay_ms, not args.no_enter)
    print(f"Sent code as virtual scanner: {code}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
