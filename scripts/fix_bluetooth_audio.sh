#!/bin/bash

# Fix Bluetooth Audio Issues Script
# This script fixes common audio problems after Bluetooth speaker setup
# Run with: sudo ./fix_bluetooth_audio.sh

set -e

echo "=== Bluetooth Audio Fix Script ==="
echo "Fixing audio routing and PulseAudio configuration..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script with sudo"
    exit 1
fi

# Detect the actual user (not root)
REAL_USER=${SUDO_USER:-$(logname 2>/dev/null || echo "")}
if [ -z "$REAL_USER" ] || [ "$REAL_USER" = "root" ]; then
    # Try to find a non-root user with a home directory
    REAL_USER=$(ls /home | head -1)
    if [ -z "$REAL_USER" ]; then
        print_error "Could not detect non-root user. Please specify user manually."
        echo "Usage: REAL_USER=username sudo ./fix_bluetooth_audio.sh"
        exit 1
    fi
fi

print_status "Detected user: $REAL_USER"

# Verify user exists and has home directory
if [ ! -d "/home/$REAL_USER" ]; then
    print_error "User $REAL_USER does not have a home directory at /home/$REAL_USER"
    exit 1
fi

# Stop audio services
print_status "Stopping audio services..."
systemctl stop pulseaudio.service 2>/dev/null || true
killall pulseaudio 2>/dev/null || true
sleep 2

# Reconfigure PulseAudio to use user mode with Bluetooth support
print_status "Reconfiguring PulseAudio for user mode with Bluetooth..."

# Remove system-wide PulseAudio service
systemctl disable pulseaudio.service 2>/dev/null || true
rm -f /etc/systemd/system/pulseaudio.service

# Configure PulseAudio for user mode
cat > /etc/pulse/daemon.conf << 'EOF'
# PulseAudio daemon configuration for user mode
system-instance = no
enable-remixing = yes
remixing-produce-lfe = yes
remixing-consume-lfe = yes
default-sample-format = s16le
default-sample-rate = 44100
default-sample-channels = 2
default-channel-map = front-left,front-right
resample-method = speex-float-1
flat-volumes = no
EOF

# Create user PulseAudio configuration
print_status "Creating user PulseAudio configuration..."
mkdir -p /home/$REAL_USER/.config/pulse

cat > /home/$REAL_USER/.config/pulse/default.pa << 'EOF'
#!/usr/bin/pulseaudio -nF

# Load core modules
.include /etc/pulse/default.pa

# Load Bluetooth modules
load-module module-bluetooth-policy
load-module module-bluetooth-discover

# Set Bluetooth codec preferences (optional, for better quality)
load-module module-bluez5-discover headset=auto

# Automatically switch to Bluetooth when connected
load-module module-switch-on-connect
EOF

# Set ownership for detected user
chown -R $REAL_USER:$REAL_USER /home/$REAL_USER/.config/pulse

# Configure Bluetooth for better audio support
print_status "Updating Bluetooth configuration..."
cat > /etc/bluetooth/main.conf << 'EOF'
[General]
Name = SunriseAlarm-Speaker
Class = 0x200414
DiscoverableTimeout = 0
Discoverable = yes
PairableTimeout = 0
Pairable = yes
AutoConnect = yes
FastConnectable = true
JustWorksRepairing = always
Privacy = device

[Policy]
AutoEnable = true

[A2DP]
Disable = false

[AVRCP]
Disable = false

[HFP]
Disable = true

[HID]
Disable = false

[GATT]
Disable = false
EOF

# Add audio group permissions
print_status "Configuring audio permissions..."
usermod -a -G audio,bluetooth $REAL_USER

# Create PulseAudio auto-start service for detected user
print_status "Setting up PulseAudio auto-start..."
mkdir -p /home/$REAL_USER/.config/systemd/user

cat > /home/$REAL_USER/.config/systemd/user/pulseaudio.service << 'EOF'
[Unit]
Description=PulseAudio Sound Server
Documentation=man:pulseaudio(1)
After=graphical-session.target

[Service]
Type=notify
ExecStart=/usr/bin/pulseaudio --daemonize=no --log-target=journal
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

# Create fallback auto-start script for systems without proper user systemd
cat > /home/$REAL_USER/.config/autostart-pulseaudio.sh << 'EOF'
#!/bin/bash
# Auto-start PulseAudio if not running
if ! pulseaudio --check; then
    pulseaudio --start --log-target=syslog
fi
EOF

chmod +x /home/$REAL_USER/.config/autostart-pulseaudio.sh

# Add to .bashrc for auto-start on login
if ! grep -q "autostart-pulseaudio.sh" /home/$REAL_USER/.bashrc 2>/dev/null; then
    echo "# Auto-start PulseAudio for Bluetooth" >> /home/$REAL_USER/.bashrc
    echo "/home/$REAL_USER/.config/autostart-pulseaudio.sh" >> /home/$REAL_USER/.bashrc
fi

# Set ownership
chown -R $REAL_USER:$REAL_USER /home/$REAL_USER/.config

# Enable user PulseAudio service (with session handling)
print_status "Enabling user PulseAudio service..."

# Set up proper D-Bus environment for the user
export XDG_RUNTIME_DIR="/run/user/$(id -u $REAL_USER)"
if [ ! -d "$XDG_RUNTIME_DIR" ]; then
    mkdir -p "$XDG_RUNTIME_DIR"
    chown $REAL_USER:$REAL_USER "$XDG_RUNTIME_DIR"
    chmod 700 "$XDG_RUNTIME_DIR"
