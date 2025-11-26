#!/usr/bin/env python3
"""
Healvet HV-FIA 3000 Serial Data Simulator
Sends realistic test data to a virtual serial port for testing.

Usage:
    python test_healvet_sender.py /dev/ttys003
"""

import serial
import sys
import time
from datetime import datetime

def generate_healvet_sample(sample_id="12345", result="15.4", param_code="T4-1",
                           patient_id="PET001", gender="M", sample_type="1"):
    """
    Generate a valid Healvet data packet.

    Format: #AFS1000&03fa024bSAMPLEID&RESULT&DATETIME&&PARAMCODE&PATIENTID&&GENDER&SAMPLETYPE&EE

    Fields:
    - #AFS1000: Upload start marker
    - 03fa024b + sample_id: Sample identifier
    - result: Test result value
    - datetime: YYYYMMDDHHmmss format
    - (empty): Reserved field
    - param_code: Parameter code (T4-1, CRP, etc.)
    - patient_id: Patient identifier
    - (empty): Reserved field
    - gender: M or F
    - sample_type: Sample type code (1, 2, etc.)
    - EE: End marker (two E's)
    """
    current_time = datetime.now().strftime("%Y%m%d%H%M%S")

    packet = (
        f"#AFS1000"
        f"&03fa024b{sample_id}"
        f"&{result}"
        f"&{current_time}"
        f"&"  # Reserved field
        f"&{param_code}"
        f"&{patient_id}"
        f"&"  # Reserved field
        f"&{gender}"
        f"&{sample_type}"
        f"&EE"
    )

    return packet

# Predefined test samples based on common veterinary tests
TEST_SAMPLES = [
    {
        "name": "T4 (Thyroxine) - Normal",
        "sample_id": "12345",
        "result": "2.5",
        "param_code": "T4-1",
        "patient_id": "PET001",
        "gender": "M",
        "sample_type": "1"
    },
    {
        "name": "T4 (Thyroxine) - High",
        "sample_id": "12346",
        "result": "6.8",
        "param_code": "T4-1",
        "patient_id": "CAT002",
        "gender": "F",
        "sample_type": "1"
    },
    {
        "name": "CRP (C-Reactive Protein)",
        "sample_id": "12347",
        "result": "15.4",
        "param_code": "CRP",
        "patient_id": "DOG003",
        "gender": "M",
        "sample_type": "1"
    },
    {
        "name": "Cortisol",
        "sample_id": "12348",
        "result": "125.5",
        "param_code": "CORT-1",
        "patient_id": "DOG004",
        "gender": "F",
        "sample_type": "1"
    },
    {
        "name": "SAA (Serum Amyloid A)",
        "sample_id": "12349",
        "result": "5.2",
        "param_code": "SAA",
        "patient_id": "CAT005",
        "gender": "M",
        "sample_type": "1"
    }
]

def send_healvet_data(port_name, sample_index=0):
    """Send a Healvet data packet to the specified serial port."""

    if sample_index >= len(TEST_SAMPLES):
        sample_index = 0

    sample = TEST_SAMPLES[sample_index]

    try:
        # Open serial port at 9600 baud (Healvet default)
        port = serial.Serial(port_name, 9600, timeout=1)

        # Generate the data packet
        packet = generate_healvet_sample(**{k: v for k, v in sample.items() if k != 'name'})

        print(f"\n{'='*70}")
        print(f"Sending: {sample['name']}")
        print(f"{'='*70}")
        print(f"Patient ID: {sample['patient_id']}")
        print(f"Test: {sample['param_code']}")
        print(f"Result: {sample['result']}")
        print(f"\nRaw packet ({len(packet)} bytes):")
        print(packet)
        print(f"{'='*70}\n")

        # Send the packet
        port.write(packet.encode('utf-8'))
        port.flush()

        print(f"✅ Data sent successfully to {port_name}")

        time.sleep(0.1)
        port.close()

        return True

    except serial.SerialException as e:
        print(f"❌ Error opening serial port: {e}")
        print(f"\nTip: Make sure you've created virtual serial ports with:")
        print(f"    socat -d -d pty,raw,echo=0 pty,raw,echo=0")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_healvet_sender.py <serial_port> [sample_number]")
        print(f"\nExample: python test_healvet_sender.py /dev/ttys003")
        print(f"\nAvailable test samples:")
        for i, sample in enumerate(TEST_SAMPLES):
            print(f"  {i}: {sample['name']}")
        sys.exit(1)

    port_name = sys.argv[1]
    sample_index = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    send_healvet_data(port_name, sample_index)

if __name__ == "__main__":
    main()
