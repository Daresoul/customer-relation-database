#!/usr/bin/env python3
"""
Config-Based Serial Port Bridge for Testing
Reads device_ports.json to create virtual serial port pairs.
Your app connects to one side, test scripts send to the other.

Supports:
  - macOS/Linux: Uses socat for custom-named ports (e.g., /tmp/ttyHealvet_app)
  - Windows: Uses com0com or falls back to Python pty with random COM ports

Usage:
  python3 serial_bridge.py              # Use config file
  python3 serial_bridge.py --config device_ports.json
"""

import os
import sys
import signal
import subprocess
import argparse
import json
import time
import platform
import threading
from pathlib import Path

IS_WINDOWS = platform.system() == "Windows"


class UnixSerialBridge:
    """Serial bridge using socat (macOS/Linux) - supports custom port names."""

    def __init__(self, device_name, app_port, test_port):
        self.device_name = device_name
        self.app_port = app_port
        self.test_port = test_port
        self.socat_process = None

    def create(self):
        """Create virtual serial port pair using socat with named links."""
        # Remove old symlinks if they exist
        for port in [self.app_port, self.test_port]:
            if os.path.exists(port):
                try:
                    os.unlink(port)
                except:
                    pass

        # Start socat process to create bridged port pair
        cmd = [
            "socat",
            "-d", "-d",
            f"pty,raw,echo=0,link={self.app_port}",
            f"pty,raw,echo=0,link={self.test_port}"
        ]

        try:
            self.socat_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True
            )
        except FileNotFoundError:
            print("Error: socat not found. Please install it:")
            print("   macOS: brew install socat")
            print("   Linux: sudo apt-get install socat")
            sys.exit(1)

        # Wait for socat to create the symlinks
        max_wait = 2
        start = time.time()
        while time.time() - start < max_wait:
            if os.path.exists(self.app_port) and os.path.exists(self.test_port):
                return
            time.sleep(0.1)

        # Check if ports were created
        if not os.path.exists(self.app_port) or not os.path.exists(self.test_port):
            print(f"Failed to create ports for {self.device_name}")
            print(f"   Expected: {self.app_port} and {self.test_port}")
            self.close()
            sys.exit(1)

    def close(self):
        """Stop socat process and cleanup."""
        if self.socat_process:
            try:
                self.socat_process.terminate()
                self.socat_process.wait(timeout=2)
            except:
                try:
                    self.socat_process.kill()
                except:
                    pass

        # Cleanup symlinks
        for port in [self.app_port, self.test_port]:
            if os.path.exists(port):
                try:
                    os.unlink(port)
                except:
                    pass


class WindowsSerialBridge:
    """Serial bridge for Windows using Python pty fallback or com0com."""

    def __init__(self, device_name, app_port, test_port):
        self.device_name = device_name
        # On Windows, we'll try to use the configured COM ports if com0com is set up
        # Otherwise, we'll create a socket-based bridge
        self.app_port = app_port
        self.test_port = test_port
        self.server_socket = None
        self.client_socket = None
        self.threads = []
        self.running = True
        self._actual_app_port = None
        self._actual_test_port = None

    def create(self):
        """
        Create virtual serial port pair on Windows.

        Option 1: com0com is installed - use configured COM port pairs
        Option 2: Use socket-based bridge with pyserial's loop:// or socket://
        """
        # Check if com0com ports exist
        if self._check_com0com():
            print(f"   Using com0com ports: {self.app_port} <-> {self.test_port}")
            self._actual_app_port = self.app_port
            self._actual_test_port = self.test_port
            return

        # Fallback: Use socket-based pseudo-serial ports
        # pyserial supports socket:// URLs which we can use for testing
        import socket

        # Create a socket pair for bidirectional communication
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(('127.0.0.1', 0))  # Random available port
        self.server_socket.listen(1)

        server_port = self.server_socket.getsockname()[1]

        # Create second socket pair
        self.client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.client_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.client_socket.bind(('127.0.0.1', 0))
        self.client_socket.listen(1)

        client_port = self.client_socket.getsockname()[1]

        # Use socket:// URLs that pyserial understands
        self._actual_app_port = f"socket://127.0.0.1:{server_port}"
        self._actual_test_port = f"socket://127.0.0.1:{client_port}"

        print(f"   Note: com0com not found. Using socket bridge instead.")
        print(f"   For proper COM port emulation, install com0com:")
        print(f"   https://sourceforge.net/projects/com0com/")

    def _check_com0com(self):
        """Check if the configured COM ports exist (com0com installed)."""
        try:
            import serial.tools.list_ports
            available = [p.device for p in serial.tools.list_ports.comports()]
            return self.app_port in available and self.test_port in available
        except:
            return False

    @property
    def actual_app_port(self):
        return self._actual_app_port or self.app_port

    @property
    def actual_test_port(self):
        return self._actual_test_port or self.test_port

    def close(self):
        """Stop bridge and cleanup."""
        self.running = False

        if self.server_socket:
            try:
                self.server_socket.close()
            except:
                pass

        if self.client_socket:
            try:
                self.client_socket.close()
            except:
                pass


