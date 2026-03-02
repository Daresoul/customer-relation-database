#!/usr/bin/env python3
"""
Universal Scanner Simulator

One file that simulates a hardware barcode scanner as closely as possible on
your current OS. It types a fast 15‑digit (or 10‑digit) numeric code and then
presses Enter, matching the app’s keyboard‑wedge scan detector.

Behavior by OS
- macOS: uses AppleScript (osascript) to send keystrokes fast.
- Windows: uses PowerShell + WScript.Shell.SendKeys.
- Linux:
  - Preferred: python-uinput (registers a virtual keyboard device).
  - Fallback: xdotool type/Return (needs xdotool installed).

Limitations (true for physical HID keyboard scanners too)
- Cannot wake a hidden/tray app. Make sure the window is visible. Use our
  serial/file watcher simulations to test wake/focus from hidden.
- The app only captures scans when NO input field is focused. If you want to
  scan into a specific input, click it first; this script will type into it.

Examples
  python3 test-scripts/simulate_scanner.py
  python3 test-scripts/simulate_scanner.py --code 123456789012345
  python3 test-scripts/simulate_scanner.py --len 10 --delay-ms 3
  python3 test-scripts/simulate_scanner.py --focus "Veterinary Clinic Manager"

macOS: if keystrokes don’t appear, enable Accessibility for your Terminal/Python
in System Settings → Privacy & Security → Accessibility.
Linux uinput: run as root or grant write access to /dev/uinput.
"""

import argparse
import platform
import random
import string
import subprocess
import sys
import time


def gen_digits(n: int) -> str:
    return ''.join(random.choice(string.digits) for _ in range(n))


def run_mac(code: str, delay_ms: int, send_enter: bool, focus_title: str | None) -> int:
    if focus_title:
        osa = f'tell application "System Events" to tell application process "{focus_title}" to set frontmost to true'
        subprocess.run(["osascript", "-e", osa], check=False)
        time.sleep(0.1)

    chars = ",".join([f'"{c}"' for c in code])
    delay_s = max(0, delay_ms) / 1000.0
    osa = (
        "tell application "System Events" to "
        f"repeat with c in {{{chars}}} 
"
        f"  keystroke c 
"
        f"  delay {delay_s:.4f} 
"
        "end repeat
"
    )
    if send_enter:
        osa += "tell application "System Events" to key code 36
"  # Enter
    subprocess.run(["osascript", "-e", osa], check=True)
    return 0


def run_windows(code: str, delay_ms: int, send_enter: bool, focus_title: str | None) -> int:
    if focus_title:
        subprocess.run([
            "powershell", "-NoProfile", "-Command",
            f"$ws = New-Object -ComObject WScript.Shell; $null = $ws.AppActivate('{focus_title}');"
        ], check=False)
        time.sleep(0.1)

    payload = code + ("{ENTER}" if send_enter else "")
    ps = (
        "$ws = New-Object -ComObject WScript.Shell;"
        f"$ws.SendKeys('{payload}');"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
    return 0


def run_linux(code: str, delay_ms: int, send_enter: bool) -> int:
    # Try uinput first (most realistic), fall back to xdotool.
    try:
        import uinput  # type: ignore

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
                    continue
                device.emit_click(key)
                time.sleep(delay)
            if send_enter:
                device.emit_click(uinput.KEY_ENTER)
        return 0
    except ImportError:
        pass

    # Fallback to xdotool
    try:
        subprocess.run(["xdotool", "type", "--delay", str(max(1, delay_ms)), code], check=True)
        if send_enter:
            subprocess.run(["xdotool", "key", "Return"], check=True)
        return 0
    except FileNotFoundError:
        print("xdotool not found; install it or use python-uinput for a virtual device.", file=sys.stderr)
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Universal scanner simulator (keyboard wedge)")
    parser.add_argument("--code", help="Explicit numeric code to send")
    parser.add_argument("--len", type=int, default=15, help="Length if --code not given (default 15)")
    parser.add_argument("--delay-ms", type=int, default=3, help="Per-key delay in ms (default 3)")
    parser.add_argument("--no-enter", action="store_true", help="Do not send Enter at the end")
    parser.add_argument("--focus", help="Window title to focus before sending (best-effort, macOS/Windows)")
    args = parser.parse_args()

    if args.code:
        if not args.code.isdigit():
            print("--code must be digits only", file=sys.stderr)
            return 2
        code = args.code
    else:
        code = gen_digits(args.len)

    system = platform.system()
    send_enter = not args.no_enter
    try:
        if system == "Darwin":
            return run_mac(code, args.delay_ms, send_enter, args.focus)
        elif system == "Windows":
            return run_windows(code, args.delay_ms, send_enter, args.focus)
        else:
            return run_linux(code, args.delay_ms, send_enter)
    except subprocess.CalledProcessError as e:
        print("Failed to send keystrokes:", e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
