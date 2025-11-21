#!/bin/bash

# Script to rotate DSI display 90 degrees and fix touch tracking
# This script configures both the display rotation in /boot/firmware/config.txt
# and the touch input coordination. It is idempotent and can be run multiple times.

echo "Configuring DSI display rotation and touch input..."

# Function to create autostart script for persistent touch rotation
create_autostart_script() {
    local device_id="$1"
    local autostart_file="/etc/xdg/lxsession/LXDE-pi/autostart"
    local script_file="/usr/local/bin/rotate-touch.sh"
    
    echo ""
    echo "Creating LXDE autostart configuration for persistent touch rotation..."
    
    # Create the touch rotation script with logging
    cat > "$script_file" << EOF
#!/bin/bash
# Auto-generated touch rotation script for Raspberry Pi OS
LOG_FILE="/var/log/touch-rotation.log"

# Function to log with timestamp
log_message() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') - \$1" >> "\$LOG_FILE"
}

log_message "LXDE autostart: Touch rotation script started"
log_message "Target device ID: $device_id"
log_message "DISPLAY environment: \$DISPLAY"
log_message "USER environment: \$USER"

if ! command -v xinput >/dev/null 2>&1; then
    log_message "ERROR: xinput command not found"
    exit 1
fi

log_message "xinput found, listing all input devices:"
xinput --list >> "\$LOG_FILE" 2>&1

# Check if target device exists
if ! xinput list-props $device_id >/dev/null 2>&1; then
    log_message "ERROR: Device ID $device_id not found or not accessible"
    log_message "Available devices:"
    xinput --list >> "\$LOG_FILE" 2>&1
    exit 1
fi

log_message "Device $device_id found, applying rotation..."

# Apply touch rotation
if xinput set-prop $device_id "Coordinate Transformation Matrix" 0 1 0 -1 0 1 0 0 1 2>>"\$LOG_FILE"; then
    log_message "SUCCESS: Touch rotation applied successfully for device $device_id"
    
    # Verify the transformation was applied
    log_message "Verifying transformation matrix:"
    xinput list-props $device_id | grep "Coordinate Transformation Matrix" >> "\$LOG_FILE" 2>&1
else
    log_message "ERROR: Failed to apply touch rotation"
    exit 1
fi

log_message "Touch rotation script completed successfully"
EOF
    
    chmod +x "$script_file"
    
    # Remove any existing touch rotation entries from autostart
    if [ -f "$autostart_file" ] && grep -q "rotate-touch\|xinput.*Coordinate Transformation Matrix" "$autostart_file" 2>/dev/null; then
        grep -v "rotate-touch\|xinput.*Coordinate Transformation Matrix" "$autostart_file" > "${autostart_file}.tmp"
        mv "${autostart_file}.tmp" "$autostart_file"
        echo "✓ Removed existing touch rotation entries"
    fi
    
    # Add the script to autostart
    echo "@sudo $script_file" >> "$autostart_file"
    
    echo "✓ Created touch rotation script: $script_file"
    echo "✓ Added script to LXDE autostart: $autostart_file"
    echo ""
    echo "Debug information:"
    echo "- Touch script: $script_file"
    echo "- Autostart file: $autostart_file"
    echo "- View autostart: cat $autostart_file"
    echo "- View logs: tail -f /var/log/touch-rotation.log"
    echo "- Test script manually: sudo $script_file"
    
    echo "Touch rotation will now persist across reboots on Raspberry Pi OS"
}

# Check what we need to do
NEED_CONFIG_CHANGE=false
NEED_TOUCH_CHANGE=false

# Check if we can access X11 session for touch configuration
if [ -z "$DISPLAY" ]; then
    echo "Warning: No X11 display session detected (DISPLAY not set)."
    echo "Make sure to run this script from within an X11 graphical session."
fi

# Handle config.txt modification (requires root)
CONFIG_FILE="/boot/firmware/config.txt"

if [ -f "$CONFIG_FILE" ]; then
    echo "Checking display rotation in $CONFIG_FILE..."
    
    # Check current display_rotate setting
    CURRENT_ROTATE=$(grep "^display_rotate=" "$CONFIG_FILE" 2>/dev/null | cut -d'=' -f2)
    COMMENTED_ROTATE=$(grep "^#.*display_rotate=" "$CONFIG_FILE" 2>/dev/null)

    if [ "$CURRENT_ROTATE" = "1" ]; then
        echo "✓ Display rotation already set to 90 degrees (display_rotate=1)"
    else
        NEED_CONFIG_CHANGE=true
        if [ "$EUID" -ne 0 ]; then
            echo "⚠ Config.txt needs modification but script not running as root"
            echo "  Run with sudo to automatically update config.txt, or manually add:"
            echo "  display_rotate=1"
            echo "  to $CONFIG_FILE"
        else
            echo "Updating display rotation in $CONFIG_FILE..."
            if [ -n "$COMMENTED_ROTATE" ]; then
                echo "Found commented display_rotate line, updating it..."
                sed -i 's/^#.*display_rotate=.*/display_rotate=1/' "$CONFIG_FILE"
                echo "✓ Updated existing commented display_rotate to display_rotate=1"
            elif [ -n "$CURRENT_ROTATE" ]; then
                echo "Current display_rotate=$CURRENT_ROTATE, updating to 90 degrees..."
                sed -i 's/^display_rotate=.*/display_rotate=1/' "$CONFIG_FILE"
                echo "✓ Updated display_rotate to 1 (90 degrees clockwise)"
            else
                echo "No display_rotate setting found, adding it..."
                echo "display_rotate=1" >> "$CONFIG_FILE"
                echo "✓ Added display_rotate=1 to config.txt"
            fi
        fi
    fi
