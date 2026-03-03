#!/usr/bin/env python3
"""
MNCHIP PCR Analyzer Simulator - Real Format
Sends HL7 v2.x formatted messages matching the actual device output from MNCHIP_PCR.log

OBX Format (0-indexed fields):
[0] OBX | [1] setId | [2] valueType | [3] empty | [4] paramCode | [5] result |
[6] empty | [7] range | [8] indicator | [9] empty | [10] empty | [11] sample_type |
[12] curve_data | [13] Ct_result | [14] timestamp | [15] lot | [16] field16 |
[17] threshold | [18] empty
"""

import serial
import sys
import time
from datetime import datetime

# Sample curve data from actual device log (flat curves for negative results)
FLAT_CURVE_CDV = "643#640#642#641#641#642#641#645#643#641#641#642#639#645#641#642#645#642#644#645#645#645#645#647#646#647#647#645#648#651#649#647#646#648#646#645#647#648#646#650#650"
FLAT_CURVE_CPIV = "4767#4811#4776#4784#4778#4760#4751#4738#4736#4729#4747#4763#4758#4773#4784#4779#4788#4786#4773#4761#4755#4737#4728#4747#4708#4713#4732#4725#4734#4738#4741#4744#4744#4749#4731#4718#4733#4726#4733#4729#4729"
FLAT_CURVE_CAV2 = "2925#2947#2929#2926#2936#2912#2913#2900#2894#2908#2908#2912#2919#2936#2922#2934#2941#2932#2921#2926#2915#2908#2894#2910#2899#2894#2902#2917#2907#2912#2905#2902#2909#2900#2889#2892#2897#2896#2900#2893#2893"
FLAT_CURVE_BB = "641#641#644#642#641#643#643#643#643#644#641#641#643#644#641#642#648#643#642#649#647#646#648#645#645#645#650#647#649#645#648#643#644#646#649#644#648#647#647#650#650"

# Exponential curve for positive MC result (Ct=25.79)
POSITIVE_CURVE_MC = "1616#1622#1628#1626#1643#1639#1640#1632#1639#1648#1638#1637#1643#1654#1639#1649#1652#1656#1656#1659#1654#1652#1647#1657#1664#1668#1669#1690#1711#1758#1792#1799#1811#1810#1809#1818#1814#1818#1826#1820#1820"

# Positive IC curve (Ct=24.71)
POSITIVE_CURVE_IC = "2737#2760#2739#2737#2733#2729#2727#2715#2749.83#2749.83#2749.83#2749.83#2751.9#2760.03#2765.37#2764.71#2772.44#2779.98#2773.31#2779.05#2778.39#2778.12#2779.46#2802.79#2817.73#2891.26#3024.4#3233.54#3530.95#3817.55#4009.75#4135.35#4253.95#4354.15#4463.35#4539.55#4646.35#4739.55#4834.95#4915.15#4915.15"

