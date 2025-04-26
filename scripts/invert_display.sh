#!/bin/bash

# Check for a USB device with "WaveShare" in its identifier
DEVICE_FOUND=$(lsusb | grep -i "waveshare")

if [ -n "$DEVICE_FOUND" ]; then
    echo "WaveShare device detected. Checking display and touch input devices."
else 
    echo "No WaveShare device detected. Exiting."
    exit 1
fi

# Get the display name
DISPLAY_NAME=$(xrandr --listmonitors | grep '+' | awk '{print $4}')
if [ -z "$DISPLAY_NAME" ]; then
    echo "Error: Unable to determine display name."
    exit 1
else
    echo "Display name: $DISPLAY_NAME"
fi

echo "Inverting display and touch input."

# Invert the touch input
XINPUT_DEVICE_ID=$(xinput --list | grep -i "waveshare" | awk -F 'id=' '{print $2}' | awk '{print $1}')
echo "Setting coordinate transformation matrix for device $XINPUT_DEVICE_ID"
xinput set-prop "$XINPUT_DEVICE_ID" "Coordinate Transformation Matrix" -1 0 1 0 -1 1 0 0 1
TOUCH_INVERT=$?
if [ $TOUCH_INVERT -eq 0 ]; then
    echo "Touch input successfully inverted"
else
    exit 1
fi

# Invert the display
xrandr --output "$DISPLAY_NAME" --rotate inverted

