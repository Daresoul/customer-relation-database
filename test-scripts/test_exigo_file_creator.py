#!/usr/bin/env python3
"""
Exigo EOS Vet File Watcher Simulator
Creates versioned XML files to test the file watcher integration.

The Exigo device exports XML files to a watched directory.
This script simulates that behavior for testing.

Usage:
    # Simplest - uses exigo_test_proper.xml and ~/Desktop/filewatch
    python test_exigo_file_creator.py

    # Create multiple files
    python test_exigo_file_creator.py --count 5

    # Custom source file
    python test_exigo_file_creator.py /path/to/source.xml

    # Custom target directory
    python test_exigo_file_creator.py /path/to/source.xml /custom/watch/dir
"""

import os
import sys
import shutil
import time
from pathlib import Path
import platform

def get_script_directory():
    """Get the directory where this script is located."""
    return Path(__file__).parent

def get_default_source_file():
    """
    Get the default source XML file (exigo_test_proper.xml in test-scripts folder).

    Returns:
        Path to default source file
    """
    return get_script_directory() / "exigo_test_proper.xml"

def get_default_watch_directory():
    """
    Get the default file watch directory (Desktop/filewatch).
    Works cross-platform (macOS, Windows, Linux).

    Returns:
        Path to Desktop/filewatch directory
    """
    home = Path.home()

    # Desktop location varies by OS
    if platform.system() == "Windows":
        desktop = home / "Desktop"
    elif platform.system() == "Darwin":  # macOS
        desktop = home / "Desktop"
    else:  # Linux and others
        desktop = home / "Desktop"

    # Return Desktop/filewatch
    return desktop / "filewatch"

def get_next_version(directory, base_name):
    """
    Find the next available version number in the directory.

    Args:
        directory: Directory to search
        base_name: Base filename without extension (e.g., 'exigo_test_proper')

    Returns:
        Next version number
    """
    max_version = 0

    if not os.path.exists(directory):
        return 1

    for filename in os.listdir(directory):
        # Look for pattern: base_name_vNN.xml
        if filename.startswith(base_name) and filename.endswith('.xml'):
            # Extract version number
            try:
                # Format: exigo_test_proper_v46.xml
                version_part = filename.replace(base_name, '').replace('.xml', '')
                if version_part.startswith('_v'):
                    version_num = int(version_part[2:])  # Skip '_v'
                    max_version = max(max_version, version_num)
            except ValueError:
                continue

    return max_version + 1

def create_versioned_file(source_file, target_directory, version=None):
    """
    Copy source file to target directory with version number.

    Args:
        source_file: Path to source XML file
        target_directory: Directory to copy to
        version: Specific version number, or None to auto-increment

    Returns:
        Path to created file
    """
    source_path = Path(source_file)

    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_file}")

    # Create target directory if it doesn't exist
    os.makedirs(target_directory, exist_ok=True)

    # Get base name without extension
    base_name = source_path.stem  # e.g., 'exigo_test_proper'

    # Determine version number
    if version is None:
        version = get_next_version(target_directory, base_name)

    # Create target filename
    target_filename = f"{base_name}_v{version}.xml"
    target_path = os.path.join(target_directory, target_filename)

    # Copy the file
    shutil.copy2(source_file, target_path)

    return target_path, version

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='Simulate Exigo device file export for testing file watcher'
    )
    parser.add_argument(
        'source',
        nargs='?',  # Make optional
        help='Source XML file to copy (default: exigo_test_proper.xml in test-scripts folder)'
    )
    parser.add_argument(
        'target_dir',
        nargs='?',  # Make optional
        help='Target directory (default: ~/Desktop/filewatch)'
    )
    parser.add_argument(
        '--count',
        type=int,
        default=1,
        help='Number of files to create (default: 1)'
    )
    parser.add_argument(
        '--interval',
        type=float,
        default=1.0,
        help='Interval between files in seconds (default: 1.0)'
    )
    parser.add_argument(
        '--start-version',
        type=int,
        help='Starting version number (default: auto-detect next)'
    )

    args = parser.parse_args()

    # Use default source file if not specified
    source_file = args.source if args.source else str(get_default_source_file())

    # Use default directory if not specified
    target_dir = args.target_dir if args.target_dir else str(get_default_watch_directory())

    try:
        print(f"\n{'='*70}")
        print(f"Exigo File Creator - Testing File Watcher")
        print(f"{'='*70}")
        print(f"Source: {source_file}")
        print(f"Target: {target_dir}")
        print(f"Count: {args.count}")
        print(f"{'='*70}\n")

        current_version = args.start_version

        for i in range(args.count):
            target_path, version = create_versioned_file(
                source_file,
                target_dir,
                current_version
            )

            print(f"✅ [{i+1}/{args.count}] Created: {os.path.basename(target_path)} (v{version})")

            if current_version is None:
                current_version = version + 1
            else:
                current_version += 1

            # Wait before creating next file (except on last iteration)
            if i < args.count - 1:
                time.sleep(args.interval)

        print(f"\n{'='*70}")
        print(f"✅ Successfully created {args.count} file(s)")
        print(f"{'='*70}\n")

    except FileNotFoundError as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
