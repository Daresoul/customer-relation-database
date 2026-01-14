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

    # PID: Patient Identification (based on real production data format)
    # Fields: [0]PID | [1]set_id | [2-4]unused | [5]species | [6]patient_name | [7-8]unused | [9]birth_date | [10]gender
    # Real format from prod: PID|1||||dog|llili|||20190000000000|O|...
    pid = f"PID|1||||dog|{patient_id}|||20200101000000|M\r"

    # OBR: Observation Request
    # Format: OBR|||||||dateTime||||||||sampleType|||||||||||||||||testType
    # Fields: [0]OBR | ... | [7]dateTime | [15]sampleType | [45]testType
    # Sample types: 1=Whole Blood, 2=Serum, 3=Plasma
    obr = f"OBR|||||||{timestamp}||||||||2|||||||||||||||||{test_type}\r"

    # OBX: Observation Results (16 parameters for general profile)
    # Format: OBX|examinedItemNum||paramCode|result|unit|ranges|indicator
    # Fields: [0]OBX | [1]examinedItemNum | [4]paramCode | [5]result | [6]unit | [7]ranges | [8]indicator
    # Indicators: N=Normal, L=Low, H=High

    # Real production data from MNCHIP PointCare Chemistry Analyzer (24 parameters)
    # Extracted from prod_files/raw_COM5.log
    parameters = [
        ("1", "TP", "7.3", "g/dL", "5.2-8.2", "N"),           # Total Protein
        ("2", "ALB", "3.6", "g/dL", "2.2-4.4", "N"),          # Albumin
        ("3", "GLO", "3.7", "g/dL", "2.3-5.2", "N"),          # Globulin
        ("4", "A/G", "1.0", " ", "0-0", "N"),                 # Albumin/Globulin ratio
        ("5", "TBIL", "0.27", "mg/dL", "0.1-0.9", "N"),       # Total Bilirubin
        ("6", "AST", "66", "U/L", "8.9-55", "H"),             # Aspartate Aminotransferase (HIGH)
        ("7", "ALT", "85", "U/L", "10-140", "N"),             # Alanine Aminotransferase
        ("8", "AST/ALT", "0.78", " ", "0-0", "N"),            # AST/ALT ratio
        ("9", "GGT", "0.8", "U/L", "0-7", "N"),               # Gamma-Glutamyl Transferase
        ("10", "ALP", "44", "U/L", "20-150", "N"),            # Alkaline Phosphatase
        ("11", "TBA", "22.7", "umol/L", "0-20", "H"),         # Total Bile Acids (HIGH)
        ("12", "BUN", "17.7", "mg/dL", "7-32", "N"),          # Blood Urea Nitrogen
        ("13", "CRE", "0.84", "mg/dL", "0.3-1.7", "N"),       # Creatinine
        ("14", "BUN/CRE", "21", " ", "0-0", "N"),             # BUN/Creatinine ratio
        ("15", "CK", "373", "U/L", "20-200", "H"),            # Creatine Kinase (HIGH)
        ("16", "AMY", "656", "U/L", "200-1800", "N"),         # Amylase
        ("17", "GLU", "121", "mg/dL", "70-142", "N"),         # Glucose
        ("18", "CHOL", "274", "mg/dL", "110-320", "N"),       # Cholesterol
        ("19", "TG", "88.9", "mg/dL", "8.8-79.7", "H"),       # Triglycerides (HIGH)
        ("20", "tCO2", "18", "mmol/L", "12-27", "N"),         # Total CO2
        ("21", "Ca", "10.2", "mg/dL", "7.9-11.8", "N"),       # Calcium
        ("22", "P", "3.21", "mg/dL", "2.5-6.8", "N"),         # Phosphorus
        ("23", "Ca*P", "33", "mg/dL", "0-0", "N"),            # Calcium-Phosphorus product
        ("24", "Mg", "1.95", "mg/dL", "1.5-2.6", "N"),        # Magnesium
    ]

    obx_lines = []
    for exam_num, param_code, result, unit, ranges, indicator in parameters:
        # OBX format with pipe delimiters
        obx = f"OBX|{exam_num}|||{param_code}|{result}|{unit}|{ranges}|{indicator}\r"
        obx_lines.append(obx)

    # Combine all parts (HL7 content)
    hl7_content = msh + pid + obr + "".join(obx_lines)

    # MLLP framing:
    # - Start: 0x0B (VT - Vertical Tab)
    # - End: 0x1C 0x0D (FS CR - File Separator + Carriage Return)
    mllp_start = chr(0x0B)  # VT
    mllp_end = chr(0x1C) + chr(0x0D)  # FS + CR

    message = mllp_start + hl7_content + mllp_end

    return message

def send_pointcare_data(port, patient_id="DOG123", test_type="55", baud_rate=115200):
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
        print(f"Protocol: HL7 v2.x with MLLP framing (0x0B start, 0x1C 0x0D end)")
        print("=" * 70)

        print(f"\n✅ Serial port opened: {port}")

        # Generate HL7 message
        message = create_hl7_message(patient_id=patient_id, test_type=test_type)

        print(f"\n📦 Sending HL7 message with MLLP framing ({len(message)} bytes)...")
        print(f"   HL7 segments: {message.count(chr(13))} lines")
        print(f"   Parameters: 24 (real production chemistry panel)")
        print(f"   MLLP: 0x0B (start) + HL7 content + 0x1C 0x0D (end)")

        # Show preview of HL7 content (skip MLLP start byte)
        hl7_preview = message[1:201].replace('\r', '\\r\n   ')
        print(f"   Preview:\n   {hl7_preview}...")

        # Send MLLP-framed message - can send as one block or chunk by chunk
        # Real devices often send in chunks, let's simulate that
        encoded = message.encode('utf-8')

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
        print("✅ Complete! Sent HL7 message for patient", patient_id)
        print("=" * 70)

        print("\nExpected results in app:")
        print("  - 1 device file (biochemistry profile) should be pending")
        print(f"  - Patient: {patient_id} (species: dog)")
        print("  - 24 parameters (real production chemistry panel):")
        print("    TP, ALB, GLO, A/G, TBIL, AST, ALT, AST/ALT, GGT, ALP, TBA, BUN,")
        print("    CRE, BUN/CRE, CK, AMY, GLU, CHOL, TG, tCO2, Ca, P, Ca*P, Mg")

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