fi

# Try to enable user service, with fallback
if sudo -u $REAL_USER XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" systemctl --user daemon-reload 2>/dev/null; then
    sudo -u $REAL_USER XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" systemctl --user enable pulseaudio.service 2>/dev/null || print_warning "Could not enable user PulseAudio service via systemd"
else
    print_warning "User systemd not available, PulseAudio will auto-start on user login"
fi

# Configure ALSA to use PulseAudio properly
print_status "Configuring ALSA integration..."
cat > /home/$REAL_USER/.asoundrc << 'EOF'
pcm.!default {
    type pulse
    fallback "sysdefault"
    hint {
        show on
        description "Default ALSA Output (currently PulseAudio Sound Server)"
    }
}

ctl.!default {
    type pulse
    fallback "sysdefault"
}
EOF

chown $REAL_USER:$REAL_USER /home/$REAL_USER/.asoundrc

# Create Bluetooth connection handler for proper audio routing
print_status "Creating Bluetooth audio connection handler..."
cat > /usr/local/bin/bluetooth-audio-handler.py << 'EOF'
#!/usr/bin/env python3
import subprocess
import sys
import os
import time

def run_command(cmd):
    """Run a command and return success status"""
    try:
        subprocess.run(cmd, shell=True, check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError:
        return False

def setup_bluetooth_audio():
    """Set up Bluetooth audio routing"""
    # Get the real user from environment
    real_user = os.environ.get('REAL_USER', 'pi')
    
    # Wait for PulseAudio to be ready
    for i in range(10):
        if run_command(f"sudo -u {real_user} pulseaudio --check"):
            break
        time.sleep(1)
        if i == 9:
            print("PulseAudio not ready, starting it...")
            run_command(f"sudo -u {real_user} pulseaudio --start")
            time.sleep(2)
    
    # Load Bluetooth modules if not already loaded
    run_command(f"sudo -u {real_user} pactl load-module module-bluetooth-discover")
    run_command(f"sudo -u {real_user} pactl load-module module-bluetooth-policy")
    
    # Set reasonable volumes
    run_command(f"sudo -u {real_user} pactl set-sink-volume @DEFAULT_SINK@ 70%")
    
    print("Bluetooth audio setup complete")

if __name__ == "__main__":
    setup_bluetooth_audio()
EOF

chmod +x /usr/local/bin/bluetooth-audio-handler.py

# Create systemd service to handle Bluetooth audio on boot
cat > /etc/systemd/system/bluetooth-audio-setup.service << 'EOF'
[Unit]
Description=Bluetooth Audio Setup
After=bluetooth.service graphical-session.target
Wants=bluetooth.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/bluetooth-audio-handler.py
RemainAfterExit=yes
User=root
Environment=REAL_USER=$REAL_USER

[Install]
WantedBy=multi-user.target
EOF

# Enable the new service
systemctl enable bluetooth-audio-setup.service

# Restart Bluetooth service
print_status "Restarting Bluetooth service..."
systemctl restart bluetooth.service

# Start user PulseAudio
print_status "Starting PulseAudio for user..."

# Try to start via systemd first, then fallback to direct start
if ! sudo -u $REAL_USER XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" systemctl --user start pulseaudio.service 2>/dev/null; then
    print_warning "Could not start PulseAudio via systemd, trying direct start..."
    # Kill any existing PulseAudio processes for this user
    sudo -u $REAL_USER killall pulseaudio 2>/dev/null || true
    sleep 1
    # Start PulseAudio directly
    sudo -u $REAL_USER pulseaudio --start --log-target=syslog 2>/dev/null || print_warning "Could not start PulseAudio directly"
fi

# Wait a bit and check status
sleep 3

# Test audio system
print_status "Testing audio configuration..."

# Wait a moment for services to stabilize
sleep 2

# Test PulseAudio
if sudo -u $REAL_USER pulseaudio --check 2>/dev/null; then
    print_status "✓ PulseAudio is running correctly"
    
    # Try to get basic info
    if sudo -u $REAL_USER pactl info >/dev/null 2>&1; then
        print_status "✓ PulseAudio responding to commands"
    else
        print_warning "PulseAudio running but not fully responsive yet"
    fi
else
    print_warning "PulseAudio not currently running - will auto-start on user login"
fi

if systemctl is-active --quiet bluetooth.service; then
    print_status "✓ Bluetooth service is running"
else
    print_error "Bluetooth service is not running"
fi

# Make device discoverable
print_status "Making device discoverable..."
sudo -u $REAL_USER bluetoothctl << 'EOF'
power on
discoverable on
pairable on
EOF

print_status "Audio fix completed!"
print_warning "Please test the following after this script completes:"
echo "1. Test local audio: speaker-test -t wav -c 2"
echo "2. Test Bluetooth: Connect your phone and play music"
echo "3. Check volume controls are working"
echo "4. If issues persist, reboot and try again"

echo ""
echo "=== Troubleshooting Commands ==="
echo "- Check PulseAudio status: sudo -u $REAL_USER pactl info"
echo "- List audio sinks: sudo -u $REAL_USER pactl list sinks short"
echo "- Check Bluetooth status: bluetoothctl show"
echo "- Manual PulseAudio start: sudo -u $REAL_USER pulseaudio --start"
echo "- Check audio devices: aplay -l"

print_status "Fix script completed!"