else
    echo "⚠ $CONFIG_FILE not found - this may not be a Raspberry Pi system"
    echo "  Display rotation will need to be configured through your system's display settings"
fi

# Check if we're running on a system with a DSI display
DSI_DISPLAY_CHECK=$(ls /sys/class/drm/card*-DSI-* 2>/dev/null)
if [ -z "$DSI_DISPLAY_CHECK" ]; then
    echo "Warning: No DSI display detected in /sys/class/drm/"
    echo "Proceeding anyway - display might be configured differently"
fi

# Handle touch input configuration
echo ""
echo "Configuring touch input rotation..."

# Check if xinput is available
if ! command -v xinput >/dev/null 2>&1; then
    echo "⚠ xinput not found - touch rotation cannot be configured"
    echo "  Install xinput package or configure touch rotation manually"
else
    echo "Available input devices:"
    xinput --list
    
    echo ""
    echo "Searching for touch input devices..."
    
    # Look for common touch device patterns, including WaveShare and other touchscreens
    TOUCH_DEVICE=$(xinput --list | grep -i -E "(touch|finger|pointer|waveshare|goodix|ft|edt)" | grep -v "Virtual core" | head -1)

    if [ -z "$TOUCH_DEVICE" ]; then
        echo "No obvious touch device found. Looking for all pointer devices..."
        TOUCH_DEVICE=$(xinput --list | grep "slave.*pointer" | grep -v "Virtual core" | head -1)
    fi

    if [ -z "$TOUCH_DEVICE" ]; then
        echo "⚠ No touch input device detected automatically."
        echo ""
        echo "Manual touch rotation command (replace [ID] with your device ID from above):"
        echo "xinput set-prop [ID] \"Coordinate Transformation Matrix\" 0 1 0 -1 0 1 0 0 1"
        echo ""
        echo "You can also run this script with a specific device ID:"
        echo "TOUCH_DEVICE_ID=[ID] $0"
    else
        # Extract device ID from xinput output
        XINPUT_DEVICE_ID=$(echo "$TOUCH_DEVICE" | awk -F 'id=' '{print $2}' | awk '{print $1}')
        DEVICE_NAME=$(echo "$TOUCH_DEVICE" | sed 's/.*\t//' | sed 's/id=.*//' | xargs)

        echo "Found touch device: '$DEVICE_NAME' (ID: $XINPUT_DEVICE_ID)"
        
        # Debug: Show the exact device line that was matched
        echo "Debug - Matched device line: $TOUCH_DEVICE"
        echo "Debug - Extracted ID: $XINPUT_DEVICE_ID"
        
        NEED_TOUCH_CHANGE=true
    fi
    
    # Check for environment variable override
    if [ -n "$TOUCH_DEVICE_ID" ]; then
        echo "Using device ID from environment variable: $TOUCH_DEVICE_ID"
        XINPUT_DEVICE_ID="$TOUCH_DEVICE_ID"
        DEVICE_NAME="Device ID $TOUCH_DEVICE_ID (from environment)"
        NEED_TOUCH_CHANGE=true
    fi
fi

