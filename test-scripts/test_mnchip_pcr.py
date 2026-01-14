#!/usr/bin/env python3
"""
MNCHIP PCR Analyzer Simulator
Sends HL7 v2.x formatted messages over serial port for pathogen/viral testing
"""

import serial
import sys
import time
from datetime import datetime

def create_hl7_message(patient_id="DOG123", test_panel="respiratory"):
    """
    Create HL7 v2.x message for MNCHIP PCR Analyzer

    Test Panels:
    - respiratory: CDV, CPIV, CCV, CAV-2 (Canine Respiratory Panel)
    - parvo: CPV (Canine Parvovirus)
    - feline: FPV, FCV, FHV (Feline Panel)

    Message structure:
    - MSH: Message Header
    - PID: Patient Identification
    - OBR: Observation Request
    - OBX: Observation Result (one per pathogen)
    """

    # Current timestamp in HL7 format: YYYYMMDDHHmmss
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

    # MSH: Message Header - PCR version uses "PointcarePCRV"
    msh = "MSH|^~\\&|PointcarePCRV|MNCHIP|||20251125143000||ORU^R01|MSG001|P|2.3\r"

    # PID: Patient Identification
    pid = f"PID|1||||dog|{patient_id}|||20200101000000|M\r"

    # OBR: Observation Request
    obr = f"OBR|||||||{timestamp}||||||||1|||||||||||||||||PCR\r"

    # PCR Results - Qualitative (Positive/Negative) with Ct values
    # Result format: "POS" or "NEG", Ct value in result field
    if test_panel == "respiratory":
        parameters = [
            ("1", "CDV", "NEG", "", "", "N"),      # Canine Distemper Virus
            ("2", "CPIV", "NEG", "", "", "N"),     # Canine Parainfluenza Virus
            ("3", "CCV", "POS", "28.5", "Ct", "H"), # Canine Coronavirus (Positive)
            ("4", "CAV-2", "NEG", "", "", "N"),    # Canine Adenovirus Type 2
            ("5", "CIV", "NEG", "", "", "N"),      # Canine Influenza Virus
            ("6", "Bordetella", "POS", "31.2", "Ct", "H"),  # Bordetella bronchiseptica
        ]
    elif test_panel == "parvo":
        parameters = [
            ("1", "CPV", "POS", "22.1", "Ct", "H"),  # Canine Parvovirus (Strong Positive)
        ]
    elif test_panel == "feline":
        parameters = [
            ("1", "FPV", "NEG", "", "", "N"),      # Feline Panleukopenia Virus
            ("2", "FCV", "POS", "29.8", "Ct", "H"), # Feline Calicivirus
            ("3", "FHV", "NEG", "", "", "N"),      # Feline Herpesvirus
            ("4", "FeLV", "NEG", "", "", "N"),     # Feline Leukemia Virus
            ("5", "FIV", "NEG", "", "", "N"),      # Feline Immunodeficiency Virus
        ]
    else:
        # Default mixed panel
        parameters = [
            ("1", "CDV", "NEG", "", "", "N"),
            ("2", "CPV", "NEG", "", "", "N"),
            ("3", "CCV", "NEG", "", "", "N"),
        ]

    obx_lines = []
    for exam_num, param_code, result, ct_value, unit, indicator in parameters:
        # For PCR, result is qualitative but we also include Ct if positive
        if ct_value:
            obx = f"OBX|{exam_num}|||{param_code}|{result}|{unit}|{ct_value}|{indicator}\r"
        else:
            obx = f"OBX|{exam_num}|||{param_code}|{result}|||{indicator}\r"
        obx_lines.append(obx)

    # Combine all parts (HL7 content)
    hl7_content = msh + pid + obr + "".join(obx_lines)

    # MLLP framing:
    # - Start: 0x0B (VT - Vertical Tab)
    # - End: 0x1C 0x0D (FS CR - File Separator + Carriage Return)
    mllp_start = chr(0x0B)  # VT
    mllp_end = chr(0x1C) + chr(0x0D)  # FS + CR

    message = mllp_start + hl7_content + mllp_end

    return message, len(parameters)

def send_pcr_data(port, patient_id="DOG123", test_panel="respiratory", baud_rate=115200):
    """Send HL7 message via serial port"""
    try:
        # Open serial port
        ser = serial.Serial(
            port=port,
            baudrate=baud_rate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1
        )

        print("=" * 70)
        print("MNCHIP PCR Analyzer Simulator")
        print("=" * 70)
        print(f"Serial Port: {port}")
        print(f"Baud Rate: {baud_rate}")
        print(f"Patient ID: {patient_id}")
        print(f"Test Panel: {test_panel}")
        print(f"Protocol: HL7 v2.x with MLLP framing (0x0B start, 0x1C 0x0D end)")
        print("=" * 70)

        print(f"\n✅ Serial port opened: {port}")

        # Generate HL7 message
        message, param_count = create_hl7_message(patient_id=patient_id, test_panel=test_panel)

        print(f"\n📦 Sending HL7 message with MLLP framing ({len(message)} bytes)...")
        print(f"   HL7 segments: {message.count(chr(13))} lines")
        print(f"   Parameters: {param_count} pathogen tests")
        print(f"   MLLP: 0x0B (start) + HL7 content + 0x1C 0x0D (end)")

        # Show preview of HL7 content (skip MLLP start byte)
        hl7_preview = message[1:300].replace('\r', '\\r\n   ')
        print(f"   Preview:\n   {hl7_preview}...")

        # Send MLLP start byte
        ser.write(bytes([0x0B]))
        time.sleep(0.01)

        # Send HL7 content line by line (without the MLLP framing bytes)
        hl7_content = message[1:-2]  # Remove start byte and end bytes
        lines = hl7_content.split('\r')
        for line in lines:
            if line:  # Skip empty lines
                ser.write((line + '\r').encode('utf-8'))
                time.sleep(0.03)  # Small delay between lines

        # Send MLLP end sequence (0x1C 0x0D)
        ser.write(bytes([0x1C, 0x0D]))

        print(f"\n✅ Transmission complete!")

        # Close serial port
        ser.close()

        print("\n" + "=" * 70)
        print("✅ Complete! Sent PCR results for patient", patient_id)
        print("=" * 70)

        print("\nExpected results in app:")
        print(f"  - 1 device file (PCR panel) should be pending")
        print(f"  - Patient: {patient_id} (species: dog)")
        print(f"  - {param_count} pathogen tests")

    except serial.SerialException as e:
        print(f"❌ Serial port error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 test_mnchip_pcr.py <serial_port> [patient_id] [test_panel]")
        print("Example: python3 test_mnchip_pcr.py /dev/ttys013 DOG123 respiratory")
        print("\nTest Panels:")
        print("  respiratory - CDV, CPIV, CCV, CAV-2, CIV, Bordetella (6 tests)")
        print("  parvo       - CPV only (1 test)")
        print("  feline      - FPV, FCV, FHV, FeLV, FIV (5 tests)")
        sys.exit(1)

    port = sys.argv[1]
    patient_id = sys.argv[2] if len(sys.argv) > 2 else "TESTDOG-PCR01"
    test_panel = sys.argv[3] if len(sys.argv) > 3 else "respiratory"

    send_pcr_data(port, patient_id, test_panel)
