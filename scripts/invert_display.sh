#!/bin/bash

# Check for a USB device with "WaveShare" in its identifier
DEVICE_FOUND=$(lsusb | grep -i "waveshare")

if [ -n "$DEVICE_FOUND" ]; then
    echo "WaveShare device detected. Checking display and touch input devices."

    # Get the display name
    DISPLAY_NAME=$(xrandr --listmonitors | grep '+' | awk '{print $4}')
    if [ -z "$DISPLAY_NAME" ]; then
        echo "Error: Unable to determine display name."
    else
        echo "Display name: $DISPLAY_NAME"
    fi

    # Get the touch input device name
    TOUCH_DEVICE=$(xinput --list | grep -i "waveshare" | awk -F 'id=' '{print $1}' | sed 's/^[[:space:]]*//')
    if [ -z "$TOUCH_DEVICE" ]; then
        echo "Error: Unable to determine touch input device."
    else
        echo "Touch input device: $TOUCH_DEVICE"
    fi

    # Perform inversions only if both display and touch input device are found
    if [ -n "$DISPLAY_NAME" ] && [ -n "$TOUCH_DEVICE" ]; then
        echo "Inverting display and touch input."

        # Invert the display
        xrandr --output "$DISPLAY_NAME" --rotate inverted

        # Invert the touch input
        xinput set-prop "$TOUCH_DEVICE" "Coordinate Transformation Matrix" -1 0 1 0 -1 1 0 0 1

        echo "Display and touch input inverted successfully."
    else
        echo "Inversions skipped. Ensure both display and touch input devices are available."
    fi
else
    echo "No WaveShare device detected."
fi