def load_config(config_path):
    """Load device configuration from JSON file."""
    if not config_path.exists():
        print(f"Error: Config file not found: {config_path}")
        print(f"\nExpected format:")

        if IS_WINDOWS:
            example = {
                "devices": [
                    {
                        "name": "Healvet",
                        "type": "healvet_hv_fia_3000",
                        "connection": "serial_port",
                        "app_port": "COM10",
                        "test_port": "COM11"
                    }
                ]
            }
        else:
            example = {
                "devices": [
                    {
                        "name": "Healvet",
                        "type": "healvet_hv_fia_3000",
                        "connection": "serial_port",
                        "app_port": "/tmp/ttyHealvet_app",
                        "test_port": "/tmp/ttyHealvet_test"
                    }
                ]
            }

        print(json.dumps(example, indent=2))
        sys.exit(1)

    with open(config_path) as f:
        config = json.load(f)

    # Filter only serial port devices
    serial_devices = [d for d in config.get("devices", []) if d.get("connection") == "serial_port"]

    return serial_devices


def get_default_ports(device_name):
    """Get default port names based on platform."""
    if IS_WINDOWS:
        # Windows: Use COM ports (requires com0com for virtual ports)
        # Common com0com pairs: COM10/COM11, COM12/COM13, etc.
        port_map = {
            "Healvet": ("COM10", "COM11"),
            "Pointcare": ("COM12", "COM13"),
        }
        return port_map.get(device_name, ("COM20", "COM21"))
    else:
        # Unix: Use /tmp paths with custom names
        return (f"/tmp/tty{device_name}_app", f"/tmp/tty{device_name}_test")


