#!/usr/bin/env python3
"""
Healvet HV-FIA 3000 Full Chemistry Panel Simulator

This script simulates a real Healvet device sending multiple test results.
The Healvet sends one parameter per message, so a full panel consists of
multiple messages sent sequentially.

Protocol: #AFS1000&SAMPLE_ID&RESULT&DATETIME&&PARAM_CODE&PATIENT_ID&&GENDER&SAMPLE_TYPE&EE

Usage:
    python3 test_healvet_full_panel.py <serial_port> [patient_id]

Example:
    python3 test_healvet_full_panel.py /dev/ttys012 DOG-12345
"""

import sys
import serial
import time
from datetime import datetime

# Healvet chemistry panel test data
# Format: (parameter_code, result_value, unit)
CHEMISTRY_PANEL = [
    ("T4-1", "25.3", "nmol/L"),         # Thyroid hormone (normal range: 15-60 for dogs)
    ("TSH-1", "0.15", "mIU/L"),         # Thyroid-stimulating hormone (normal: 0-0.6)
    ("Cortisol-1", "85.0", "nmol/L"),   # Cortisol before ACTH (normal: 20-110)
    ("cCRP", "5.2", "mg/L"),            # C-reactive protein (normal: 0-10 for dogs)
    ("D-Dimer", "120.0", "ng/mL"),      # D-Dimer (normal: 0-250)
    ("SAA", "3.1", "mg/L"),             # Serum Amyloid A (normal: 0-5.4 for dogs)
]

def generate_healvet_message(sample_id, result, datetime_str, param_code, patient_id, gender="M", sample_type="1"):
    """
    Generate a Healvet protocol message.

    Protocol: #AFS1000&SAMPLE_ID&RESULT&DATETIME&&PARAM_CODE&PATIENT_ID&&GENDER&SAMPLE_TYPE&EE

    Fields:
    - Start marker: #AFS1000
    - Field 1: Sample ID (unique for each sample)
    - Field 2: Result value
    - Field 3: DateTime (YYYYMMDDHHMMSS)
    - Field 4: (empty)
    - Field 5: Parameter code (e.g., "T4-1", "TSH-1")
    - Field 6: Patient ID (microchip or identifier)
    - Field 7: (empty)
    - Field 8: Gender (M/F)
    - Field 9: Sample type (1=serum, 2=plasma, etc.)
    - End marker: EE
    """
    message = f"#AFS1000&{sample_id}&{result}&{datetime_str}&&{param_code}&{patient_id}&&{gender}&{sample_type}&EE"
    return message

def send_chemistry_panel(port_name, patient_id="TESTDOG-001", delay_between_tests=0.0):
    """
    Send a full Healvet chemistry panel to the serial port.

    The real Healvet device sends ALL parameters in ONE continuous stream,
    all ending with a single EE marker. This matches the Java implementation
    which accumulates data until seeing "EE".

    Args:
        port_name: Serial port path (e.g., /dev/ttys012)
        patient_id: Patient identifier (microchip or ID)
        delay_between_tests: NOT USED - kept for backwards compatibility
    """
    print("=" * 70)
    print("Healvet HV-FIA 3000 Chemistry Panel Simulator")
    print("=" * 70)
    print(f"Serial Port: {port_name}")
    print(f"Patient ID: {patient_id}")
    print(f"Panel Size: {len(CHEMISTRY_PANEL)} tests")
    print("Transmission: ALL parameters in ONE continuous stream (real device behavior)")
    print("=" * 70)
    print()

    try:
        # Open serial port
        # Note: For PTY devices on macOS, baud rate doesn't matter
        ser = serial.Serial(
            port=port_name,
            baudrate=9600,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1
        )

        print(f"✅ Serial port opened: {port_name}")
        print()

        # Generate base sample ID (will increment for each test)
        base_sample_id = int(datetime.now().timestamp() * 1000) % 1000000
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Build complete transmission: All #AFS1000 messages concatenated, ending with single EE
        complete_transmission = ""

        print("📦 Building complete chemistry panel transmission...")
        for idx, (param_code, result, unit) in enumerate(CHEMISTRY_PANEL, 1):
            # Generate unique sample ID for this test
            sample_id = f"{base_sample_id + idx:06d}"

            # Generate message WITHOUT the EE marker (we'll add ONE at the end)
            message = f"#AFS1000&{sample_id}&{result}&{timestamp}&&{param_code}&{patient_id}&&M&1"

            complete_transmission += message
            print(f"   {idx}. {param_code} = {result} {unit}")

        # Add single EE marker at the very end
        complete_transmission += "&EE"

        print()
        print(f"📤 Sending complete panel ({len(complete_transmission)} bytes)...")
        print(f"   First 100 chars: {complete_transmission[:100]}...")
        print(f"   Last 100 chars: ...{complete_transmission[-100:]}")
        print()

        # Send entire transmission at once (like the real device)
        ser.write(complete_transmission.encode('utf-8'))
        ser.flush()

        print("✅ Transmission complete!")
        print()

        # Close serial port
        ser.close()
        print("=" * 70)
        print(f"✅ Complete! Sent chemistry panel with {len(CHEMISTRY_PANEL)} parameters for patient {patient_id}")
        print("=" * 70)
        print()
        print("Expected results in app:")
        print(f"  - 1 device file (chemistry panel) should be pending")
        print(f"  - Patient: {patient_id}")
        print(f"  - {len(CHEMISTRY_PANEL)} parameters: T4-1, TSH-1, Cortisol-1, cCRP, D-Dimer, SAA")
        print()

    except serial.SerialException as e:
        print(f"❌ Serial port error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(0)

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    port_name = sys.argv[1]
    patient_id = sys.argv[2] if len(sys.argv) > 2 else "TESTDOG-001"

    send_chemistry_panel(port_name, patient_id)

if __name__ == "__main__":
    main()
