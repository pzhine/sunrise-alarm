#!/bin/bash

# Check for a USB device with "WaveShare" in its identifier
DEVICE_FOUND=$(lsusb | grep -i "WaveShare")

if [ -n "$DEVICE_FOUND" ]; then
    echo "WaveShare device detected. Inverting display and touch input."

    # Get the display name
    DISPLAY_NAME=$(xrandr --listmonitors | grep '+' | awk '{print $4}')
    if [ -z "$DISPLAY_NAME" ]; then
        echo "Error: Unable to determine display name."
        exit 1
    fi

    # Invert the display
    xrandr --output "$DISPLAY_NAME" --rotate inverted

    # Get the touch input device name
    TOUCH_DEVICE=$(xinput --list | grep -i "touch" | awk -F 'id=' '{print $1}' | sed 's/^[[:space:]]*//')
    if [ -z "$TOUCH_DEVICE" ]; then
        echo "Error: Unable to determine touch input device."
        exit 1
    fi

    # Invert the touch input
    xinput set-prop "$TOUCH_DEVICE" "Coordinate Transformation Matrix" -1 0 1 0 -1 1 0 0 1

    echo "Display and touch input inverted successfully."
else
    echo "No WaveShare device detected."
fi