def main():
    parser = argparse.ArgumentParser(
        description="Config-based serial port bridge for testing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Examples:
  # Use default config file (device_ports.json)
  python3 serial_bridge.py

  # Use custom config file
  python3 serial_bridge.py --config my_ports.json

Platform: {platform.system()}

Config File Format ({platform.system()}):
{json.dumps({
    "devices": [
        {
            "name": "Healvet",
            "type": "healvet_hv_fia_3000",
            "connection": "serial_port",
            "app_port": "COM10" if IS_WINDOWS else "/tmp/ttyHealvet_app",
            "test_port": "COM11" if IS_WINDOWS else "/tmp/ttyHealvet_test"
        }
    ]
}, indent=2)}

{"Windows Notes:" if IS_WINDOWS else "Unix Notes:"}
{'''  - Install com0com for virtual COM port pairs: https://sourceforge.net/projects/com0com/
  - Configure port pairs in com0com setup (e.g., COM10 <-> COM11)
  - Without com0com, socket-based fallback will be used''' if IS_WINDOWS else '''  - Uses socat for custom-named virtual serial ports
  - Install socat: brew install socat (macOS) or apt install socat (Linux)
  - Port names can be any valid path (e.g., /tmp/ttyMyDevice)'''}
        """
    )

    parser.add_argument("--config", type=Path, default=Path(__file__).parent / "device_ports.json",
                        help="Path to config JSON file (default: device_ports.json)")

    args = parser.parse_args()

    # Load config
    serial_devices = load_config(args.config)

    if not serial_devices:
        print("Error: No serial port devices found in config")
        sys.exit(1)

    # Select bridge class based on platform
    BridgeClass = WindowsSerialBridge if IS_WINDOWS else UnixSerialBridge

    # Create bridges
    bridges = []
    for device in serial_devices:
        default_app, default_test = get_default_ports(device["name"])
        app_port = device.get("app_port", default_app)
        test_port = device.get("test_port", default_test)

        print(f"Creating bridge for {device['name']}...")
        bridge = BridgeClass(device["name"], app_port, test_port)
        bridge.create()
        bridges.append({
            "bridge": bridge,
            "config": device
        })

    # Setup signal handler for clean exit
    def signal_handler(sig, frame):
        print("\n\nShutting down bridges...")
        for item in bridges:
            item["bridge"].close()
        print("All bridges closed.")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Print summary
    print()
    print("=" * 70)
    print(f"Serial Port Bridge - {platform.system()}")
    print("=" * 70)
    print(f"Config file: {args.config}")
    print(f"Created {len(bridges)} port pair(s):\n")

    for i, item in enumerate(bridges, 1):
        bridge = item["bridge"]
        config = item["config"]

        # Get actual ports (may differ on Windows with socket fallback)
        if IS_WINDOWS:
            app_port = getattr(bridge, 'actual_app_port', bridge.app_port)
            test_port = getattr(bridge, 'actual_test_port', bridge.test_port)
        else:
            app_port = bridge.app_port
            test_port = bridge.test_port

        print(f"{i}. {bridge.device_name} ({config['type']})")
        print(f"   App Port (configure in app):  {app_port}")
        print(f"   Test Port (for test script): {test_port}")
        print()

    print("=" * 70)
    print("Configuration for App:")
    print("=" * 70)
    print("In Settings -> Device Integrations, configure:")
    for item in bridges:
        bridge = item["bridge"]
        if IS_WINDOWS:
            app_port = getattr(bridge, 'actual_app_port', bridge.app_port)
        else:
            app_port = bridge.app_port
        print(f"  {bridge.device_name}: {app_port}")
    print()

    print("=" * 70)
    print("To send test data:")
    print("=" * 70)

    # Build test command
    test_cmd_parts = ["python test_devices.py" if IS_WINDOWS else "python3 test_devices.py"]

    # Check for Exigo in config
    try:
        all_devices = load_config(args.config)
        # Re-read full config to check for file_watch devices
        with open(args.config) as f:
            full_config = json.load(f)
        has_exigo = any(d.get("connection") == "file_watch" for d in full_config.get("devices", []))
        if has_exigo:
            test_cmd_parts.append("--exigo")
    except:
        pass

    for item in bridges:
        bridge = item["bridge"]
        device_type = item["config"]["type"]

        if IS_WINDOWS:
            test_port = getattr(bridge, 'actual_test_port', bridge.test_port)
        else:
            test_port = bridge.test_port

        if "healvet" in device_type.lower():
            test_cmd_parts.append(f"--healvet {test_port}")
        elif "pointcare" in device_type.lower() or "mnchip" in device_type.lower():
            test_cmd_parts.append(f"--pointcare {test_port}")

    test_cmd_parts.append("--parallel")
    print(f"  {' '.join(test_cmd_parts)}")
    print()

    print("=" * 70)
    print("Press Ctrl+C to stop all bridges")
    print("=" * 70)

    # Keep running
    try:
        signal.pause()
    except AttributeError:
        # signal.pause() not available on Windows
        while True:
            time.sleep(1)


if __name__ == "__main__":
    main()