# Apply touch rotation if we found a device
if [ "$NEED_TOUCH_CHANGE" = true ]; then
    echo ""
    echo "Current display configuration:"
    if command -v xrandr >/dev/null 2>&1; then
        xrandr --listmonitors
    else
        echo "xrandr not available"
    fi
    
    echo ""
    echo "Checking device properties for ID $XINPUT_DEVICE_ID..."
    HAS_TRANSFORM_MATRIX=$(xinput list-props "$XINPUT_DEVICE_ID" 2>/dev/null | grep -i "coordinate transformation matrix")

    if [ -z "$HAS_TRANSFORM_MATRIX" ]; then
        echo "⚠ Device $XINPUT_DEVICE_ID does not support Coordinate Transformation Matrix"
        echo "Checking for alternative properties..."
        
        # Try other common transformation properties
        ALT_PROPS=$(xinput list-props "$XINPUT_DEVICE_ID" 2>/dev/null | grep -i -E "(transform|matrix|calibration)")
        if [ -n "$ALT_PROPS" ]; then
            echo "Found alternative properties:"
            echo "$ALT_PROPS"
        fi
        
        echo "This touch device may not support software rotation."
    else
        echo "✓ Device supports Coordinate Transformation Matrix"
        
        # Show current matrix
        echo "Current transformation matrix:"
        xinput list-props "$XINPUT_DEVICE_ID" | grep "Coordinate Transformation Matrix"
        
        # Apply the rotation that we know works
        echo ""
        echo "Applying 90-degree clockwise rotation to touch input..."
        echo "Command: xinput set-prop $XINPUT_DEVICE_ID \"Coordinate Transformation Matrix\" 0 1 0 -1 0 1 0 0 1"
        
        xinput set-prop "$XINPUT_DEVICE_ID" "Coordinate Transformation Matrix" 0 1 0 -1 0 1 0 0 1
        TOUCH_ROTATE=$?

        if [ $TOUCH_ROTATE -eq 0 ]; then
            echo "✓ Touch input rotation applied successfully"
            echo "Touch device '$DEVICE_NAME' should now be synchronized with display rotation"
            
            # Show the matrix after setting
            echo ""
            echo "New transformation matrix:"
            xinput list-props "$XINPUT_DEVICE_ID" | grep "Coordinate Transformation Matrix"
            
            # Create autostart script for persistence across reboots
            create_autostart_script "$XINPUT_DEVICE_ID"
        else
            echo "✗ Failed to apply touch input rotation (exit code: $TOUCH_ROTATE)"
            echo "Try running the command manually:"
            echo "xinput set-prop $XINPUT_DEVICE_ID \"Coordinate Transformation Matrix\" 0 1 0 -1 0 1 0 0 1"
        fi
    fi
fi

# Final verification (only if we have a device ID)
if [ -n "$XINPUT_DEVICE_ID" ]; then
    echo ""
    echo "Final verification - Current coordinate transformation matrix:"
    xinput list-props "$XINPUT_DEVICE_ID" 2>/dev/null | grep "Coordinate Transformation Matrix" || echo "Could not read matrix for device $XINPUT_DEVICE_ID"
fi

echo ""
echo "=========================================="
echo "DSI display rotation configuration complete!"
echo "=========================================="
echo ""
echo "Summary:"
if [ "$NEED_CONFIG_CHANGE" = true ]; then
    if [ "$EUID" -eq 0 ]; then
        echo "✓ Display rotation: Updated in $CONFIG_FILE"
    else
        echo "⚠ Display rotation: Needs manual update in $CONFIG_FILE"
    fi
else
    echo "✓ Display rotation: Already configured"
fi

if [ "$NEED_TOUCH_CHANGE" = true ]; then
    echo "✓ Touch device: '$DEVICE_NAME' (ID: $XINPUT_DEVICE_ID)"
    echo "✓ Touch rotation: Coordinate transformation applied"
else
    echo "⚠ Touch device: Not automatically configured"
fi

echo ""
if [ "$NEED_CONFIG_CHANGE" = true ]; then
    echo "IMPORTANT: A reboot is required for display rotation changes to take effect."
    echo "To reboot now, run: sudo reboot"
    echo "Touch rotation autostart has been configured and will activate after reboot."
else
    echo "Touch rotation should be active immediately and will persist across reboots."
    echo "Test your touch input now to verify it's working correctly."
fi

echo ""
echo "Manual touch rotation commands for testing:"
echo ""
if [ -n "$XINPUT_DEVICE_ID" ]; then
    echo "# 90° clockwise (configured for your device):"
    echo "xinput set-prop $XINPUT_DEVICE_ID \"Coordinate Transformation Matrix\" 0 1 0 -1 0 1 0 0 1"
    echo ""
    echo "# 90° counter-clockwise:" 
    echo "xinput set-prop $XINPUT_DEVICE_ID \"Coordinate Transformation Matrix\" 0 -1 1 1 0 0 0 0 1"
    echo ""
    echo "# 180° rotation:"
    echo "xinput set-prop $XINPUT_DEVICE_ID \"Coordinate Transformation Matrix\" -1 0 1 0 -1 1 0 0 1"
    echo ""
    echo "# Reset to normal:"
    echo "xinput set-prop $XINPUT_DEVICE_ID \"Coordinate Transformation Matrix\" 1 0 0 0 1 0 0 0 1"
else
    echo "# Example commands (replace [ID] with your device ID):"
    echo "xinput set-prop [ID] \"Coordinate Transformation Matrix\" 0 1 0 -1 0 1 0 0 1"
fi
echo ""
echo "Useful commands:"
echo "- List all input devices: xinput --list"
echo "- Check device properties: xinput list-props 6"
echo "- Run this script again: sudo $0"