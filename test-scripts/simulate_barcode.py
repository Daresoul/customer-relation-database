#!/usr/bin/env python3
"""
Simulate a 15- (or 10-) digit barcode scan via keyboard wedge keystrokes.

Notes
- The target application window must be focused (frontmost) for keystrokes to be received.
- On macOS, you may need to grant Accessibility permissions to Terminal/Python to send keystrokes.
- The app’s detector is tuned for very fast bursts with Enter at the end; this script sends keys rapidly.

Usage
  python3 test-scripts/simulate_barcode.py                   # random 15-digit, with Enter
  python3 test-scripts/simulate_barcode.py --code 123456789012345
  python3 test-scripts/simulate_barcode.py --len 10         # random 10-digit legacy
  python3 test-scripts/simulate_barcode.py --focus "Veterinary Clinic Manager"

Options
- --code: explicit code to send (digits only)
- --len / -n: length (default 15). Common values: 15 (ISO microchip) or 10 (legacy)
- --delay-ms: per-key delay in milliseconds (default 4)
- --no-enter: do not send Enter at the end (default sends Enter)
- --focus: attempt to focus window by title before sending (best-effort)
"""

import argparse
import platform
import random
import string
import subprocess
import sys
import time


def gen_digits(length: int) -> str:
    return ''.join(random.choice(string.digits) for _ in range(length))


def focus_window_mac(title: str) -> None:
    # Best-effort: try to activate the app by title
    osa = f'tell application "System Events" to tell application process "{title}" to set frontmost to true'
    try:
        subprocess.run(["osascript", "-e", osa], check=False)
    except Exception:
        pass


def send_mac(code: str, delay_ms: int, send_enter: bool) -> None:
    # Build AppleScript to send characters with small delay between
    chars = ",".join([f'"{c}"' for c in code])
    delay_s = max(0, delay_ms) / 1000.0
    osa = (
        "tell application \"System Events\" to "
        f"repeat with c in {{{chars}}} \n"
        f"  keystroke c \n"
        f"  delay {delay_s:.4f} \n"
        "end repeat\n"
    )
    if send_enter:
        osa += "tell application \"System Events\" to key code 36\n"  # Enter
    subprocess.run(["osascript", "-e", osa], check=True)


def focus_window_windows(title: str) -> None:
    try:
        subprocess.run([
            "powershell", "-NoProfile", "-Command",
            f"$ws = New-Object -ComObject WScript.Shell; $null = $ws.AppActivate('{title}');"
        ], check=False)
    except Exception:
        pass


def send_windows(code: str, delay_ms: int, send_enter: bool) -> None:
    # Use WScript.Shell.SendKeys; braces escape special characters
    enter = "{ENTER}" if send_enter else ""
    payload = code + enter
    ps = (
        "$ws = New-Object -ComObject WScript.Shell;"
        f"$ws.SendKeys('{payload}');"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)


def send_linux(code: str, delay_ms: int, send_enter: bool) -> None:
    # Requires xdotool to be installed
    delay = max(1, delay_ms)
    subprocess.run(["xdotool", "type", f"--delay", str(delay), code], check=True)
    if send_enter:
        subprocess.run(["xdotool", "key", "Return"], check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate a rapid barcode scan (keyboard wedge)")
    parser.add_argument("--code", help="Explicit code to send (digits only)")
    parser.add_argument("--len", "-n", type=int, default=15, help="Length when generating (default 15)")
    parser.add_argument("--delay-ms", type=int, default=4, help="Per-key delay in ms (default 4)")
    parser.add_argument("--no-enter", action="store_true", help="Do not send Enter at the end")
    parser.add_argument("--focus", help="Window title to focus before sending (best-effort)")
    args = parser.parse_args()

    if args.code:
        if not args.code.isdigit():
            print("--code must be digits only", file=sys.stderr)
            return 2
        code = args.code
    else:
        code = gen_digits(args.len)

    send_enter = not args.no_enter

    system = platform.system()
    if args.focus:
        if system == "Darwin":
            focus_window_mac(args.focus)
            time.sleep(0.1)
        elif system == "Windows":
            focus_window_windows(args.focus)
            time.sleep(0.1)
        # For Linux, rely on WM focus policy or external focus tools

    try:
        if system == "Darwin":
            send_mac(code, args.delay_ms, send_enter)
        elif system == "Windows":
            send_windows(code, args.delay_ms, send_enter)
        else:
            send_linux(code, args.delay_ms, send_enter)
        print(f"Sent code: {code}")
        return 0
    except FileNotFoundError as e:
        print("Missing tool for this platform (osascript/xdotool/powershell)", file=sys.stderr)
        print(e, file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as e:
        print("Failed to send keystrokes:", e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

