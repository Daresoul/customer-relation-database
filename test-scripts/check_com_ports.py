#!/usr/bin/env python3
"""
Quick diagnostic to check if COM ports are visible to Python
"""
import sys

try:
    import serial.tools.list_ports

    print("=" * 60)
    print("COM Port Detection Test")
    print("=" * 60)

    ports = list(serial.tools.list_ports.comports())

    if not ports:
        print("❌ No COM ports found!")
        print("\nPossible reasons:")
        print("1. com0com not installed properly")
        print("2. Virtual ports not created yet")
        print("3. System needs reboot after com0com installation")
        print("\nTry:")
        print("- Check Device Manager → Ports (COM & LPT)")
        print("- Reboot Windows if you just installed com0com")
        print("- Run 'setupc' as Administrator to verify ports")
    else:
        print(f"✅ Found {len(ports)} COM port(s):\n")
        for port in ports:
            print(f"  Port: {port.device}")
            print(f"  Description: {port.description}")
            print(f"  Hardware ID: {port.hwid}")
            print()

        # Check for specific ports
        port_names = [p.device for p in ports]
        expected = ['COM3', 'COM4', 'COM5', 'COM6']

        print("Expected com0com ports:")
        for port_name in expected:
            status = "✅ FOUND" if port_name in port_names else "❌ MISSING"
            print(f"  {port_name}: {status}")

    print("=" * 60)

except ImportError:
    print("❌ pyserial not installed!")
    print("Install with: pip install pyserial")
    sys.exit(1)
