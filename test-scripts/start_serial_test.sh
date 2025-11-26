#!/bin/bash
# Serial Port Test Setup Script
# This creates virtual serial ports that work with Rust serialport crate

echo "🚀 Starting Serial Port Test Environment"
echo "========================================"

# Kill any existing socat processes
killall socat 2>/dev/null

# Start the Python bridge
echo ""
echo "📡 Starting Python serial bridge..."
python3 test-scripts/serial_bridge.py &
BRIDGE_PID=$!

# Wait for bridge to initialize
sleep 2

echo ""
echo "✅ Serial bridge started (PID: $BRIDGE_PID)"
echo "📝 Saving PID to /tmp/serial_bridge.pid"
echo "$BRIDGE_PID" > /tmp/serial_bridge.pid

echo ""
echo "To stop the bridge later, run:"
echo "  kill \$(cat /tmp/serial_bridge.pid)"
echo ""
echo "Press Ctrl+C to stop the bridge now, or close this terminal"
echo "========================================"

# Wait for the bridge process
wait $BRIDGE_PID
