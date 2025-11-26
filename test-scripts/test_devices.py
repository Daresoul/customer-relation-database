#!/usr/bin/env python3
"""
Unified Device Test Simulator
Wrapper script to test multiple veterinary lab devices

Supports:
- Exigo Eos Vet (CBC Hematology) - File Watch
- Healvet HV-FIA 3000 (Chemistry) - Serial Port
- MNCHIP PointCare PCR V1 (Biochemistry) - Serial Port

Usage:
  python3 test_devices.py --exigo
  python3 test_devices.py --healvet /dev/ttys013
  python3 test_devices.py --pointcare /dev/ttys014
  python3 test_devices.py --exigo --healvet /dev/ttys013 --pointcare /dev/ttys014
  python3 test_devices.py --exigo --healvet /dev/ttys013 --parallel

"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

# Paths to individual test scripts
SCRIPT_DIR = Path(__file__).parent
EXIGO_SCRIPT = SCRIPT_DIR / "test_exigo_file_creator.py"
HEALVET_SCRIPT = SCRIPT_DIR / "test_healvet_full_panel.py"
POINTCARE_SCRIPT = SCRIPT_DIR / "test_pointcare.py"

def run_exigo(patient_id="Abbi"):
    """Run Exigo file watch test"""
    print("\n" + "="*70)
    print("🔬 Running Exigo Eos Vet (CBC Hematology) - File Watch")
    print("="*70)

    cmd = ["python3", str(EXIGO_SCRIPT)]
    result = subprocess.run(cmd, capture_output=False)

    if result.returncode != 0:
        print(f"❌ Exigo test failed with return code {result.returncode}")
        return False

    print("✅ Exigo test completed successfully")
    return True

def run_healvet(serial_port, patient_id="TESTDOG-001"):
    """Run Healvet serial port test"""
    print("\n" + "="*70)
    print(f"🔬 Running Healvet HV-FIA 3000 (Chemistry) - Serial Port")
    print("="*70)

    cmd = ["python3", str(HEALVET_SCRIPT), serial_port]
    result = subprocess.run(cmd, capture_output=False)

    if result.returncode != 0:
        print(f"❌ Healvet test failed with return code {result.returncode}")
        return False

    print("✅ Healvet test completed successfully")
    return True

def run_pointcare(serial_port, patient_id="TESTDOG-001", test_type="55"):
    """Run PointCare serial port test"""
    print("\n" + "="*70)
    print(f"🔬 Running MNCHIP PointCare PCR V1 (Biochemistry) - Serial Port")
    print("="*70)

    cmd = ["python3", str(POINTCARE_SCRIPT), serial_port, patient_id, test_type]
    result = subprocess.run(cmd, capture_output=False)

    if result.returncode != 0:
        print(f"❌ PointCare test failed with return code {result.returncode}")
        return False

    print("✅ PointCare test completed successfully")
    return True

def main():
    parser = argparse.ArgumentParser(
        description="Test veterinary lab device simulators",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Test single device
  python3 test_devices.py --exigo
  python3 test_devices.py --healvet /dev/ttys013
  python3 test_devices.py --pointcare /dev/ttys014

  # Test multiple devices (sequential by default)
  python3 test_devices.py --exigo --healvet /dev/ttys013

  # Test multiple devices in parallel
  python3 test_devices.py --exigo --healvet /dev/ttys013 --parallel

  # Test all three devices
  python3 test_devices.py --exigo --healvet /dev/ttys013 --pointcare /dev/ttys014 --parallel

Device Types:
  --exigo              Exigo Eos Vet (CBC/Hematology, ~62 parameters, file watch)
  --healvet PORT       Healvet HV-FIA 3000 (Chemistry, 6 parameters, serial)
  --pointcare PORT     MNCHIP PointCare (Biochemistry, 16 parameters, serial)

Options:
  --parallel           Run selected devices in parallel instead of sequentially
  --patient-id ID      Patient identifier (default: varies by device)
  --test-type TYPE     PointCare test type: 55/61/62/57 (default: 55)
        """
    )

    # Device selections
    parser.add_argument("--exigo", action="store_true",
                        help="Test Exigo Eos Vet (file watch)")
    parser.add_argument("--healvet", metavar="PORT",
                        help="Test Healvet HV-FIA 3000 (serial port)")
    parser.add_argument("--pointcare", metavar="PORT",
                        help="Test MNCHIP PointCare PCR V1 (serial port)")

    # Options
    parser.add_argument("--parallel", action="store_true",
                        help="Run selected devices in parallel")
    parser.add_argument("--patient-id", default=None,
                        help="Patient ID for serial devices (default: TESTDOG-001)")
    parser.add_argument("--test-type", default="55",
                        help="PointCare test type: 55=General, 61=Liver, 62=Kidney, 57=Electrolytes")

    args = parser.parse_args()

    # Check if at least one device is selected
    if not (args.exigo or args.healvet or args.pointcare):
        parser.print_help()
        print("\n❌ Error: Please specify at least one device to test")
        sys.exit(1)

    # Check if individual scripts exist
    for script, name in [
        (EXIGO_SCRIPT, "Exigo"),
        (HEALVET_SCRIPT, "Healvet"),
        (POINTCARE_SCRIPT, "PointCare")
    ]:
        if not script.exists():
            print(f"❌ Error: {name} test script not found: {script}")
            sys.exit(1)

    # Build list of tests to run
    tests = []

    if args.exigo:
        tests.append(("exigo", lambda: run_exigo()))

    if args.healvet:
        patient_id = args.patient_id or "TESTDOG-001"
        tests.append(("healvet", lambda: run_healvet(args.healvet, patient_id)))

    if args.pointcare:
        patient_id = args.patient_id or "TESTDOG-001"
        tests.append(("pointcare", lambda: run_pointcare(args.pointcare, patient_id, args.test_type)))

    # Print summary
    print("\n" + "="*70)
    print("🧪 DEVICE TEST SUITE")
    print("="*70)
    print(f"Devices selected: {len(tests)}")
    for name, _ in tests:
        print(f"  - {name.upper()}")
    print(f"Execution mode: {'PARALLEL' if args.parallel else 'SEQUENTIAL'}")
    print("="*70)

    # Run tests
    if args.parallel:
        # Parallel execution using subprocess.Popen
        print("\n🚀 Starting all devices in parallel...")
        processes = []

        for name, test_func in tests:
            # For parallel execution, we need to run scripts directly
            if name == "exigo":
                cmd = ["python3", str(EXIGO_SCRIPT)]
            elif name == "healvet":
                cmd = ["python3", str(HEALVET_SCRIPT), args.healvet]
            elif name == "pointcare":
                patient_id = args.patient_id or "TESTDOG-001"
                cmd = ["python3", str(POINTCARE_SCRIPT), args.pointcare, patient_id, args.test_type]

            print(f"\n🔄 Starting {name.upper()}...")
            proc = subprocess.Popen(cmd)
            processes.append((name, proc))

        # Wait for all processes to complete
        print("\n⏳ Waiting for all devices to complete...")
        results = {}
        for name, proc in processes:
            return_code = proc.wait()
            results[name] = return_code == 0
            status = "✅ SUCCESS" if results[name] else f"❌ FAILED (code: {return_code})"
            print(f"   {name.upper()}: {status}")

        # Print final summary
        print("\n" + "="*70)
        print("📊 PARALLEL TEST RESULTS")
        print("="*70)
        for name, success in results.items():
            status = "✅ PASSED" if success else "❌ FAILED"
            print(f"  {name.upper()}: {status}")

        all_passed = all(results.values())
        if all_passed:
            print("\n✅ All tests PASSED")
            sys.exit(0)
        else:
            print("\n❌ Some tests FAILED")
            sys.exit(1)

    else:
        # Sequential execution
        print("\n🔄 Running devices sequentially...")
        results = {}

        for name, test_func in tests:
            success = test_func()
            results[name] = success

            if not success:
                print(f"\n⚠️  {name.upper()} failed, continuing with remaining tests...")

            # Small delay between sequential tests
            if len(tests) > 1:
                time.sleep(1)

        # Print final summary
        print("\n" + "="*70)
        print("📊 SEQUENTIAL TEST RESULTS")
        print("="*70)
        for name, success in results.items():
            status = "✅ PASSED" if success else "❌ FAILED"
            print(f"  {name.upper()}: {status}")

        all_passed = all(results.values())
        if all_passed:
            print("\n✅ All tests PASSED")
            sys.exit(0)
        else:
            print("\n❌ Some tests FAILED")
            sys.exit(1)

if __name__ == "__main__":
    main()
