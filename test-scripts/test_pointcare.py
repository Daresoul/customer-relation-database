#!/usr/bin/env python3
"""
MNCHIP PointCare PCR V1 Simulator
Sends HL7 v2.x formatted messages over serial port
Based on print-app PointcareSerialPortDataListener and PointcareParser
"""

import serial
import sys
import time
from datetime import datetime

def create_hl7_message(patient_id="DOG123", sample_id="PC001", test_type="55"):
    """
    Create HL7 v2.x message for Pointcare device

    Test Types:
    - 55: Health Checking Profile (General)
    - 61: Liver Profile
    - 62: Kidney Profile
    - 57: Electrolytes

    Message structure:
    - MSH: Message Header (signals start of new sample)
    - PID: Patient Identification
    - OBR: Observation Request
    - OBX: Observation Result (one per parameter, 16 total for profile 55)
    - End: Two consecutive carriage returns (\r\r)
    """

    # Current timestamp in HL7 format: YYYYMMDDHHmmss
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

    # MSH: Message Header
    msh = "MSH|^~\\&|PointCare|MNCHIP|||20251125143000||ORU^R01|MSG001|P|2.3\r"

    # PID: Patient Identification
    # Format: PID|||sampleId|||patient|||gender
    # Fields: [0]PID | [1]unused | [2]unused | [3]sampleId | [4]unused | [5]unused | [6]patient | ... | [10]gender
    pid = f"PID|||{sample_id}|||{patient_id}|||M\r"

    # OBR: Observation Request
    # Format: OBR|||||||dateTime||||||||sampleType|||||||||||||||||testType
    # Fields: [0]OBR | ... | [7]dateTime | [15]sampleType | [45]testType
    # Sample types: 1=Whole Blood, 2=Serum, 3=Plasma
    obr = f"OBR|||||||{timestamp}||||||||2|||||||||||||||||{test_type}\r"

    # OBX: Observation Results (16 parameters for general profile)
    # Format: OBX|examinedItemNum||paramCode|result|unit|ranges|indicator
    # Fields: [0]OBX | [1]examinedItemNum | [4]paramCode | [5]result | [6]unit | [7]ranges | [8]indicator
    # Indicators: N=Normal, L=Low, H=High

    parameters = [
        ("1", "GLU", "95.0", "mg/dL", "70-110", "N"),      # Glucose
        ("2", "BUN", "18.0", "mg/dL", "7-27", "N"),        # Blood Urea Nitrogen
        ("3", "CRE", "1.2", "mg/dL", "0.5-1.8", "N"),      # Creatinine
        ("4", "ALB", "3.8", "g/dL", "2.3-4.0", "N"),       # Albumin
        ("5", "TP", "6.5", "g/dL", "5.2-8.2", "N"),        # Total Protein
        ("6", "Ca", "10.2", "mg/dL", "9.0-11.3", "N"),     # Calcium
        ("7", "P", "4.5", "mg/dL", "2.5-6.8", "N"),        # Phosphorus
        ("8", "ALT", "45.0", "U/L", "10-100", "N"),        # Alanine Aminotransferase
        ("9", "ALP", "120.0", "U/L", "23-212", "N"),       # Alkaline Phosphatase
        ("10", "TBIL", "0.3", "mg/dL", "0.0-0.9", "N"),    # Total Bilirubin
        ("11", "CHOL", "180.0", "mg/dL", "110-320", "N"),  # Cholesterol
        ("12", "AMY", "850.0", "U/L", "500-1500", "N"),    # Amylase
        ("13", "K+", "4.2", "mmol/L", "3.5-5.8", "N"),     # Potassium
        ("14", "Na+", "145.0", "mmol/L", "144-160", "N"),  # Sodium
        ("15", "Cl-", "105.0", "mmol/L", "109-122", "N"),  # Chloride
        ("16", "GLO", "2.7", "g/dL", "2.5-4.5", "N"),      # Globulin
    ]

    obx_lines = []
    for exam_num, param_code, result, unit, ranges, indicator in parameters:
        # OBX format with pipe delimiters
        obx = f"OBX|{exam_num}|||{param_code}|{result}|{unit}|{ranges}|{indicator}\r"
        obx_lines.append(obx)

    # Combine all parts
    message = msh + pid + obr + "".join(obx_lines)

    # End marker: Two consecutive carriage returns
    message += "\r\r"

    return message

def send_pointcare_data(port, patient_id="DOG123", test_type="55", baud_rate=9600):
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
        print("MNCHIP PointCare PCR V1 Simulator")
        print("=" * 70)
        print(f"Serial Port: {port}")
        print(f"Baud Rate: {baud_rate}")
        print(f"Patient ID: {patient_id}")
        print(f"Test Type: {test_type} (General Health Profile)")
        print(f"Protocol: HL7 v2.x (pipe-delimited)")
        print("=" * 70)

        print(f"\n✅ Serial port opened: {port}")

        # Generate HL7 message
        message = create_hl7_message(patient_id=patient_id, test_type=test_type)

        print(f"\n📦 Sending HL7 message ({len(message)} bytes)...")
        print(f"   Lines: {message.count(chr(13))} (including 2x end markers)")
        print(f"   Parameters: 16")

        # Show first 200 chars
        preview = message[:200].replace('\r', '\\r\n   ')
        print(f"   Preview:\n   {preview}...")

        # Send message line by line for realistic transmission
        lines = message.split('\r')
        for i, line in enumerate(lines):
            if line:  # Skip empty lines from split
                ser.write((line + '\r').encode('utf-8'))
                time.sleep(0.05)  # Small delay between lines
            elif i < len(lines) - 1:  # Send standalone \r for control chars
                ser.write(b'\r')
                time.sleep(0.05)

        print(f"\n✅ Transmission complete!")

        # Close serial port
        ser.close()

        print("\n" + "=" * 70)
        print("✅ Complete! Sent HL7 message for patient", patient_id)
        print("=" * 70)

        print("\nExpected results in app:")
        print("  - 1 device file (biochemistry profile) should be pending")
        print(f"  - Patient: {patient_id}")
        print("  - 16 parameters: GLU, BUN, CRE, ALB, TP, Ca, P, ALT, ALP,")
        print("                   TBIL, CHOL, AMY, K+, Na+, Cl-, GLO")

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
        print("Usage: python3 test_pointcare.py <serial_port> [patient_id] [test_type]")
        print("Example: python3 test_pointcare.py /dev/ttys013 DOG123 55")
        print("\nTest Types:")
        print("  55 - General Health Profile (16 parameters)")
        print("  61 - Liver Profile")
        print("  62 - Kidney Profile")
        print("  57 - Electrolytes")
        sys.exit(1)

    port = sys.argv[1]
    patient_id = sys.argv[2] if len(sys.argv) > 2 else "TESTDOG-001"
    test_type = sys.argv[3] if len(sys.argv) > 3 else "55"

    send_pointcare_data(port, patient_id, test_type)
