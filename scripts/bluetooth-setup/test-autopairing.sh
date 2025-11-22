#!/bin/bash

# Test auto-pairing functionality
# This script simulates what happens when a device tries to pair

set -e

echo "=== Testing Auto-Pairing Functionality ==="
echo

if [ $# -eq 0 ]; then
    echo "Usage: $0 <device_mac_address>"
    echo "Example: $0 AA:BB:CC:DD:EE:FF"
    echo
    echo "To find devices to test with:"
    echo "bluetoothctl scan on"
    echo "# Wait a moment, then:"
    echo "bluetoothctl devices"
    exit 1
fi

DEVICE_ADDRESS="$1"

echo "Testing auto-pairing with device: $DEVICE_ADDRESS"
echo

echo "1. Checking if device is discoverable..."
bluetoothctl info "$DEVICE_ADDRESS" 2>/dev/null || echo "Device not found in cache"

echo
echo "2. Attempting to pair..."
bluetoothctl pair "$DEVICE_ADDRESS"

echo
echo "3. Attempting to trust..."
sleep 2
bluetoothctl trust "$DEVICE_ADDRESS"

echo
echo "4. Checking final pairing status..."
sleep 2
bluetoothctl info "$DEVICE_ADDRESS" | grep -E "(Paired|Trusted|Connected):"

echo
echo "=== Test complete ==="