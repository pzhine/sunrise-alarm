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

# Get the touch input device ID from lsusb instead of xinput
TOUCH_DEVICE_INFO=$(lsusb | grep -i "waveshare")
TOUCH_DEVICE=$(echo "$TOUCH_DEVICE_INFO" | awk '{print $2":"$4}' | sed 's/://g')

if [ -z "$TOUCH_DEVICE" ]; then
    echo "Error: Unable to determine touch input device."
    exit 1
else
    echo "Touch input device: $TOUCH_DEVICE"
fi

echo "Inverting display and touch input."

# Invert the touch input
xinput set-prop "$TOUCH_DEVICE" "Coordinate Transformation Matrix" -1 0 1 0 -1 1 0 0 1

# Invert the display
xrandr --output "$DISPLAY_NAME" --rotate inverted