def create_hl7_pcr_message(patient_id="555", patient_name="doli", sample_id="0C1231-3-0015"):
    """
    Create HL7 v2.x message matching actual MNCHIP PCR Analyzer output format
    """
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

    # MSH: Message Header
    msh = f"MSH|^~\\&|1|PointcarePCRV|||{timestamp}|2|ORU^R01|1|p|2.3.1|MV2502001Z020C1231|||5||ASCII|||\r"

    # PID: Patient Identification
    pid = f"PID|1||{patient_id}||dog|{patient_name}|||20120000000000|O|||||||||||||||||||\r"

    # OBR: Observation Request with sample ID
    obr = f"OBR|1||{patient_id}|1^1|||{timestamp}|||||||||||||||||||||||{sample_id}||||\r"

    # OBX segments - format matching real device
    # OBX|seq|ST||code|result||range|indicator|||sample_type|curve_data|ct_result|timestamp|cycles|lot|field16|threshold||

    obx_lines = []

    # CDV - Negative
    obx_lines.append(f"OBX|1|ST||CDV|NoCt||>36 or NoCt|Negative(-)||"
                    f"|oral_nasal_ocular swab|{FLAT_CURVE_CDV}|NoCt|{timestamp}|76|250850|88|781.2||\r")

    # CPIV - Negative
    obx_lines.append(f"OBX|2|ST||CPIV|NoCt||>36 or NoCt|Negative(-)||"
                    f"|oral_nasal_ocular swab|{FLAT_CURVE_CPIV}|NoCt|{timestamp}|76|250850|88|5773.2||\r")

    # CAV-2 - Negative
    obx_lines.append(f"OBX|3|ST||CAV-2|NoCt||>36 or NoCt|Negative(-)||"
                    f"|oral_nasal_ocular swab|{FLAT_CURVE_CAV2}|NoCt|{timestamp}|76|250850|88|3536.4||\r")

    # Bb - Negative
    obx_lines.append(f"OBX|4|ST||Bb|NoCt||>36 or NoCt|Negative(-)||"
                    f"|oral_nasal_ocular swab|{FLAT_CURVE_BB}|NoCt|{timestamp}|76|250850|88|780||\r")

    # MC - Positive (Ct=25.79)
    obx_lines.append(f"OBX|5|ST||MC|25.79||>36 or NoCt|Postive(+)||"
                    f"|oral_nasal_ocular swab|{POSITIVE_CURVE_MC}|25.79|{timestamp}|76|250850|88|1655.06||\r")

    # IC - Positive Internal Control (Ct=24.71)
    obx_lines.append(f"OBX|6|ST||IC|24.71||>36 or NoCt|Postive(+)||"
                    f"|oral_nasal_ocular swab|{POSITIVE_CURVE_IC}|24.71|{timestamp}|76|250850|88|2878.93||\r")

    hl7_content = msh + pid + obr + "".join(obx_lines)

    # MLLP framing
    mllp_start = chr(0x0B)
    mllp_end = chr(0x1C) + chr(0x0D)

    return mllp_start + hl7_content + mllp_end


def send_pcr_data(port, patient_id="555", patient_name="doli", sample_id="0C1231-3-0015", baud_rate=115200):
    """Send HL7 message via serial port"""
    try:
        ser = serial.Serial(
            port=port,
            baudrate=baud_rate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=1
        )

        print("=" * 70)
        print("MNCHIP PCR Analyzer Simulator (Real Format)")
        print("=" * 70)
        print(f"Serial Port: {port}")
        print(f"Baud Rate: {baud_rate}")
        print(f"Patient ID: {patient_id}")
        print(f"Patient Name: {patient_name}")
        print(f"Sample ID: {sample_id}")
        print("=" * 70)

        message = create_hl7_pcr_message(patient_id, patient_name, sample_id)

        print(f"\n📦 Sending HL7 message with MLLP framing ({len(message)} bytes)...")
        print("   Tests: CDV, CPIV, CAV-2, Bb, MC (positive), IC (positive)")

        # Send byte by byte like real device (small chunks)
        chunk_size = 7  # Approximate real device chunk size from log
        for i in range(0, len(message), chunk_size):
            chunk = message[i:i+chunk_size]
            ser.write(chunk.encode('utf-8'))
            time.sleep(0.001)  # Small delay between chunks

        print(f"\n✅ Transmission complete!")
        ser.close()

        print("\n" + "=" * 70)
        print("Expected PDF output:")
        print("  - Title: Test Report")
        print("  - 6 tests in results table")
        print("  - MC should show Positive(+) with Ct=25.79 (red)")
        print("  - IC should show Positive(+) with Ct=24.71 (red)")
        print("  - 6 amplification curve graphs")
        print("  - MC curve should show exponential growth")
        print("=" * 70)

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
        print("Usage: python3 test_mnchip_pcr_real.py <serial_port> [patient_id] [patient_name] [sample_id]")
        print("Example: python3 test_mnchip_pcr_real.py /tmp/ttyPCR_test 555 doli 0C1231-3-0015")
        print("\nThis script sends PCR data in the exact format from MNCHIP_PCR.log")
        print("with 6 tests: CDV, CPIV, CAV-2, Bb, MC (positive), IC (positive)")
        sys.exit(1)

    port = sys.argv[1]
    patient_id = sys.argv[2] if len(sys.argv) > 2 else "555"
    patient_name = sys.argv[3] if len(sys.argv) > 3 else "doli"
    sample_id = sys.argv[4] if len(sys.argv) > 4 else "0C1231-3-0015"

    send_pcr_data(port, patient_id, patient_name, sample_id)
