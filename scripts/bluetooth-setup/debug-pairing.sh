#!/bin/bash

# Debug script for testing Bluetooth pairing detection
# Run this on your Raspberry Pi to see what bluetoothctl commands actually output

set -e

echo "=== Bluetooth Pairing Debug Script ==="
echo "Date: $(date)"
echo

echo "1. Checking if bluetoothctl is available..."
if ! command -v bluetoothctl &> /dev/null; then
    echo "ERROR: bluetoothctl not found!"
    exit 1
fi
echo "✓ bluetoothctl found"
echo

echo "2. Checking Bluetooth adapter status..."
echo "--- bluetoothctl show ---"
bluetoothctl show
echo

echo "3. Checking currently paired devices..."
echo "--- bluetoothctl devices Paired ---"
bluetoothctl devices Paired
echo

echo "4. Checking connected devices..."
echo "--- bluetoothctl devices Connected ---"
bluetoothctl devices Connected
echo

echo "5. Checking all known devices..."
echo "--- bluetoothctl devices ---"
bluetoothctl devices
echo

echo "6. Starting bluetoothctl monitor (will run for 30 seconds)..."
echo "During this time, try to pair a device from your phone/computer"
echo "--- bluetoothctl monitor output ---"

# Run bluetoothctl in monitor mode for 30 seconds
timeout 30 bluetoothctl &
BLUETOOTHCTL_PID=$!

# Also run a separate monitor to capture output
(
    sleep 5
    echo "[DEBUG] Starting pairing mode..."
    bluetoothctl discoverable on
    bluetoothctl pairable on
    echo "[DEBUG] Pairing mode enabled - device should be discoverable now"
    echo "[DEBUG] Try pairing from your device now..."
    
    # Monitor for 20 seconds
    sleep 20
    
    echo "[DEBUG] Checking for newly paired devices..."
    bluetoothctl devices Paired
    
    echo "[DEBUG] Turning off discoverable mode..."
    bluetoothctl discoverable off
) &

wait $BLUETOOTHCTL_PID

echo
echo "=== Debug complete ==="
echo "If you see any errors above, that might explain why pairing detection isn't working."
echo "Look for:"
echo "- Command not found errors"
echo "- Permission denied errors"  
echo "- No output from 'bluetoothctl devices Paired'"
echo "- No pairing-related messages in the monitor output"